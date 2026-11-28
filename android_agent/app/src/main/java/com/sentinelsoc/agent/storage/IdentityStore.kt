package com.sentinelsoc.agent.storage

import android.content.Context
import com.sentinelsoc.agent.model.AgentConfig
import com.sentinelsoc.agent.model.AgentIdentity
import org.json.JSONObject
import java.io.File

class IdentityStore(context: Context) {
    private val baseDir = File(context.filesDir, "sentinel_agent").apply { mkdirs() }
    private val configFile = File(baseDir, "agent_config.json")
    private val identityFile = File(baseDir, "agent_identity.json")

    @Synchronized
    fun saveConfig(config: AgentConfig) {
        val obj = JSONObject().apply {
            put("firebaseProjectId", config.firebaseProjectId)
            put("firebaseWebApiKey", config.firebaseWebApiKey)
            put("ownerUid", config.ownerUid)
            if (config.enrollmentToken != null) put("enrollmentToken", config.enrollmentToken)
            put("heartbeatIntervalSeconds", config.heartbeatIntervalSeconds)
            put("historicalSampleIntervalSeconds", config.historicalSampleIntervalSeconds)
        }
        configFile.writeText(obj.toString(2))
    }

    @Synchronized
    fun loadConfig(): AgentConfig? {
        if (!configFile.exists()) return null
        return runCatching {
            val obj = JSONObject(configFile.readText())
            val projectId = obj.optString("firebaseProjectId", "")
            val apiKey = obj.optString("firebaseWebApiKey", "")
            val ownerUid = obj.optString("ownerUid", "")
            if (projectId.isBlank() || apiKey.isBlank() || ownerUid.isBlank()) return null
            AgentConfig(
                firebaseProjectId = projectId,
                firebaseWebApiKey = apiKey,
                ownerUid = ownerUid,
                enrollmentToken = obj.optString("enrollmentToken", "").takeIf { it.isNotBlank() },
                heartbeatIntervalSeconds = obj.optLong("heartbeatIntervalSeconds", 15L),
                historicalSampleIntervalSeconds = obj.optLong("historicalSampleIntervalSeconds", 300L)
            )
        }.getOrNull()
    }

    @Synchronized
    fun saveIdentity(identity: AgentIdentity) {
        val obj = JSONObject().apply {
            put("endpointId", identity.endpointId)
            put("ownerUid", identity.ownerUid)
            put("agentUid", identity.agentUid)
            put("refreshToken", identity.refreshToken)
            put("enrollmentTokenHash", identity.enrollmentTokenHash)
            put("enrolledAtIso", identity.enrolledAtIso)
        }
        identityFile.writeText(obj.toString(2))
    }

    @Synchronized
    fun loadIdentity(): AgentIdentity? {
        if (!identityFile.exists()) return null
        return runCatching {
            val obj = JSONObject(identityFile.readText())
            val endpointId = obj.optString("endpointId", "")
            val refreshToken = obj.optString("refreshToken", "")
            if (endpointId.isBlank() || refreshToken.isBlank()) return null
            AgentIdentity(
                endpointId = endpointId,
                ownerUid = obj.optString("ownerUid", ""),
                agentUid = obj.optString("agentUid", ""),
                refreshToken = refreshToken,
                enrollmentTokenHash = obj.optString("enrollmentTokenHash", ""),
                enrolledAtIso = obj.optString("enrolledAtIso", "")
            )
        }.getOrNull()
    }

    @Synchronized
    fun clearAll() {
        runCatching { identityFile.delete() }
        runCatching { configFile.delete() }
    }
}
