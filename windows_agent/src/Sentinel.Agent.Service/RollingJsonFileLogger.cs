using System.Collections.Concurrent;
using System.Text.Json;
using Microsoft.Extensions.Logging;

namespace Sentinel.Agent.Service;

public sealed class RollingJsonFileLoggerProvider : ILoggerProvider
{
    private readonly string _logDir;
    private readonly long _maxFileBytes;
    private readonly object _writeLock = new();
    private readonly ConcurrentDictionary<string, RollingJsonFileLogger> _loggers = new();

    public RollingJsonFileLoggerProvider(string logDir, long maxFileBytes = 5 * 1024 * 1024)
    {
        _logDir = logDir;
        _maxFileBytes = maxFileBytes;
        Directory.CreateDirectory(_logDir);
    }

    public ILogger CreateLogger(string categoryName) =>
        _loggers.GetOrAdd(categoryName, name => new RollingJsonFileLogger(name, this));

    internal void WriteEntry(string category, LogLevel level, EventId eventId, string message, Exception? ex)
    {
        var record = new
        {
            ts = DateTimeOffset.UtcNow.ToString("O"),
            level = level.ToString(),
            category,
            eventId = eventId.Id,
            message,
            exception = ex?.GetType().Name,
            exceptionMessage = ex?.Message
        };

        var line = JsonSerializer.Serialize(record) + Environment.NewLine;
        lock (_writeLock)
        {
            try
            {
                var path = Path.Combine(_logDir, $"sentinel-agent-{DateTimeOffset.UtcNow:yyyyMMdd}.jsonl");
                if (File.Exists(path) && new FileInfo(path).Length > _maxFileBytes)
                {
                    var rotated = Path.Combine(_logDir, $"sentinel-agent-{DateTimeOffset.UtcNow:yyyyMMdd-HHmmss}.jsonl");
                    File.Move(path, rotated, overwrite: true);
                    PruneOldLogs();
                }
                File.AppendAllText(path, line);
            }
            catch
            {
                // Logging must never crash the service
            }
        }
    }

    private void PruneOldLogs()
    {
        try
        {
            var files = new DirectoryInfo(_logDir)
                .GetFiles("sentinel-agent-*.jsonl")
                .OrderByDescending(f => f.LastWriteTimeUtc)
                .Skip(10);
            foreach (var f in files) f.Delete();
        }
        catch { }
    }

    public void Dispose() => _loggers.Clear();

    private sealed class RollingJsonFileLogger : ILogger
    {
        private readonly string _category;
        private readonly RollingJsonFileLoggerProvider _provider;

        public RollingJsonFileLogger(string category, RollingJsonFileLoggerProvider provider)
        {
            _category = category;
            _provider = provider;
        }

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => logLevel >= LogLevel.Information;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            if (!IsEnabled(logLevel)) return;
            _provider.WriteEntry(_category, logLevel, eventId, formatter(state, exception), exception);
        }
    }
}
