using Sentinel.Agent.Core.Firewall;
using Sentinel.Agent.Core.Models;
using Sentinel.Agent.Core.Sync;
using Xunit;

namespace Sentinel.Agent.Tests;

public sealed class FirewallAndBackoffTests
{
    [Theory]
    [InlineData("127.0.0.1", false, false)]
    [InlineData("::1", false, false)]
    [InlineData("0.0.0.0", false, false)]
    [InlineData("169.254.10.5", false, false)]
    [InlineData("224.0.0.1", false, false)]
    [InlineData("255.255.255.255", false, false)]
    [InlineData("192.168.1.10", false, false)]
    [InlineData("10.0.0.5", false, false)]
    [InlineData("192.168.1.10", true, true)]
    [InlineData("203.0.113.50", false, true)]
    [InlineData("2001:db8::1", false, true)]
    [InlineData("8.8.8.8 & calc.exe", false, false)]
    public void IsAllowedTargetIp_Validates_Strictly(string ip, bool allowLabPrivate, bool expectedValid)
    {
        var actual = SafeFirewallManager.IsAllowedTargetIp(ip, allowLabPrivate, out _);
        Assert.Equal(expectedValid, actual);
    }

    [Fact]
    public void ValidatePolicy_Rejects_Disabled_Expired_Unapproved_And_Arbitrary_Actions()
    {
        var cfg = new AgentConfig { EnableRemoteFirewallControl = false };
        var disabledMgr = new SafeFirewallManager(cfg);

        var validPolicy = new FirewallPolicy
        {
            PolicyId = "pol-1",
            TargetEndpointId = "ep-1",
            Action = "block_ip",
            TargetIp = "203.0.113.50",
            Approved = true,
            ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(30)
        };

        Assert.False(disabledMgr.ValidatePolicy(validPolicy, "ep-1").Valid);

        cfg.EnableRemoteFirewallControl = true;
        var mgr = new SafeFirewallManager(cfg);
        Assert.True(mgr.ValidatePolicy(validPolicy, "ep-1").Valid);
        Assert.False(mgr.ValidatePolicy(validPolicy, "ep-other").Valid);

        var expired = new FirewallPolicy
        {
            PolicyId = "pol-2",
            TargetEndpointId = "ep-1",
            Action = "block_ip",
            TargetIp = "203.0.113.50",
            Approved = true,
            ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(-1)
        };
        Assert.False(mgr.ValidatePolicy(expired, "ep-1").Valid);

        var arbitraryShell = new FirewallPolicy
        {
            PolicyId = "pol-3",
            TargetEndpointId = "ep-1",
            Action = "powershell",
            Approved = true,
            ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(10)
        };
        Assert.False(mgr.ValidatePolicy(arbitraryShell, "ep-1").Valid);

        var syncNow = new FirewallPolicy
        {
            PolicyId = "pol-4",
            TargetEndpointId = "ep-1",
            Action = "sync_now",
            Approved = true,
            ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(10)
        };
        Assert.True(disabledMgr.ValidatePolicy(syncNow, "ep-1").Valid);

        var unenroll = new FirewallPolicy
        {
            PolicyId = "pol-5",
            TargetEndpointId = "ep-1",
            Action = "unenroll_agent",
            Approved = true,
            ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(10)
        };
        Assert.True(disabledMgr.ValidatePolicy(unenroll, "ep-1").Valid);
    }

    [Fact]
    public void BackoffPolicy_Grows_Exponentially_And_Resets_On_Success()
    {
        var backoff = new BackoffPolicy(TimeSpan.FromSeconds(5), TimeSpan.FromSeconds(60));
        var d1 = backoff.RecordFailureAndGetDelay();
        var d2 = backoff.RecordFailureAndGetDelay();
        var d3 = backoff.RecordFailureAndGetDelay();

        Assert.InRange(d1.TotalSeconds, 3.5, 6.5);
        Assert.InRange(d2.TotalSeconds, 7.0, 13.0);
        Assert.InRange(d3.TotalSeconds, 14.0, 26.0);

        backoff.RecordSuccess();
        Assert.Equal(0, backoff.ConsecutiveFailures);
    }
}
