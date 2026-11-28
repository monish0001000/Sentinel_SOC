package com.sentinelsoc.agent.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat
import com.sentinelsoc.agent.storage.IdentityStore

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val store = IdentityStore(context)
        val hasIdentityOrToken = store.loadIdentity() != null || !store.loadConfig()?.enrollmentToken.isNullOrBlank()
        if (hasIdentityOrToken) {
            val svcIntent = Intent(context, SentinelAgentService::class.java).apply {
                action = SentinelAgentService.ACTION_START
            }
            ContextCompat.startForegroundService(context, svcIntent)
        }
    }
}
