using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Sentinel.Agent.Core.Collectors;
using Sentinel.Agent.Core.Firebase;
using Sentinel.Agent.Core.Models;
using Xunit;

namespace Sentinel.Agent.Tests;

public sealed class FirebaseEmulatorIntegrationTests
{
    private static bool ShouldRun =>
        string.Equals(Environment.GetEnvironmentVariable("SENTINEL_RUN_EMULATOR_TESTS"), "1", StringComparison.Ordinal);

    [Fact]
    public async Task EndToEnd_Enrollment_IdempotentUpload_And_CrossEndpointIsolation()
    {
        if (!ShouldRun)
        {
            return; // Skipped unless Firebase Emulator Suite is running with SENTINEL_RUN_EMULATOR_TESTS=1
        }

        const string projectId = "sentinel-soc-emu-test";
        const string apiKey = "fake-api-key";
        const string authHost = "127.0.0.1:9099";
        const string fsHost = "127.0.0.1:8080";

        var cfg = new AgentConfig
        {
            FirebaseProjectId = projectId,
            FirebaseWebApiKey = apiKey,
            AuthEmulatorHost = authHost,
            FirestoreEmulatorHost = fsHost
        };

        using var http = new HttpClient();
        using var ownerClient = new FirebaseClient(cfg);
        var (ownerUid, _, ownerIdToken) = await ownerClient.SignInAnonymouslyAsync(CancellationToken.None);
        cfg.OwnerUid = ownerUid;

        // 1. Owner creates a one-time enrollment token
        var pairingToken = "test-pairing-token-" + Guid.NewGuid().ToString("N");
        var tokenHash = FirebaseClient.ComputeSha256Hex(pairingToken);
        var enrollUrl = $"http://{fsHost}/v1/projects/{projectId}/databases/(default)/documents/enrollments?documentId={tokenHash}";

        var enrollDoc = new
        {
            fields = new
            {
                ownerUid = new { stringValue = ownerUid },
                createdAt = new { timestampValue = DateTimeOffset.UtcNow.UtcDateTime.ToString("O") },
                expiresAt = new { timestampValue = DateTimeOffset.UtcNow.AddMinutes(10).UtcDateTime.ToString("O") },
                used = new { booleanValue = false },
                claimedByAgentUid = new { nullValue = (string?)null },
                claimedEndpointId = new { nullValue = (string?)null }
            }
        };

        using (var req = new HttpRequestMessage(HttpMethod.Post, enrollUrl)
        {
            Content = new StringContent(JsonSerializer.Serialize(enrollDoc), Encoding.UTF8, "application/json")
        })
        {
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", ownerIdToken);
            var resp = await http.SendAsync(req);
            resp.EnsureSuccessStatusCode();
        }

        // 2. Agent enrolls and claims token
        using var agentClient = new FirebaseClient(cfg);
        var endpointId = Guid.NewGuid().ToString("N");
        var identity = await agentClient.EnrollEndpointAsync(endpointId, pairingToken, "Windows 11", "1.0.0", CancellationToken.None);
        var agentIdToken = await agentClient.EnsureValidIdTokenAsync(identity, null, CancellationToken.None);

        // 3. Reusing the same pairing token MUST be rejected by Firestore Security Rules
        using var rogueClient = new FirebaseClient(cfg);
        await Assert.ThrowsAsync<FirebaseAuthException>(() =>
            rogueClient.EnrollEndpointAsync(Guid.NewGuid().ToString("N"), pairingToken, "Windows 11", "1.0.0", CancellationToken.None));

        // 4. Agent uploads heartbeat & idempotent telemetry sample twice (second succeeds via 409 idempotency)
        var collector = new SystemTelemetryCollector();
        var snap = collector.Collect(endpointId);
        await agentClient.UploadHeartbeatAsync(identity, agentIdToken, snap, 0, AgentSyncStates.Synced, CancellationToken.None);
        await agentClient.UploadTelemetrySampleAsync(identity, agentIdToken, snap, CancellationToken.None);
        await agentClient.UploadTelemetrySampleAsync(identity, agentIdToken, snap, CancellationToken.None);

        // 5. Second unauthorized agent CANNOT write to first endpoint's telemetry
        var (rogueUid, rogueRefresh, rogueToken) = await rogueClient.SignInAnonymouslyAsync(CancellationToken.None);
        var rogueIdentity = new AgentIdentity
        {
            EndpointId = endpointId,
            OwnerUid = ownerUid,
            AgentUid = rogueUid,
            RefreshToken = rogueRefresh
        };
        var forgedSnap = collector.Collect(endpointId);
        await Assert.ThrowsAsync<FirebaseAuthException>(() =>
            rogueClient.UploadTelemetrySampleAsync(rogueIdentity, rogueToken, forgedSnap, CancellationToken.None));
    }
}
