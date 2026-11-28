using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Logging;
using Sentinel.Agent.Core.Models;

namespace Sentinel.Agent.Core.Storage;

public sealed class DurableQueueStore : IDisposable
{
    private readonly string _dbPath;
    private readonly int _maxItems;
    private readonly long _maxDbBytes;
    private readonly long _minFreeDiskBytes;
    private readonly ILogger<DurableQueueStore>? _logger;
    private readonly object _lock = new();

    public DurableQueueStore(
        string dbPath,
        int maxItems = 5000,
        long maxDbBytes = 50 * 1024 * 1024,
        long minFreeDiskBytes = 256 * 1024 * 1024,
        ILogger<DurableQueueStore>? logger = null)
    {
        _dbPath = dbPath;
        _maxItems = maxItems;
        _maxDbBytes = maxDbBytes;
        _minFreeDiskBytes = minFreeDiskBytes;
        _logger = logger;

        var dir = Path.GetDirectoryName(_dbPath);
        if (!string.IsNullOrEmpty(dir))
            Directory.CreateDirectory(dir);

        InitializeOrRecover();
    }

    private string ConnectionString => new SqliteConnectionStringBuilder
    {
        DataSource = _dbPath,
        Mode = SqliteOpenMode.ReadWriteCreate,
        Cache = SqliteCacheMode.Shared
    }.ToString();

    private void InitializeOrRecover()
    {
        lock (_lock)
        {
            try
            {
                EnsureSchema();
            }
            catch (SqliteException ex)
            {
                _logger?.LogWarning(ex, "Queue database appears corrupted; backing up and recreating {DbPath}", _dbPath);
                RecoverCorruptedDatabase();
            }
        }
    }

    private void EnsureSchema()
    {
        using var conn = new SqliteConnection(ConnectionString);
        conn.Open();

        using (var check = conn.CreateCommand())
        {
            check.CommandText = "PRAGMA integrity_check;";
            var result = check.ExecuteScalar()?.ToString();
            if (!string.Equals(result, "ok", StringComparison.OrdinalIgnoreCase))
                throw new SqliteException($"Integrity check failed: {result}", 11);
        }

        using var cmd = conn.CreateCommand();
        cmd.CommandText = """
            PRAGMA journal_mode=WAL;
            PRAGMA synchronous=NORMAL;
            CREATE TABLE IF NOT EXISTS telemetry_queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                idempotency_key TEXT NOT NULL UNIQUE,
                item_type INTEGER NOT NULL,
                priority INTEGER NOT NULL,
                payload_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                attempt_count INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_queue_priority ON telemetry_queue(priority ASC, id ASC);

            CREATE TABLE IF NOT EXISTS fim_baseline (
                file_path TEXT PRIMARY KEY,
                sha256_hash TEXT NOT NULL,
                file_size INTEGER NOT NULL,
                last_write_utc TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS agent_state (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            """;
        cmd.ExecuteNonQuery();
    }

    private void RecoverCorruptedDatabase()
    {
        SqliteConnection.ClearAllPools();
        if (File.Exists(_dbPath))
        {
            var corruptPath = $"{_dbPath}.corrupt.{DateTimeOffset.UtcNow:yyyyMMddHHmmss}";
            File.Move(_dbPath, corruptPath, overwrite: true);
        }
        foreach (var suffix in new[] { "-wal", "-shm" })
        {
            var sidecar = _dbPath + suffix;
            if (File.Exists(sidecar)) File.Delete(sidecar);
        }
        EnsureSchema();
    }

    public bool Enqueue(QueueItemType itemType, string idempotencyKey, string payloadJson)
    {
        lock (_lock)
        {
            if (!HasSufficientDiskSpace())
            {
                _logger?.LogWarning("Low disk space below {MinBytes} bytes; dropping low-priority queue item.", _minFreeDiskBytes);
                if (itemType == QueueItemType.TelemetrySample)
                    return false;
            }

            try
            {
                using var conn = new SqliteConnection(ConnectionString);
                conn.Open();

                EnforceQueueLimits(conn, itemType);

                var priority = itemType switch
                {
                    QueueItemType.Heartbeat => 1,
                    QueueItemType.Alert => 2,
                    QueueItemType.PolicyAck => 3,
                    _ => 4
                };

                using var cmd = conn.CreateCommand();
                cmd.CommandText = """
                    INSERT OR IGNORE INTO telemetry_queue
                    (idempotency_key, item_type, priority, payload_json, created_at, attempt_count)
                    VALUES ($key, $type, $prio, $payload, $created, 0);
                    """;
                cmd.Parameters.AddWithValue("$key", idempotencyKey);
                cmd.Parameters.AddWithValue("$type", (int)itemType);
                cmd.Parameters.AddWithValue("$prio", priority);
                cmd.Parameters.AddWithValue("$payload", payloadJson);
                cmd.Parameters.AddWithValue("$created", DateTimeOffset.UtcNow.ToString("O"));

                return cmd.ExecuteNonQuery() > 0;
            }
            catch (SqliteException ex)
            {
                _logger?.LogError(ex, "SQLite error during Enqueue; attempting recovery.");
                RecoverCorruptedDatabase();
                return false;
            }
        }
    }

    private void EnforceQueueLimits(SqliteConnection conn, QueueItemType incomingType)
    {
        using var countCmd = conn.CreateCommand();
        countCmd.CommandText = "SELECT COUNT(*) FROM telemetry_queue;";
        var count = Convert.ToInt32(countCmd.ExecuteScalar());

        var dbSize = File.Exists(_dbPath) ? new FileInfo(_dbPath).Length : 0;

        if (count >= _maxItems || dbSize >= _maxDbBytes)
        {
            // Evict oldest lowest-priority items (TelemetrySample first) before ever touching Alerts
            using var evictCmd = conn.CreateCommand();
            evictCmd.CommandText = """
                DELETE FROM telemetry_queue
                WHERE id IN (
                    SELECT id FROM telemetry_queue
                    WHERE item_type = $sampleType OR $incomingPrio <= 2
                    ORDER BY priority DESC, id ASC
                    LIMIT $evictCount
                );
                """;
            evictCmd.Parameters.AddWithValue("$sampleType", (int)QueueItemType.TelemetrySample);
            evictCmd.Parameters.AddWithValue("$incomingPrio", incomingType is QueueItemType.Alert or QueueItemType.Heartbeat ? 1 : 4);
            evictCmd.Parameters.AddWithValue("$evictCount", Math.Max(10, _maxItems / 20));
            evictCmd.ExecuteNonQuery();
        }
    }

    public List<QueuedTelemetryItem> DequeueBatch(int batchSize = 25)
    {
        lock (_lock)
        {
            var results = new List<QueuedTelemetryItem>();
            try
            {
                using var conn = new SqliteConnection(ConnectionString);
                conn.Open();

                using var cmd = conn.CreateCommand();
                cmd.CommandText = """
                    SELECT id, idempotency_key, item_type, priority, payload_json, created_at, attempt_count
                    FROM telemetry_queue
                    ORDER BY priority ASC, id ASC
                    LIMIT $limit;
                    """;
                cmd.Parameters.AddWithValue("$limit", batchSize);

                using var reader = cmd.ExecuteReader();
                while (reader.Read())
                {
                    results.Add(new QueuedTelemetryItem
                    {
                        Id = reader.GetInt64(0),
                        IdempotencyKey = reader.GetString(1),
                        ItemType = (QueueItemType)reader.GetInt32(2),
                        Priority = reader.GetInt32(3),
                        PayloadJson = reader.GetString(4),
                        CreatedAt = DateTimeOffset.Parse(reader.GetString(5)),
                        AttemptCount = reader.GetInt32(6)
                    });
                }
            }
            catch (SqliteException ex)
            {
                _logger?.LogError(ex, "SQLite error during DequeueBatch; attempting recovery.");
                RecoverCorruptedDatabase();
            }
            return results;
        }
    }

    public void MarkCompleted(IEnumerable<long> ids)
    {
        var idList = ids.ToList();
        if (idList.Count == 0) return;

        lock (_lock)
        {
            using var conn = new SqliteConnection(ConnectionString);
            conn.Open();
            using var tx = conn.BeginTransaction();
            using var cmd = conn.CreateCommand();
            cmd.Transaction = tx;
            cmd.CommandText = $"DELETE FROM telemetry_queue WHERE id IN ({string.Join(",", idList)});";
            cmd.ExecuteNonQuery();
            tx.Commit();
        }
    }

    public void IncrementAttempt(long id)
    {
        lock (_lock)
        {
            using var conn = new SqliteConnection(ConnectionString);
            conn.Open();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = "UPDATE telemetry_queue SET attempt_count = attempt_count + 1 WHERE id = $id;";
            cmd.Parameters.AddWithValue("$id", id);
            cmd.ExecuteNonQuery();
        }
    }

    public int GetPendingCount()
    {
        lock (_lock)
        {
            using var conn = new SqliteConnection(ConnectionString);
            conn.Open();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = "SELECT COUNT(*) FROM telemetry_queue;";
            return Convert.ToInt32(cmd.ExecuteScalar());
        }
    }

    public (string? Hash, long Size, string? LastWriteUtc) GetFimBaseline(string filePath)
    {
        lock (_lock)
        {
            using var conn = new SqliteConnection(ConnectionString);
            conn.Open();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = "SELECT sha256_hash, file_size, last_write_utc FROM fim_baseline WHERE file_path = $path;";
            cmd.Parameters.AddWithValue("$path", filePath);
            using var r = cmd.ExecuteReader();
            if (r.Read())
                return (r.GetString(0), r.GetInt64(1), r.GetString(2));
            return (null, 0, null);
        }
    }

    public void UpsertFimBaseline(string filePath, string sha256, long size, string lastWriteUtc)
    {
        lock (_lock)
        {
            using var conn = new SqliteConnection(ConnectionString);
            conn.Open();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = """
                INSERT INTO fim_baseline (file_path, sha256_hash, file_size, last_write_utc, updated_at)
                VALUES ($path, $hash, $size, $lwt, $now)
                ON CONFLICT(file_path) DO UPDATE SET
                    sha256_hash = excluded.sha256_hash,
                    file_size = excluded.file_size,
                    last_write_utc = excluded.last_write_utc,
                    updated_at = excluded.updated_at;
                """;
            cmd.Parameters.AddWithValue("$path", filePath);
            cmd.Parameters.AddWithValue("$hash", sha256);
            cmd.Parameters.AddWithValue("$size", size);
            cmd.Parameters.AddWithValue("$lwt", lastWriteUtc);
            cmd.Parameters.AddWithValue("$now", DateTimeOffset.UtcNow.ToString("O"));
            cmd.ExecuteNonQuery();
        }
    }

    private bool HasSufficientDiskSpace()
    {
        try
        {
            var root = Path.GetPathRoot(Path.GetFullPath(_dbPath));
            if (string.IsNullOrEmpty(root)) return true;
            var drive = new DriveInfo(root);
            return drive.AvailableFreeSpace >= _minFreeDiskBytes;
        }
        catch
        {
            return true;
        }
    }

    public void Dispose()
    {
        SqliteConnection.ClearAllPools();
    }
}
