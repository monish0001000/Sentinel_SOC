package com.sentinelsoc.agent.model

import org.json.JSONObject
import java.time.Instant

data class EnrollmentBundle(
    val firebaseProjectId: String,
    val firebaseWebApiKey: String,
    val ownerUid: String,
    val enrollmentToken: String,
    val expiresAtIso: String
)

data class AgentConfig(
    val firebaseProjectId: String,
    val firebaseWebApiKey: String,
    val ownerUid: String,
    val enrollmentToken: String?,
    val heartbeatIntervalSeconds: Long = 15L,
    val historicalSampleIntervalSeconds: Long = 300L
)

data class AgentIdentity(
    val endpointId: String,
    val ownerUid: String,
    val agentUid: String,
    val refreshToken: String,
    val enrollmentTokenHash: String,
    val enrolledAtIso: String
)

data class NetworkConnectionSummary(
    val protocol: String,
    val localAddress: String,
    val localPort: Int,
    val remoteAddress: String,
    val remotePort: Int,
    val remoteHost: String?,
    val state: String,
    val processId: Int,
    val processName: String
)

data class SystemTelemetrySnapshot(
    val idempotencyKey: String,
    val endpointId: String,
    val capturedAtIso: String,
    val hostname: String,
    val osVersion: String,
    val osBuild: String,
    val agentVersion: String,
    val agentIntegrityHash: String,
    val uptimeSeconds: Long,
    val cpuPercent: Double,
    val memoryPercent: Double,
    val memoryUsedMb: Long,
    val memoryTotalMb: Long,
    val diskPercent: Double,
    val diskFreeGb: Double,
    val diskTotalGb: Double,
    val processCount: Int,
    val firewallEnabled: Boolean,
    val activeConnections: List<NetworkConnectionSummary>,
    val networkTxBytesPerSec: Long = 0L,
    val networkRxBytesPerSec: Long = 0L
)

data class SecurityAlert(
    val idempotencyKey: String,
    val endpointId: String,
    val ruleId: String,
    val ruleVersion: String,
    val severity: String,
    val eventTimeIso: String,
    val reason: String,
    val confidenceNotes: String,
    val enforced: Boolean = false,
    val status: String = "open",
    val evidence: Map<String, String> = emptyMap()
)

data class FirewallPolicy(
    val policyId: String,
    val targetEndpointId: String,
    val action: String,
    val targetIp: String?,
    val direction: String,
    val reason: String,
    val createdBy: String,
    val approved: Boolean,
    val expiresAtIso: String
)

data class PolicyAck(
    val ackId: String,
    val policyId: String,
    val endpointId: String,
    val state: String,
    val message: String,
    val acknowledgedAtIso: String
)

object EnrollmentBundleParser {
    fun parseAndValidate(rawJson: String, now: Instant = Instant.now()): Result<EnrollmentBundle> {
        return runCatching {
            val obj = JSONObject(rawJson.trim())
            val projectId = obj.optString("FirebaseProjectId", "").trim()
            val apiKey = obj.optString("FirebaseWebApiKey", "").trim()
            val ownerUid = obj.optString("OwnerUid", "").trim()
            val token = obj.optString("EnrollmentToken", "").trim()
            val expiresAt = obj.optString("ExpiresAt", "").trim()

            require(projectId.isNotEmpty()) { "Missing FirebaseProjectId." }
            require(apiKey.isNotEmpty()) { "Missing FirebaseWebApiKey." }
            require(ownerUid.isNotEmpty()) { "Missing OwnerUid." }
            require(token.length >= 16) { "EnrollmentToken is missing or invalid." }

            if (expiresAt.isNotEmpty()) {
                val expInstant = Instant.parse(expiresAt)
                require(expInstant.isAfter(now)) { "Enrollment bundle token has expired ($expiresAt)." }
            }

            EnrollmentBundle(
                firebaseProjectId = projectId,
                firebaseWebApiKey = apiKey,
                ownerUid = ownerUid,
                enrollmentToken = token,
                expiresAtIso = expiresAt
            )
        }
    }
}
