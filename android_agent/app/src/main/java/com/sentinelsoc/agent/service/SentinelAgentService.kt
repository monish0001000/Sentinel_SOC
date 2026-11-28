package com.sentinelsoc.agent.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.sentinelsoc.agent.MainActivity
import com.sentinelsoc.agent.R
import com.sentinelsoc.agent.collector.AndroidTelemetryCollector
import com.sentinelsoc.agent.firebase.FirebaseAuthException
import com.sentinelsoc.agent.firebase.FirebaseRestClient
import com.sentinelsoc.agent.model.AgentConfig
import com.sentinelsoc.agent.model.AgentIdentity
import com.sentinelsoc.agent.model.PolicyAck
import com.sentinelsoc.agent.model.SecurityAlert
import com.sentinelsoc.agent.model.SystemTelemetrySnapshot
import com.sentinelsoc.agent.policy.PolicyValidator
import com.sentinelsoc.agent.storage.DurableQueueDb
import com.sentinelsoc.agent.storage.IdentityStore
import com.sentinelsoc.agent.storage.QueueItemType
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.io.IOException
import java.time.Instant
import java.util.UUID
import kotlin.math.min
import kotlin.math.pow

class SentinelAgentService : Service() {

    companion object {
        const val ACTION_START = "com.sentinelsoc.agent.START"
        const val ACTION_STOP = "com.sentinelsoc.agent.STOP"
        const val ACTION_SYNC_NOW = "com.sentinelsoc.agent.SYNC_NOW"
        const val ACTION_UNENROLL = "com.sentinelsoc.agent.UNENROLL"
        private const val CHANNEL_ID = "sentinel_soc_agent"
        private const val NOTIF_ID = 10042
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var workerJob: Job? = null
    private lateinit var identityStore: IdentityStore
    private lateinit var queueDb: DurableQueueDb
    private lateinit var collector: AndroidTelemetryCollector
    private val processedPolicies = HashSet<String>()

    @Volatile
    private var forceSyncRequested = false

    override fun onCreate() {
        super.onCreate()
        identityStore = IdentityStore(applicationContext)
        queueDb = DurableQueueDb(applicationContext)
        collector = AndroidTelemetryCollector(applicationContext)
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                AgentRuntimeState.log("Stopping Sentinel Android agent service...")
                AgentRuntimeState.update(running = false, statusText = "Stopped")
                workerJob?.cancel()
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_UNENROLL -> {
                AgentRuntimeState.log("Unenrolling Android endpoint locally...")
                identityStore.clearAll()
                queueDb.clearAll()
                processedPolicies.clear()
                AgentRuntimeState.update(running = false, enrolled = false, endpointId = "", pendingQueueCount = 0, statusText = "Unenrolled & wiped")
                workerJob?.cancel()
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_SYNC_NOW -> {
                forceSyncRequested = true
                AgentRuntimeState.log("Immediate sync requested by user.")
            }
        }

        val notification = buildNotification("Sentinel SOC Agent active — syncing telemetry")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            startForeground(NOTIF_ID, notification)
        }

        if (workerJob?.isActive != true) {
            workerJob = scope.launch { runLoop() }
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        workerJob?.cancel()
        scope.cancel()
        queueDb.close()
        AgentRuntimeState.update(running = false)
        super.onDestroy()
    }

    private suspend fun runLoop() {
        val config = identityStore.loadConfig()
        if (config == null) {
            AgentRuntimeState.log("No enrollment configuration found. Stopping.")
            AgentRuntimeState.update(running = false, enrolled = false, statusText = "Not configured")
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            return
        }

        val firebase = FirebaseRestClient(config)
        AgentRuntimeState.update(running = true, statusText = "Starting agent...")

        var failures = 0
        var identity = identityStore.loadIdentity()

        while (scope.isActive && identity == null) {
            val token = config.enrollmentToken
            if (token.isNullOrBlank()) {
                AgentRuntimeState.log("Missing enrollment token and no existing identity.")
                AgentRuntimeState.update(running = false, enrolled = false, statusText = "Enrollment token missing")
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                return
            }

            try {
                val epId = UUID.randomUUID().toString().replace("-", "")
                val initialSnap = collector.collect(epId, includeConnections = false)
                AgentRuntimeState.log("Enrolling endpoint $epId (${initialSnap.hostname})...")
                identity = firebase.enrollEndpoint(epId, token, initialSnap.hostname, initialSnap.osVersion, initialSnap.agentVersion)
                identityStore.saveIdentity(identity)
                identityStore.saveConfig(config.copy(enrollmentToken = null))
                AgentRuntimeState.log("Enrolled successfully as ${identity.endpointId.take(12)}.")
                AgentRuntimeState.update(running = true, enrolled = true, endpointId = identity.endpointId, statusText = "Online")
                failures = 0
            } catch (ex: Exception) {
                failures++
                val delayMs = min(600_000L, (5_000.0 * 2.0.pow(min(failures - 1, 7))).toLong())
                AgentRuntimeState.log("Enrollment retry #$failures in ${delayMs / 1000}s: ${ex.message}")
                AgentRuntimeState.update(running = true, enrolled = false, statusText = "Enrollment retrying...")
                delay(delayMs)
            }
        }

        val activeIdentity = identity ?: return
        AgentRuntimeState.update(running = true, enrolled = true, endpointId = activeIdentity.endpointId, statusText = "Online")
        updateNotification("Connected: ${activeIdentity.endpointId.take(12)}")

        var lastHistoricalMs = 0L
        var nextSyncAllowedMs = 0L

        while (scope.isActive) {
            try {
                val nowMs = System.currentTimeMillis()
                val snap = collector.collect(activeIdentity.endpointId, includeConnections = true)

                for (alert in collector.checkSecurityPosture(activeIdentity.endpointId)) {
                    queueDb.enqueue(QueueItemType.ALERT, alert.idempotencyKey, serializeAlert(alert))
                }

                if (nowMs - lastHistoricalMs >= config.historicalSampleIntervalSeconds * 1000L || forceSyncRequested) {
                    lastHistoricalMs = nowMs
                    queueDb.enqueue(QueueItemType.TELEMETRY_SAMPLE, snap.idempotencyKey, serializeTelemetry(snap))
                }

                if (nowMs >= nextSyncAllowedMs || forceSyncRequested) {
                    forceSyncRequested = false
                    try {
                        val currentId = identityStore.loadIdentity() ?: activeIdentity
                        val idToken = firebase.ensureValidIdToken(currentId) { updated ->
                            identityStore.saveIdentity(updated)
                        }
                        drainQueue(firebase, currentId, idToken)
                        val pending = queueDb.getPendingCount()
                        val syncState = if (pending == 0) "synced" else "syncing"
                        firebase.uploadHeartbeat(currentId, idToken, snap, pending, syncState)
                        AgentRuntimeState.update(
                            running = true,
                            enrolled = true,
                            endpointId = currentId.endpointId,
                            pendingQueueCount = pending,
                            statusText = "Online • CPU ${snap.cpuPercent}% • RAM ${snap.memoryPercent}% • ${snap.activeConnections.size} sockets"
                        )
                        updateNotification("Online · RAM ${snap.memoryPercent}% · ${snap.activeConnections.size} sockets")

                        val unenroll = pollAndHandlePolicies(firebase, currentId, idToken)
                        if (unenroll) {
                            AgentRuntimeState.log("Remote unenroll received. Wiping identity and stopping.")
                            identityStore.clearAll()
                            queueDb.clearAll()
                            AgentRuntimeState.update(running = false, enrolled = false, endpointId = "", pendingQueueCount = 0, statusText = "Remotely unenrolled")
                            stopForeground(STOP_FOREGROUND_REMOVE)
                            stopSelf()
                            return
                        }
                        failures = 0
                        nextSyncAllowedMs = 0L
                    } catch (authEx: FirebaseAuthException) {
                        failures++
                        val delayMs = min(600_000L, (10_000.0 * 2.0.pow(min(failures - 1, 6))).toLong())
                        nextSyncAllowedMs = System.currentTimeMillis() + delayMs
                        AgentRuntimeState.log("Firebase paused/auth error (retry ${delayMs / 1000}s): ${authEx.message}")
                        AgentRuntimeState.update(statusText = "Paused / Auth error (retrying)", pendingQueueCount = queueDb.getPendingCount())
                    } catch (ioEx: IOException) {
                        failures++
                        val delayMs = min(600_000L, (5_000.0 * 2.0.pow(min(failures - 1, 7))).toLong())
                        nextSyncAllowedMs = System.currentTimeMillis() + delayMs
                        AgentRuntimeState.log("Offline/network error (queued=${queueDb.getPendingCount()}, retry ${delayMs / 1000}s): ${ioEx.message}")
                        AgentRuntimeState.update(statusText = "Offline (queued ${queueDb.getPendingCount()})", pendingQueueCount = queueDb.getPendingCount())
                    }
                }
            } catch (ex: Exception) {
                AgentRuntimeState.log("Loop error: ${ex.message}")
            }

            val stepMs = 1000L
            val totalWait = config.heartbeatIntervalSeconds * 1000L
            var waited = 0L
            while (scope.isActive && waited < totalWait && !forceSyncRequested) {
                delay(stepMs)
                waited += stepMs
            }
        }
    }

    private fun drainQueue(firebase: FirebaseRestClient, identity: AgentIdentity, idToken: String) {
        while (true) {
            val batch = queueDb.dequeueBatch(20)
            if (batch.isEmpty()) break
            val doneIds = mutableListOf<Long>()
            for (item in batch) {
                try {
                    when (item.itemType) {
                        QueueItemType.ALERT -> firebase.uploadAlert(identity, idToken, deserializeAlert(item.payloadJson))
                        QueueItemType.POLICY_ACK -> firebase.uploadPolicyAck(identity, idToken, deserializeAck(item.payloadJson))
                        QueueItemType.TELEMETRY_SAMPLE -> firebase.uploadTelemetrySample(identity, idToken, deserializeTelemetry(item.payloadJson))
                    }
                    doneIds.add(item.id)
                } catch (e: Exception) {
                    queueDb.incrementAttempt(item.id)
                    if (doneIds.isNotEmpty()) queueDb.markCompleted(doneIds)
                    throw e
                }
            }
            queueDb.markCompleted(doneIds)
            if (batch.size < 20) break
        }
    }

    private fun pollAndHandlePolicies(
        firebase: FirebaseRestClient,
        identity: AgentIdentity,
        idToken: String
    ): Boolean {
        val policies = firebase.fetchPolicies(identity, idToken)
        for (pol in policies) {
            if (processedPolicies.contains(pol.policyId)) continue
            val validation = PolicyValidator.validate(pol, identity.endpointId)
            var shouldUnenroll = false

            val ack = if (!validation.valid) {
                PolicyAck(
                    ackId = "${pol.policyId}_${validation.state}",
                    policyId = pol.policyId,
                    endpointId = identity.endpointId,
                    state = validation.state,
                    message = validation.reason,
                    acknowledgedAtIso = Instant.now().toString()
                )
            } else {
                when (pol.action) {
                    "sync_now" -> {
                        val fresh = collector.collect(identity.endpointId, includeConnections = true)
                        firebase.uploadHeartbeat(identity, idToken, fresh, queueDb.getPendingCount(), "synced")
                        firebase.uploadTelemetrySample(identity, idToken, fresh)
                        PolicyAck(
                            ackId = "${pol.policyId}_applied",
                            policyId = pol.policyId,
                            endpointId = identity.endpointId,
                            state = "applied",
                            message = "Android telemetry synced: CPU ${fresh.cpuPercent}%, RAM ${fresh.memoryPercent}%, ${fresh.activeConnections.size} sockets.",
                            acknowledgedAtIso = Instant.now().toString()
                        )
                    }
                    "query_status" -> PolicyAck(
                        ackId = "${pol.policyId}_applied",
                        policyId = pol.policyId,
                        endpointId = identity.endpointId,
                        state = "applied",
                        message = collector.getPostureSummary(),
                        acknowledgedAtIso = Instant.now().toString()
                    )
                    "unenroll_agent" -> {
                        shouldUnenroll = true
                        PolicyAck(
                            ackId = "${pol.policyId}_applied",
                            policyId = pol.policyId,
                            endpointId = identity.endpointId,
                            state = "applied",
                            message = "Android endpoint wiped local identity and stopped foreground service.",
                            acknowledgedAtIso = Instant.now().toString()
                        )
                    }
                    else -> PolicyAck(
                        ackId = "${pol.policyId}_rejected",
                        policyId = pol.policyId,
                        endpointId = identity.endpointId,
                        state = "rejected",
                        message = "Unsupported Android action '${pol.action}'.",
                        acknowledgedAtIso = Instant.now().toString()
                    )
                }
            }

            processedPolicies.add(pol.policyId)
            runCatching { firebase.uploadPolicyAck(identity, idToken, ack) }
                .onFailure { queueDb.enqueue(QueueItemType.POLICY_ACK, ack.ackId, serializeAck(ack)) }

            if (shouldUnenroll) return true
        }
        return false
    }

    private fun serializeTelemetry(s: SystemTelemetrySnapshot): String = JSONObject().apply {
        put("idempotencyKey", s.idempotencyKey)
        put("endpointId", s.endpointId)
        put("capturedAtIso", s.capturedAtIso)
        put("cpuPercent", s.cpuPercent)
        put("memoryPercent", s.memoryPercent)
        put("diskPercent", s.diskPercent)
        put("uptimeSeconds", s.uptimeSeconds)
        put("processCount", s.processCount)
        put("networkTxBytesPerSec", s.networkTxBytesPerSec)
        put("networkRxBytesPerSec", s.networkRxBytesPerSec)
    }.toString()

    private fun deserializeTelemetry(json: String): SystemTelemetrySnapshot {
        val o = JSONObject(json)
        return SystemTelemetrySnapshot(
            idempotencyKey = o.getString("idempotencyKey"),
            endpointId = o.getString("endpointId"),
            capturedAtIso = o.getString("capturedAtIso"),
            hostname = "",
            osVersion = "",
            osBuild = "",
            agentVersion = "1.0.3",
            agentIntegrityHash = "",
            uptimeSeconds = o.getLong("uptimeSeconds"),
            cpuPercent = o.getDouble("cpuPercent"),
            memoryPercent = o.getDouble("memoryPercent"),
            memoryUsedMb = 0L,
            memoryTotalMb = 0L,
            diskPercent = o.getDouble("diskPercent"),
            diskFreeGb = 0.0,
            diskTotalGb = 0.0,
            processCount = o.getInt("processCount"),
            firewallEnabled = false,
            activeConnections = emptyList(),
            networkTxBytesPerSec = o.optLong("networkTxBytesPerSec", 0L),
            networkRxBytesPerSec = o.optLong("networkRxBytesPerSec", 0L)
        )
    }

    private fun serializeAlert(a: SecurityAlert): String = JSONObject().apply {
        put("idempotencyKey", a.idempotencyKey)
        put("endpointId", a.endpointId)
        put("ruleId", a.ruleId)
        put("ruleVersion", a.ruleVersion)
        put("severity", a.severity)
        put("eventTimeIso", a.eventTimeIso)
        put("reason", a.reason)
        put("confidenceNotes", a.confidenceNotes)
        put("enforced", a.enforced)
        put("status", a.status)
        put("evidence", JSONObject(a.evidence))
    }.toString()

    private fun deserializeAlert(json: String): SecurityAlert {
        val o = JSONObject(json)
        val evObj = o.optJSONObject("evidence")
        val ev = mutableMapOf<String, String>()
        evObj?.keys()?.forEach { k -> ev[k] = evObj.optString(k, "") }
        return SecurityAlert(
            idempotencyKey = o.getString("idempotencyKey"),
            endpointId = o.getString("endpointId"),
            ruleId = o.getString("ruleId"),
            ruleVersion = o.getString("ruleVersion"),
            severity = o.getString("severity"),
            eventTimeIso = o.getString("eventTimeIso"),
            reason = o.getString("reason"),
            confidenceNotes = o.optString("confidenceNotes", ""),
            enforced = o.optBoolean("enforced", false),
            status = o.optString("status", "open"),
            evidence = ev
        )
    }

    private fun serializeAck(a: PolicyAck): String = JSONObject().apply {
        put("ackId", a.ackId)
        put("policyId", a.policyId)
        put("endpointId", a.endpointId)
        put("state", a.state)
        put("message", a.message)
        put("acknowledgedAtIso", a.acknowledgedAtIso)
    }.toString()

    private fun deserializeAck(json: String): PolicyAck {
        val o = JSONObject(json)
        return PolicyAck(
            ackId = o.getString("ackId"),
            policyId = o.getString("policyId"),
            endpointId = o.getString("endpointId"),
            state = o.getString("state"),
            message = o.getString("message"),
            acknowledgedAtIso = o.getString("acknowledgedAtIso")
        )
    }

    private fun createNotificationChannel() {
        val nm = getSystemService(NotificationManager::class.java) ?: return
        val ch = NotificationChannel(CHANNEL_ID, "Sentinel SOC Monitoring", NotificationManager.IMPORTANCE_LOW)
        ch.description = "Persistent Sentinel SOC endpoint telemetry & command channel"
        nm.createNotificationChannel(ch)
    }

    private fun buildNotification(content: String): Notification {
        val pi = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Sentinel SOC Agent")
            .setContentText(content)
            .setSmallIcon(R.drawable.ic_sentinel_shield)
            .setOngoing(true)
            .setContentIntent(pi)
            .build()
    }

    private fun updateNotification(content: String) {
        val nm = getSystemService(NotificationManager::class.java) ?: return
        nm.notify(NOTIF_ID, buildNotification(content))
    }
}
