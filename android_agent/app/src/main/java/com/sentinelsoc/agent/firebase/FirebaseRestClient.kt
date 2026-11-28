package com.sentinelsoc.agent.firebase

import com.sentinelsoc.agent.model.AgentConfig
import com.sentinelsoc.agent.model.AgentIdentity
import com.sentinelsoc.agent.model.FirewallPolicy
import com.sentinelsoc.agent.model.PolicyAck
import com.sentinelsoc.agent.model.SecurityAlert
import com.sentinelsoc.agent.model.SystemTelemetrySnapshot
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.time.Instant

class FirebaseAuthException(message: String) : IOException(message)

class FirebaseRestClient(private val config: AgentConfig) {
    private val firestoreBaseUrl =
        "https://firestore.googleapis.com/v1/projects/${config.firebaseProjectId}/databases/(default)/documents"

    private var cachedIdToken: String? = null
    private var idTokenExpiresAtMs: Long = 0L

    fun sha256Hex(input: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(input.toByteArray(Charsets.UTF_8))
        return digest.joinToString("") { "%02x".format(it) }
    }

    fun ensureValidIdToken(identity: AgentIdentity, onRefreshUpdate: (AgentIdentity) -> Unit): String {
        if (!cachedIdToken.isNullOrBlank() && System.currentTimeMillis() + 60_000L < idTokenExpiresAtMs) {
            return cachedIdToken!!
        }
        val url = "https://securetoken.googleapis.com/v1/token?key=${config.firebaseWebApiKey}"
        val body = JSONObject().apply {
            put("grant_type", "refresh_token")
            put("refresh_token", identity.refreshToken)
        }
        val resp = sendJsonRequest("POST", url, null, body)
        val newIdToken = resp.optString("id_token", "")
        if (newIdToken.isBlank()) throw FirebaseAuthException("Failed to refresh Firebase ID token.")
        val expiresIn = resp.optString("expires_in", "3600").toLongOrNull() ?: 3600L
        val newRefresh = resp.optString("refresh_token", identity.refreshToken)

        cachedIdToken = newIdToken
        idTokenExpiresAtMs = System.currentTimeMillis() + expiresIn * 1000L

        if (newRefresh != identity.refreshToken) {
            onRefreshUpdate(identity.copy(refreshToken = newRefresh))
        }
        return newIdToken
    }

    fun enrollEndpoint(
        endpointId: String,
        pairingToken: String,
        hostname: String,
        osVersion: String,
        agentVersion: String
    ): AgentIdentity {
        val signUpUrl = "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${config.firebaseWebApiKey}"
        val authResp = sendJsonRequest("POST", signUpUrl, null, JSONObject().put("returnSecureToken", true))
        val agentUid = authResp.getString("localId")
        val refreshToken = authResp.getString("refreshToken")
        val idToken = authResp.getString("idToken")
        val expiresIn = authResp.optString("expiresIn", "3600").toLongOrNull() ?: 3600L
        cachedIdToken = idToken
        idTokenExpiresAtMs = System.currentTimeMillis() + expiresIn * 1000L

        val tokenHash = sha256Hex(pairingToken)

        val claimUrl = "$firestoreBaseUrl/enrollments/$tokenHash" +
            "?updateMask.fieldPaths=used&updateMask.fieldPaths=claimedByAgentUid&updateMask.fieldPaths=claimedEndpointId&currentDocument.exists=true"
        val claimPayload = JSONObject().put(
            "fields",
            JSONObject()
                .put("used", boolVal(true))
                .put("claimedByAgentUid", strVal(agentUid))
                .put("claimedEndpointId", strVal(endpointId))
        )
        sendJsonRequest("PATCH", claimUrl, idToken, claimPayload)

        val nowIso = Instant.now().toString()
        val endpointUrl = "$firestoreBaseUrl/users/${config.ownerUid}/endpoints?documentId=$endpointId"
        val endpointPayload = JSONObject().put(
            "fields",
            JSONObject()
                .put("endpointId", strVal(endpointId))
                .put("ownerUid", strVal(config.ownerUid))
                .put("agentUid", strVal(agentUid))
                .put("enrollmentTokenHash", strVal(tokenHash))
                .put("hostname", strVal(hostname))
                .put("osVersion", strVal(osVersion))
                .put("agentVersion", strVal(agentVersion))
                .put("revoked", boolVal(false))
                .put("status", strVal("online"))
                .put("healthState", strVal("online"))
                .put("syncState", strVal("synced"))
                .put("lastSeenAt", tsVal(nowIso))
        )
        sendJsonRequest("POST", endpointUrl, idToken, endpointPayload)

        return AgentIdentity(
            endpointId = endpointId,
            ownerUid = config.ownerUid,
            agentUid = agentUid,
            refreshToken = refreshToken,
            enrollmentTokenHash = tokenHash,
            enrolledAtIso = nowIso
        )
    }

    fun uploadHeartbeat(
        identity: AgentIdentity,
        idToken: String,
        snap: SystemTelemetrySnapshot,
        pendingQueueCount: Int,
        syncState: String
    ) {
        val fields = listOf(
            "hostname", "osVersion", "osBuild", "agentVersion", "lastSeenAt",
            "uptimeSeconds", "status", "healthState", "syncState",
            "pendingQueueCount", "latestMetrics", "activeConnections", "firewallEnabled", "agentIntegrityHash"
        )
        val mask = fields.joinToString("&") { "updateMask.fieldPaths=$it" }
        val url = "$firestoreBaseUrl/users/${identity.ownerUid}/endpoints/${identity.endpointId}?$mask"

        val connValues = JSONArray()
        snap.activeConnections.take(25).forEach { c ->
            connValues.put(
                JSONObject().put(
                    "mapValue",
                    JSONObject().put(
                        "fields",
                        JSONObject()
                            .put("protocol", strVal(c.protocol))
                            .put("localAddress", strVal(c.localAddress))
                            .put("localPort", intVal(c.localPort.toLong()))
                            .put("remoteAddress", strVal(c.remoteAddress))
                            .put("remotePort", intVal(c.remotePort.toLong()))
                            .put("remoteHost", strVal(c.remoteHost ?: ""))
                            .put("state", strVal(c.state))
                            .put("processId", intVal(c.processId.toLong()))
                            .put("processName", strVal(c.processName))
                    )
                )
            )
        }

        val metricsFields = JSONObject()
            .put("cpuPercent", doubleVal(snap.cpuPercent))
            .put("memoryPercent", doubleVal(snap.memoryPercent))
            .put("memoryUsedMb", intVal(snap.memoryUsedMb))
            .put("memoryTotalMb", intVal(snap.memoryTotalMb))
            .put("diskPercent", doubleVal(snap.diskPercent))
            .put("diskFreeGb", doubleVal(snap.diskFreeGb))
            .put("diskTotalGb", doubleVal(snap.diskTotalGb))
            .put("processCount", intVal(snap.processCount.toLong()))
            .put("networkTxBytesPerSec", intVal(snap.networkTxBytesPerSec))
            .put("networkRxBytesPerSec", intVal(snap.networkRxBytesPerSec))

        val payload = JSONObject().put(
            "fields",
            JSONObject()
                .put("hostname", strVal(snap.hostname))
                .put("osVersion", strVal(snap.osVersion))
                .put("osBuild", strVal(snap.osBuild))
                .put("agentVersion", strVal(snap.agentVersion))
                .put("agentIntegrityHash", strVal(snap.agentIntegrityHash))
                .put("lastSeenAt", tsVal(snap.capturedAtIso))
                .put("uptimeSeconds", intVal(snap.uptimeSeconds))
                .put("status", strVal("online"))
                .put("healthState", strVal("online"))
                .put("syncState", strVal(syncState))
                .put("pendingQueueCount", intVal(pendingQueueCount.toLong()))
                .put("firewallEnabled", boolVal(snap.firewallEnabled))
                .put("activeConnections", JSONObject().put("arrayValue", JSONObject().put("values", connValues)))
                .put("latestMetrics", JSONObject().put("mapValue", JSONObject().put("fields", metricsFields)))
        )

        sendJsonRequest("PATCH", url, idToken, payload)
    }

    fun uploadTelemetrySample(identity: AgentIdentity, idToken: String, snap: SystemTelemetrySnapshot) {
        val url = "$firestoreBaseUrl/users/${identity.ownerUid}/endpoints/${identity.endpointId}/telemetry?documentId=${snap.idempotencyKey}"
        val payload = JSONObject().put(
            "fields",
            JSONObject()
                .put("endpointId", strVal(snap.endpointId))
                .put("idempotencyKey", strVal(snap.idempotencyKey))
                .put("capturedAt", tsVal(snap.capturedAtIso))
                .put("cpuPercent", doubleVal(snap.cpuPercent))
                .put("memoryPercent", doubleVal(snap.memoryPercent))
                .put("diskPercent", doubleVal(snap.diskPercent))
                .put("uptimeSeconds", intVal(snap.uptimeSeconds))
                .put("processCount", intVal(snap.processCount.toLong()))
                .put("networkTxBytesPerSec", intVal(snap.networkTxBytesPerSec))
                .put("networkRxBytesPerSec", intVal(snap.networkRxBytesPerSec))
        )
        sendIdempotentCreate(url, idToken, payload)
    }

    fun uploadAlert(identity: AgentIdentity, idToken: String, alert: SecurityAlert) {
        val url = "$firestoreBaseUrl/users/${identity.ownerUid}/endpoints/${identity.endpointId}/alerts?documentId=${alert.idempotencyKey}"
        val evFields = JSONObject()
        alert.evidence.forEach { (k, v) -> evFields.put(k, strVal(v)) }

        val payload = JSONObject().put(
            "fields",
            JSONObject()
                .put("endpointId", strVal(alert.endpointId))
                .put("idempotencyKey", strVal(alert.idempotencyKey))
                .put("ruleId", strVal(alert.ruleId))
                .put("ruleVersion", strVal(alert.ruleVersion))
                .put("severity", strVal(alert.severity))
                .put("eventTime", tsVal(alert.eventTimeIso))
                .put("reason", strVal(alert.reason.take(1000)))
                .put("confidenceNotes", strVal(alert.confidenceNotes))
                .put("enforced", boolVal(alert.enforced))
                .put("status", strVal(alert.status))
                .put("evidence", JSONObject().put("mapValue", JSONObject().put("fields", evFields)))
        )
        sendIdempotentCreate(url, idToken, payload)
    }

    fun uploadPolicyAck(identity: AgentIdentity, idToken: String, ack: PolicyAck) {
        val url = "$firestoreBaseUrl/users/${identity.ownerUid}/endpoints/${identity.endpointId}/policyAcks?documentId=${ack.ackId}"
        val payload = JSONObject().put(
            "fields",
            JSONObject()
                .put("endpointId", strVal(ack.endpointId))
                .put("policyId", strVal(ack.policyId))
                .put("state", strVal(ack.state))
                .put("message", strVal(ack.message))
                .put("acknowledgedAt", tsVal(ack.acknowledgedAtIso))
        )
        sendIdempotentCreate(url, idToken, payload)
    }

    fun fetchPolicies(identity: AgentIdentity, idToken: String): List<FirewallPolicy> {
        val url = "$firestoreBaseUrl/users/${identity.ownerUid}/endpoints/${identity.endpointId}/policies?pageSize=25"
        val resp = runCatching { sendJsonRequest("GET", url, idToken, null) }.getOrNull() ?: return emptyList()
        val docs = resp.optJSONArray("documents") ?: return emptyList()
        val list = mutableListOf<FirewallPolicy>()
        for (i in 0 until docs.length()) {
            val d = docs.getJSONObject(i)
            val name = d.optString("name", "")
            val policyId = name.substringAfterLast("/")
            val f = d.optJSONObject("fields") ?: continue
            list.add(
                FirewallPolicy(
                    policyId = policyId,
                    targetEndpointId = getStr(f, "targetEndpointId"),
                    action = getStr(f, "action"),
                    targetIp = getOptStr(f, "targetIp"),
                    direction = getOptStr(f, "direction") ?: "Outbound",
                    reason = getStr(f, "reason"),
                    createdBy = getStr(f, "createdBy"),
                    approved = getBool(f, "approved"),
                    expiresAtIso = getTime(f, "expiresAt")
                )
            )
        }
        return list
    }

    private fun sendIdempotentCreate(url: String, idToken: String, payload: JSONObject) {
        val conn = openConn("POST", url, idToken)
        conn.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) }
        val code = conn.responseCode
        if (code in 200..299 || code == 409) {
            conn.disconnect()
            return
        }
        val err = conn.errorStream?.bufferedReader()?.readText() ?: ""
        conn.disconnect()
        if (code == 401 || code == 403) throw FirebaseAuthException("Firestore rejected write ($code): $err")
        throw IOException("Firestore write failed ($code): $err")
    }

    private fun sendJsonRequest(method: String, urlStr: String, idToken: String?, payload: JSONObject?): JSONObject {
        val conn = openConn(method, urlStr, idToken)
        if (payload != null) {
            conn.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) }
        }
        val code = conn.responseCode
        val stream = if (code in 200..299) conn.inputStream else conn.errorStream
        val text = stream?.bufferedReader()?.readText() ?: "{}"
        conn.disconnect()

        if (code in 200..299) {
            return if (text.isBlank()) JSONObject() else JSONObject(text)
        }
        if (code == 401 || code == 403) throw FirebaseAuthException("Firebase auth/rules error ($code): $text")
        throw IOException("HTTP $code from Firebase: $text")
    }

    private fun openConn(method: String, urlStr: String, idToken: String?): HttpURLConnection {
        val conn = (URL(urlStr).openConnection() as HttpURLConnection)
        // HttpURLConnection handles PATCH smoothly when overridden cleanly or via X-HTTP-Method-Override fallback
        if (method == "PATCH") {
            conn.requestMethod = "POST"
            conn.setRequestProperty("X-HTTP-Method-Override", "PATCH")
        } else {
            conn.requestMethod = method
        }
        conn.connectTimeout = 15_000
        conn.readTimeout = 20_000
        conn.setRequestProperty("Accept", "application/json")
        if (idToken != null) {
            conn.setRequestProperty("Authorization", "Bearer $idToken")
        }
        if (method != "GET") {
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8")
        }
        return conn
    }

    private fun strVal(v: String) = JSONObject().put("stringValue", v)
    private fun boolVal(v: Boolean) = JSONObject().put("booleanValue", v)
    private fun intVal(v: Long) = JSONObject().put("integerValue", v.toString())
    private fun doubleVal(v: Double) = JSONObject().put("doubleValue", v)
    private fun tsVal(v: String) = JSONObject().put("timestampValue", v)

    private fun getStr(f: JSONObject, k: String) = f.optJSONObject(k)?.optString("stringValue", "") ?: ""
    private fun getOptStr(f: JSONObject, k: String) = f.optJSONObject(k)?.optString("stringValue")?.takeIf { it.isNotBlank() }
    private fun getBool(f: JSONObject, k: String) = f.optJSONObject(k)?.optBoolean("booleanValue", false) ?: false
    private fun getTime(f: JSONObject, k: String) = f.optJSONObject(k)?.optString("timestampValue", "") ?: ""
}
