using System.Security.Cryptography;

namespace Sentinel.Agent.Core.Sync;

public sealed class BackoffPolicy
{
    private readonly TimeSpan _baseDelay;
    private readonly TimeSpan _maxDelay;
    private int _consecutiveFailures;

    public BackoffPolicy(TimeSpan? baseDelay = null, TimeSpan? maxDelay = null)
    {
        _baseDelay = baseDelay ?? TimeSpan.FromSeconds(5);
        _maxDelay = maxDelay ?? TimeSpan.FromMinutes(10);
    }

    public int ConsecutiveFailures => _consecutiveFailures;

    public void RecordSuccess() => _consecutiveFailures = 0;

    public TimeSpan RecordFailureAndGetDelay()
    {
        _consecutiveFailures = Math.Min(_consecutiveFailures + 1, 20);
        return ComputeDelay(_consecutiveFailures);
    }

    public TimeSpan ComputeDelay(int attempt)
    {
        var expSeconds = _baseDelay.TotalSeconds * Math.Pow(2, Math.Clamp(attempt - 1, 0, 12));
        var cappedSeconds = Math.Min(expSeconds, _maxDelay.TotalSeconds);

        // Randomized jitter in [0.75, 1.25] to prevent thundering herd
        var jitterFactor = 0.75 + (RandomNumberGenerator.GetInt32(0, 500) / 1000.0);
        return TimeSpan.FromSeconds(cappedSeconds * jitterFactor);
    }
}
