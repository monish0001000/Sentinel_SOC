package com.sentinelsoc.agent.storage

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

enum class QueueItemType {
    ALERT,
    POLICY_ACK,
    TELEMETRY_SAMPLE
}

data class QueuedItem(
    val id: Long,
    val itemType: QueueItemType,
    val idempotencyKey: String,
    val payloadJson: String,
    val attempts: Int
)

class DurableQueueDb(
    context: Context,
    private val maxItems: Int = 2000
) : SQLiteOpenHelper(context, "sentinel_queue.db", null, 1) {

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS pending_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item_type TEXT NOT NULL,
                idempotency_key TEXT NOT NULL UNIQUE,
                payload_json TEXT NOT NULL,
                attempts INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL
            )
            """.trimIndent()
        )
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit

    @Synchronized
    fun enqueue(type: QueueItemType, idempotencyKey: String, payloadJson: String) {
        val db = writableDatabase
        val count = getPendingCount()
        if (count >= maxItems) {
            db.execSQL(
                "DELETE FROM pending_items WHERE id IN (SELECT id FROM pending_items ORDER BY id ASC LIMIT ?)",
                arrayOf((count - maxItems + 1).toString())
            )
        }
        val cv = ContentValues().apply {
            put("item_type", type.name)
            put("idempotency_key", idempotencyKey)
            put("payload_json", payloadJson)
            put("attempts", 0)
            put("created_at", System.currentTimeMillis())
        }
        db.insertWithOnConflict("pending_items", null, cv, SQLiteDatabase.CONFLICT_IGNORE)
    }

    @Synchronized
    fun dequeueBatch(limit: Int = 20): List<QueuedItem> {
        val list = mutableListOf<QueuedItem>()
        readableDatabase.rawQuery(
            "SELECT id, item_type, idempotency_key, payload_json, attempts FROM pending_items ORDER BY id ASC LIMIT ?",
            arrayOf(limit.toString())
        ).use { c ->
            while (c.moveToNext()) {
                val type = runCatching { QueueItemType.valueOf(c.getString(1)) }.getOrNull() ?: continue
                list.add(
                    QueuedItem(
                        id = c.getLong(0),
                        itemType = type,
                        idempotencyKey = c.getString(2),
                        payloadJson = c.getString(3),
                        attempts = c.getInt(4)
                    )
                )
            }
        }
        return list
    }

    @Synchronized
    fun markCompleted(ids: List<Long>) {
        if (ids.isEmpty()) return
        val placeholders = ids.joinToString(",") { "?" }
        writableDatabase.delete("pending_items", "id IN ($placeholders)", ids.map { it.toString() }.toTypedArray())
    }

    @Synchronized
    fun incrementAttempt(id: Long) {
        writableDatabase.execSQL("UPDATE pending_items SET attempts = attempts + 1 WHERE id = ?", arrayOf(id.toString()))
    }

    @Synchronized
    fun getPendingCount(): Int {
        readableDatabase.rawQuery("SELECT COUNT(*) FROM pending_items", null).use { c ->
            return if (c.moveToFirst()) c.getInt(0) else 0
        }
    }

    @Synchronized
    fun clearAll() {
        writableDatabase.delete("pending_items", null, null)
    }
}
