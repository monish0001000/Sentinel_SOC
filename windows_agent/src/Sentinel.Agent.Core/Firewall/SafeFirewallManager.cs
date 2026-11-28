using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Logging;
using Sentinel.Agent.Core.Models;

namespace Sentinel.Agent.Core.Firewall;

public sealed partial class SafeFirewallManager
{
    public const string RulePrefix = "SentinelSOC_Managed_";
    private readonly AgentConfig _config;
    private readonly ILogger<SafeFirewallManager>? _logger;

    private static readonly HashSet<string> AllowedActions = new(StringComparer.Ordinal)
    {
        "block_ip",
        "unblock_ip",
        "enable_rule",
        "disable_rule",
        "query_status"
    };

    [GeneratedRegex("^[A-Za-z0-9_.-]{1,64}$")]
    private static partial Regex SafeRuleSuffixRegex();

    public SafeFirewallManager(AgentConfig config, ILogger<SafeFirewallManager>? logger = null)
    {
        _config = config;
        _logger = logger;
    }

    public (bool Valid, string Reason) ValidatePolicy(FirewallPolicy policy, string currentEndpointId)
    {
        if (!_config.EnableRemoteFirewallControl)
            return (false, "Remote firewall control is disabled in agent configuration.");

        if (!policy.Approved)
            return (false, "Policy is not approved.");

        if (!string.Equals(policy.TargetEndpointId, currentEndpointId, StringComparison.Ordinal))
            return (false, "Policy targetEndpointId does not match this endpoint.");

        if (policy.ExpiresAt <= DateTimeOffset.UtcNow)
            return (false, "Policy has expired.");

        if (!AllowedActions.Contains(policy.Action))
            return (false, $"Action '{policy.Action}' is not in the strict allowlist.");

        if (policy.Action is "block_ip" or "unblock_ip")
        {
            if (string.IsNullOrWhiteSpace(policy.TargetIp))
                return (false, "Target IP is required.");
            if (!IsAllowedTargetIp(policy.TargetIp, _config.AllowLabPrivateIpExceptions, out var ipReason))
                return (false, ipReason);
        }

        if (policy.Action is "enable_rule" or "disable_rule")
        {
            if (string.IsNullOrWhiteSpace(policy.RuleName) || !SafeRuleSuffixRegex().IsMatch(policy.RuleName))
                return (false, "Invalid managed rule name.");
        }

        return (true, "Valid");
    }

    public static bool IsAllowedTargetIp(string rawIp, bool allowLabPrivate, out string reason)
    {
        if (!IPAddress.TryParse(rawIp, out var ip))
        {
            reason = "Invalid IP address syntax.";
            return false;
        }

        if (ip.Equals(IPAddress.Any) || ip.Equals(IPAddress.IPv6Any) || ip.Equals(IPAddress.Broadcast) || IPAddress.IsLoopback(ip))
        {
            reason = "Wildcard, broadcast, and loopback addresses are forbidden.";
            return false;
        }

        if (ip.IsIPv6LinkLocal || ip.IsIPv6Multicast || ip.IsIPv6SiteLocal)
        {
            reason = "Link-local, site-local, and multicast IPv6 addresses are forbidden.";
            return false;
        }

        if (ip.AddressFamily == AddressFamily.InterNetwork)
        {
            var b = ip.GetAddressBytes();
            if (b[0] == 0 || b[0] == 127 || b[0] >= 224)
            {
                reason = "Reserved/multicast/loopback IPv4 range is forbidden.";
                return false;
            }
            if (b[0] == 169 && b[1] == 254)
            {
                reason = "Link-local IPv4 range (169.254.0.0/16) is forbidden.";
                return false;
            }
            bool isPrivate = b[0] == 10 || (b[0] == 172 && b[1] >= 16 && b[1] <= 31) || (b[0] == 192 && b[1] == 168);
            if (isPrivate && !allowLabPrivate)
            {
                reason = "Private RFC1918 IPv4 addresses are blocked unless lab exception is explicitly enabled.";
                return false;
            }
        }

        reason = "OK";
        return true;
    }

    public async Task<PolicyAck> ExecutePolicyAsync(FirewallPolicy policy, string currentEndpointId, CancellationToken ct)
    {
        var (valid, reason) = ValidatePolicy(policy, currentEndpointId);
        if (!valid)
        {
            var state = policy.ExpiresAt <= DateTimeOffset.UtcNow ? "expired" : "rejected";
            return new PolicyAck
            {
                AckId = $"{policy.PolicyId}_{state}",
                PolicyId = policy.PolicyId,
                EndpointId = currentEndpointId,
                State = state,
                Message = reason,
                AcknowledgedAt = DateTimeOffset.UtcNow
            };
        }

        try
        {
            string message = policy.Action switch
            {
                "block_ip" => await AddBlockRuleAsync(policy.TargetIp!, ct),
                "unblock_ip" => await RemoveBlockRuleAsync(policy.TargetIp!, ct),
                "enable_rule" => await SetRuleEnabledAsync(policy.RuleName!, true, ct),
                "disable_rule" => await SetRuleEnabledAsync(policy.RuleName!, false, ct),
                "query_status" => await QueryManagedRulesAsync(ct),
                _ => throw new InvalidOperationException("Unsupported action")
            };

            return new PolicyAck
            {
                AckId = $"{policy.PolicyId}_applied",
                PolicyId = policy.PolicyId,
                EndpointId = currentEndpointId,
                State = "applied",
                Message = message,
                AcknowledgedAt = DateTimeOffset.UtcNow
            };
        }
        catch (Exception ex)
        {
            _logger?.LogError(ex, "Failed to apply firewall policy {PolicyId}", policy.PolicyId);
            return new PolicyAck
            {
                AckId = $"{policy.PolicyId}_failed",
                PolicyId = policy.PolicyId,
                EndpointId = currentEndpointId,
                State = "failed",
                Message = ex.Message,
                AcknowledgedAt = DateTimeOffset.UtcNow
            };
        }
    }

    private static string BuildRuleNameForIp(string ip) =>
        $"{RulePrefix}Block_{ip.Replace(':', '_').Replace('.', '_')}";

    private static Task<string> AddBlockRuleAsync(string ip, CancellationToken ct)
    {
        var ruleName = BuildRuleNameForIp(ip);
        return RunNetshAsync(new[]
        {
            "advfirewall", "firewall", "add", "rule",
            $"name={ruleName}", "dir=out", "action=block", $"remoteip={ip}", "enable=yes"
        }, ct);
    }

    private static Task<string> RemoveBlockRuleAsync(string ip, CancellationToken ct)
    {
        var ruleName = BuildRuleNameForIp(ip);
        return RunNetshAsync(new[]
        {
            "advfirewall", "firewall", "delete", "rule", $"name={ruleName}"
        }, ct);
    }

    private static Task<string> SetRuleEnabledAsync(string suffix, bool enabled, CancellationToken ct)
    {
        var ruleName = suffix.StartsWith(RulePrefix, StringComparison.Ordinal) ? suffix : $"{RulePrefix}{suffix}";
        return RunNetshAsync(new[]
        {
            "advfirewall", "firewall", "set", "rule", $"name={ruleName}", "new", $"enable={(enabled ? "yes" : "no")}"
        }, ct);
    }

    private static Task<string> QueryManagedRulesAsync(CancellationToken ct) =>
        RunNetshAsync(new[] { "advfirewall", "firewall", "show", "rule", "name=all", "dir=out" }, ct);

    private static async Task<string> RunNetshAsync(IEnumerable<string> args, CancellationToken ct)
    {
        var psi = new ProcessStartInfo
        {
            FileName = Path.Combine(Environment.SystemDirectory, "netsh.exe"),
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true
        };
        foreach (var a in args)
            psi.ArgumentList.Add(a);

        using var proc = Process.Start(psi) ?? throw new InvalidOperationException("Failed to start netsh.exe");
        var stdout = await proc.StandardOutput.ReadToEndAsync(ct);
        var stderr = await proc.StandardError.ReadToEndAsync(ct);
        await proc.WaitForExitAsync(ct);

        if (proc.ExitCode != 0)
            throw new InvalidOperationException($"netsh exited {proc.ExitCode}: {stderr} {stdout}".Trim());

        return string.IsNullOrWhiteSpace(stdout) ? "OK" : stdout.Trim()[..Math.Min(stdout.Trim().Length, 400)];
    }
}
