using System.Net;
using System.Net.Http.Headers;
using System.Security.Authentication;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Sentinel.Agent.Core.Models;

namespace Sentinel.Agent.Core.Firebase;

public sealed class FirebaseClient : IDisposable
{
    private readonly AgentConfig _config;
    private readonly HttpClient _http;
    private readonly ILogger<FirebaseClient>? _logger;

    private string? _idToken;
    private DateTimeOffset _idTokenExpiresAt = DateTimeOffset.MinValue;

    public FirebaseClient(AgentConfig config, ILogger<FirebaseClient>? logger = null, HttpMessageHandler? customHandler = null)
    {
        _config = config;
        _logger = logger;

        var handler = customHandler ?? new SocketsHttpHandler
        {
            SslOptions = new System.Net.Security.SslClientAuthenticationOptions
            {
                EnabledSslProtocols = SslProtocols.Tls12 | SslProtocols.Tls13
            },
            PooledConnectionLifetime = TimeSpan.FromMinutes(5)
        };

        _http = new HttpClient(handler)
        {
            Timeout = TimeSpan.FromSeconds(15)
        };
    }

    private string AuthBaseUrl => string.IsNullOrWhiteSpace(_config.AuthEmulatorHost)
        ? "https://identitytoolkit.googleapis.com"
        : $"http://{_config.AuthEmulatorHost}/identitytoolkit.googleapis.com";

    private string TokenBaseUrl => string.IsNullOrWhiteSpace(_config.AuthEmulatorHost)
        ? "https://securetoken.googleapis.com"
        : $"http://{_config.AuthEmulatorHost}/securetoken.googleapis.com";

    private string FirestoreBaseUrl => string.IsNullOrWhiteSpace(_config.FirestoreEmulatorHost)
        ? $"https://firestore.googleapis.com/v1/projects/{_config.FirebaseProjectId}/databases/(default)/documents"
        : $"http://{_config.FirestoreEmulatorHost}/v1/projects/{_config.FirebaseProjectId}/databases/(default)/documents";

    public static string ComputeSha256Hex(string input)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(input));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }

    public async Task<(string AgentUid, string RefreshToken, string IdToken)> SignInAnonymouslyAsync(CancellationToken ct)
    {
        var url = $"{AuthBaseUrl}/v1/accounts:signUp?key={Uri.EscapeDataString(_config.FirebaseWebApiKey)}";
        using var content = new StringContent("{\"returnSecureToken\":true}", Encoding.UTF8, "application/json");
        using var resp = await _http.PostAsync(url, content, ct);
        var body = await resp.Content.ReadAsStringAsync(ct);

        if (!resp.IsSuccessStatusCode)
            throw new FirebaseAuthException($"Anonymous sign-in failed ({(int)resp.StatusCode}): {body}");

        using var doc = JsonDocument.Parse(body);
        var root = doc.RootElement;
        var uid = root.GetProperty("localId").GetString()!;
        var refresh = root.GetProperty("refreshToken").GetString()!;
        var idToken = root.GetProperty("idToken").GetString()!;
        var expiresIn = int.TryParse(root.GetProperty("expiresIn").GetString(), out var sec) ? sec : 3600;

        _idToken = idToken;
        _idTokenExpiresAt = DateTimeOffset.UtcNow.AddSeconds(expiresIn - 60);
        return (uid, refresh, idToken);
    }

    public async Task<string> EnsureValidIdTokenAsync(AgentIdentity identity, Action<AgentIdentity>? onRotated, CancellationToken ct)
    {
        if (!string.IsNullOrEmpty(_idToken) && DateTimeOffset.UtcNow < _idTokenExpiresAt)
            return _idToken;

        var url = $"{TokenBaseUrl}/v1/token?key={Uri.EscapeDataString(_config.FirebaseWebApiKey)}";
        var form = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["grant_type"] = "refresh_token",
            ["refresh_token"] = identity.RefreshToken
        });

        using var resp = await _http.PostAsync(url, form, ct);
        var body = await resp.Content.ReadAsStringAsync(ct);

        if (!resp.IsSuccessStatusCode)
        {
            if (resp.StatusCode is HttpStatusCode.BadRequest or HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
                throw new FirebaseAuthException($"Refresh token rejected ({(int)resp.StatusCode})");
            throw new HttpRequestException($"Token refresh transient error ({(int)resp.StatusCode})");
        }

        using var doc = JsonDocument.Parse(body);
        var root = doc.RootElement;
        _idToken = root.GetProperty("id_token").GetString()!;
        var newRefresh = root.GetProperty("refresh_token").GetString()!;
        var expiresIn = int.TryParse(root.GetProperty("expires_in").GetString(), out var sec) ? sec : 3600;
        _idTokenExpiresAt = DateTimeOffset.UtcNow.AddSeconds(expiresIn - 60);

        if (!string.Equals(newRefresh, identity.RefreshToken, StringComparison.Ordinal))
        {
            identity.RefreshToken = newRefresh;
            onRotated?.Invoke(identity);
        }

        return _idToken;
    }

    public async Task<AgentIdentity> EnrollEndpointAsync(string endpointId, string pairingToken, string osVersion, string agentVersion, CancellationToken ct)
    {
        var tokenHash = ComputeSha256Hex(pairingToken);
        var (agentUid, refreshToken, idToken) = await SignInAnonymouslyAsync(ct);

        // 1. Atomically claim single-use enrollment token
        var claimUrl = $"{FirestoreBaseUrl}/enrollments/{Uri.EscapeDataString(tokenHash)}" +
                       "?updateMask.fieldPaths=used&updateMask.fieldPaths=claimedByAgentUid&updateMask.fieldPaths=claimedEndpointId&currentDocument.exists=true";

        var claimPayload = new
        {
            fields = new
            {
                used = BoolVal(true),
                claimedByAgentUid = StringVal(agentUid),
                claimedEndpointId = StringVal(endpointId)
            }
        };

        await SendFirestoreRequestAsync(HttpMethod.Patch, claimUrl, idToken, claimPayload, ct);

        // 2. Create endpoint document bound to this agentUid & enrollmentTokenHash
        var endpointUrl = $"{FirestoreBaseUrl}/users/{Uri.EscapeDataString(_config.OwnerUid)}/endpoints?documentId={Uri.EscapeDataString(endpointId)}";
        var endpointPayload = new
        {
            fields = new
            {
                endpointId = StringVal(endpointId),
                ownerUid = StringVal(_config.OwnerUid),
                agentUid = StringVal(agentUid),
                enrollmentTokenHash = StringVal(tokenHash),
                hostname = StringVal(Environment.MachineName),
                osVersion = StringVal(osVersion),
                agentVersion = StringVal(agentVersion),
                revoked = BoolVal(false),
                status = StringVal(AgentHealthStates.Online),
                healthState = StringVal(AgentHealthStates.Online),
                syncState = StringVal(AgentSyncStates.Synced),
                lastSeenAt = TimestampVal(DateTimeOffset.UtcNow)
            }
        };

        await SendFirestoreRequestAsync(HttpMethod.Post, endpointUrl, idToken, endpointPayload, ct);

        return new AgentIdentity
        {
            EndpointId = endpointId,
            OwnerUid = _config.OwnerUid,
            AgentUid = agentUid,
            RefreshToken = refreshToken,
            EnrollmentTokenHash = tokenHash,
            EnrolledAt = DateTimeOffset.UtcNow
        };
    }

    public async Task UploadHeartbeatAsync(AgentIdentity identity, string idToken, SystemTelemetrySnapshot snap, int pendingQueueCount, string syncState, CancellationToken ct)
    {
        var mask = string.Join("&", new[]
        {
            "hostname", "osVersion", "osBuild", "agentVersion", "lastSeenAt",
            "uptimeSeconds", "status", "healthState", "syncState",
            "pendingQueueCount", "latestMetrics", "activeConnections", "firewallEnabled", "agentIntegrityHash"
        }.Select(f => $"updateMask.fieldPaths={f}"));

        var url = $"{FirestoreBaseUrl}/users/{Uri.EscapeDataString(identity.OwnerUid)}/endpoints/{Uri.EscapeDataString(identity.EndpointId)}?{mask}";

        var connectionValues = snap.ActiveConnections
            .Take(25)
            .Select(c => new
            {
                mapValue = new
                {
                    fields = new
                    {
                        protocol = StringVal(c.Protocol),
                        localAddress = StringVal(c.LocalAddress),
                        localPort = IntVal(c.LocalPort),
                        remoteAddress = StringVal(c.RemoteAddress),
                        remotePort = IntVal(c.RemotePort),
                        remoteHost = StringVal(c.RemoteHost ?? string.Empty),
                        state = StringVal(c.State),
                        processId = IntVal(c.ProcessId ?? 0),
                        processName = StringVal(c.ProcessName ?? string.Empty)
                    }
                }
            })
            .ToArray();

        var payload = new
        {
            fields = new
            {
                hostname = StringVal(snap.Hostname),
                osVersion = StringVal(snap.OsVersion),
                osBuild = StringVal(snap.OsBuild),
                agentVersion = StringVal(snap.AgentVersion),
                agentIntegrityHash = StringVal(snap.AgentIntegrityHash),
                lastSeenAt = TimestampVal(snap.CapturedAt),
                uptimeSeconds = IntVal(snap.UptimeSeconds),
                status = StringVal(AgentHealthStates.Online),
                healthState = StringVal(AgentHealthStates.Online),
                syncState = StringVal(syncState),
                pendingQueueCount = IntVal(pendingQueueCount),
                firewallEnabled = BoolVal(snap.FirewallEnabled),
                activeConnections = new
                {
                    arrayValue = new
                    {
                        values = connectionValues
                    }
                },
                latestMetrics = new
                {
                    mapValue = new
                    {
                        fields = new
                        {
                            cpuPercent = DoubleVal(snap.CpuPercent),
                            memoryPercent = DoubleVal(snap.MemoryPercent),
                            memoryUsedMb = IntVal(snap.MemoryUsedMb),
                            memoryTotalMb = IntVal(snap.MemoryTotalMb),
                            diskPercent = DoubleVal(snap.DiskPercent),
                            diskFreeGb = IntVal(snap.DiskFreeGb),
                            diskTotalGb = IntVal(snap.DiskTotalGb),
                            processCount = IntVal(snap.ProcessCount),
                            networkTxBytesPerSec = IntVal(snap.NetworkBytesSentPerSec),
                            networkRxBytesPerSec = IntVal(snap.NetworkBytesReceivedPerSec)
                        }
                    }
                }
            }
        };

        await SendFirestoreRequestAsync(HttpMethod.Patch, url, idToken, payload, ct);
    }

    public async Task UploadTelemetrySampleAsync(AgentIdentity identity, string idToken, SystemTelemetrySnapshot snap, CancellationToken ct)
    {
        var url = $"{FirestoreBaseUrl}/users/{Uri.EscapeDataString(identity.OwnerUid)}/endpoints/{Uri.EscapeDataString(identity.EndpointId)}/telemetry?documentId={Uri.EscapeDataString(snap.IdempotencyKey)}";
        var payload = new
        {
            fields = new
            {
                endpointId = StringVal(snap.EndpointId),
                idempotencyKey = StringVal(snap.IdempotencyKey),
                capturedAt = TimestampVal(snap.CapturedAt),
                cpuPercent = DoubleVal(snap.CpuPercent),
                memoryPercent = DoubleVal(snap.MemoryPercent),
                diskPercent = DoubleVal(snap.DiskPercent),
                uptimeSeconds = IntVal(snap.UptimeSeconds),
                processCount = IntVal(snap.ProcessCount),
                networkTxBytesPerSec = IntVal(snap.NetworkBytesSentPerSec),
                networkRxBytesPerSec = IntVal(snap.NetworkBytesReceivedPerSec)
            }
        };

        await SendFirestoreCreateIdempotentAsync(url, idToken, payload, ct);
    }

    public async Task UploadAlertAsync(AgentIdentity identity, string idToken, SecurityAlert alert, CancellationToken ct)
    {
        var url = $"{FirestoreBaseUrl}/users/{Uri.EscapeDataString(identity.OwnerUid)}/endpoints/{Uri.EscapeDataString(identity.EndpointId)}/alerts?documentId={Uri.EscapeDataString(alert.IdempotencyKey)}";
        var evidenceFields = alert.Evidence.ToDictionary(kv => kv.Key, kv => (object)StringVal(kv.Value));

        var payload = new
        {
            fields = new
            {
                endpointId = StringVal(alert.EndpointId),
                idempotencyKey = StringVal(alert.IdempotencyKey),
                ruleId = StringVal(alert.RuleId),
                ruleVersion = StringVal(alert.RuleVersion),
                severity = StringVal(alert.Severity),
                eventTime = TimestampVal(alert.EventTime),
                reason = StringVal(alert.Reason.Length > 1000 ? alert.Reason[..1000] : alert.Reason),
                confidenceNotes = StringVal(alert.ConfidenceNotes),
                enforced = BoolVal(alert.Enforced),
                status = StringVal(alert.Status),
                evidence = new { mapValue = new { fields = evidenceFields } }
            }
        };

        await SendFirestoreCreateIdempotentAsync(url, idToken, payload, ct);
    }

    public async Task UploadPolicyAckAsync(AgentIdentity identity, string idToken, PolicyAck ack, CancellationToken ct)
    {
        var url = $"{FirestoreBaseUrl}/users/{Uri.EscapeDataString(identity.OwnerUid)}/endpoints/{Uri.EscapeDataString(identity.EndpointId)}/policyAcks?documentId={Uri.EscapeDataString(ack.AckId)}";
        var payload = new
        {
            fields = new
            {
                endpointId = StringVal(ack.EndpointId),
                policyId = StringVal(ack.PolicyId),
                state = StringVal(ack.State),
                message = StringVal(ack.Message),
                acknowledgedAt = TimestampVal(ack.AcknowledgedAt)
            }
        };

        await SendFirestoreCreateIdempotentAsync(url, idToken, payload, ct);
    }

    public async Task<List<FirewallPolicy>> FetchPoliciesAsync(AgentIdentity identity, string idToken, CancellationToken ct)
    {
        var url = $"{FirestoreBaseUrl}/users/{Uri.EscapeDataString(identity.OwnerUid)}/endpoints/{Uri.EscapeDataString(identity.EndpointId)}/policies?pageSize=25";
        using var req = new HttpRequestMessage(HttpMethod.Get, url);
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", idToken);

        using var resp = await _http.SendAsync(req, ct);
        if (!resp.IsSuccessStatusCode)
        {
            if (resp.StatusCode == HttpStatusCode.Unauthorized)
                throw new FirebaseAuthException("Unauthorized fetching policies.");
            return new();
        }

        var json = await resp.Content.ReadAsStringAsync(ct);
        using var doc = JsonDocument.Parse(json);
        if (!doc.RootElement.TryGetProperty("documents", out var docs))
            return new();

        var policies = new List<FirewallPolicy>();
        foreach (var d in docs.EnumerateArray())
        {
            try
            {
                var name = d.GetProperty("name").GetString()!;
                var policyId = name.Split('/').Last();
                var f = d.GetProperty("fields");

                policies.Add(new FirewallPolicy
                {
                    PolicyId = policyId,
                    TargetEndpointId = GetStr(f, "targetEndpointId"),
                    Action = GetStr(f, "action"),
                    TargetIp = GetOptStr(f, "targetIp"),
                    Direction = GetOptStr(f, "direction") ?? "Outbound",
                    RuleName = GetOptStr(f, "ruleName"),
                    Reason = GetStr(f, "reason"),
                    CreatedBy = GetStr(f, "createdBy"),
                    Approved = GetBool(f, "approved"),
                    ExpiresAt = GetTime(f, "expiresAt"),
                    CreatedAt = GetTime(f, "createdAt")
                });
            }
            catch (Exception ex)
            {
                _logger?.LogDebug(ex, "Skipping malformed policy document");
            }
        }
        return policies;
    }

    private async Task SendFirestoreCreateIdempotentAsync(string url, string idToken, object payload, CancellationToken ct)
    {
        var json = JsonSerializer.Serialize(payload);
        using var req = new HttpRequestMessage(HttpMethod.Post, url)
        {
            Content = new StringContent(json, Encoding.UTF8, "application/json")
        };
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", idToken);

        using var resp = await _http.SendAsync(req, ct);
        if (resp.IsSuccessStatusCode || resp.StatusCode == HttpStatusCode.Conflict)
            return; // 409 ALREADY_EXISTS => idempotent success!

        var body = await resp.Content.ReadAsStringAsync(ct);
        if (resp.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
            throw new FirebaseAuthException($"Firestore rejected write ({(int)resp.StatusCode}): {body}");

        throw new HttpRequestException($"Firestore write failed ({(int)resp.StatusCode}): {body}");
    }

    private async Task SendFirestoreRequestAsync(HttpMethod method, string url, string idToken, object payload, CancellationToken ct)
    {
        var json = JsonSerializer.Serialize(payload);
        using var req = new HttpRequestMessage(method, url)
        {
            Content = new StringContent(json, Encoding.UTF8, "application/json")
        };
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", idToken);

        using var resp = await _http.SendAsync(req, ct);
        if (resp.IsSuccessStatusCode) return;

        var body = await resp.Content.ReadAsStringAsync(ct);
        if (resp.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
            throw new FirebaseAuthException($"Firestore auth/rules error ({(int)resp.StatusCode}): {body}");

        throw new HttpRequestException($"Firestore request failed ({(int)resp.StatusCode}): {body}");
    }

    private static object StringVal(string v) => new { stringValue = v };
    private static object BoolVal(bool v) => new { booleanValue = v };
    private static object IntVal(long v) => new { integerValue = v.ToString() };
    private static object DoubleVal(double v) => new { doubleValue = v };
    private static object TimestampVal(DateTimeOffset v) => new { timestampValue = v.UtcDateTime.ToString("O") };

    private static string GetStr(JsonElement f, string key) =>
        f.TryGetProperty(key, out var p) && p.TryGetProperty("stringValue", out var sv) ? sv.GetString() ?? "" : "";

    private static string? GetOptStr(JsonElement f, string key) =>
        f.TryGetProperty(key, out var p) && p.TryGetProperty("stringValue", out var sv) ? sv.GetString() : null;

    private static bool GetBool(JsonElement f, string key) =>
        f.TryGetProperty(key, out var p) && p.TryGetProperty("booleanValue", out var bv) && bv.GetBoolean();

    private static DateTimeOffset GetTime(JsonElement f, string key) =>
        f.TryGetProperty(key, out var p) && p.TryGetProperty("timestampValue", out var tv) && DateTimeOffset.TryParse(tv.GetString(), out var dt)
            ? dt
            : DateTimeOffset.MinValue;

    public void Dispose() => _http.Dispose();
}

public sealed class FirebaseAuthException : Exception
{
    public FirebaseAuthException(string message) : base(message) { }
}
