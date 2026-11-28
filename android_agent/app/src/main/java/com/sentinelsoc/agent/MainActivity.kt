package com.sentinelsoc.agent

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.sentinelsoc.agent.model.AgentConfig
import com.sentinelsoc.agent.model.EnrollmentBundleParser
import com.sentinelsoc.agent.service.AgentRuntimeState
import com.sentinelsoc.agent.service.SentinelAgentService
import com.sentinelsoc.agent.storage.IdentityStore
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {

    private lateinit var identityStore: IdentityStore
    private lateinit var jsonBox: EditText
    private lateinit var consentBox: CheckBox
    private lateinit var validationText: TextView
    private lateinit var statusText: TextView
    private lateinit var logText: TextView

    private val filePicker = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri == null) return@registerForActivityResult
        runCatching {
            contentResolver.openInputStream(uri)?.bufferedReader()?.use { it.readText() } ?: ""
        }.onSuccess { text ->
            jsonBox.setText(text)
            validateBundleUi()
        }.onFailure { err ->
            Toast.makeText(this, "Import failed: ${err.message}", Toast.LENGTH_LONG).show()
        }
    }

    private val notifPermLauncher = registerForActivityResult(ActivityResultContracts.RequestPermission()) { _ -> }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        identityStore = IdentityStore(applicationContext)
        jsonBox = findViewById(R.id.inputBundleJson)
        consentBox = findViewById(R.id.checkConsent)
        validationText = findViewById(R.id.textValidation)
        statusText = findViewById(R.id.textStatus)
        logText = findViewById(R.id.textLogs)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            notifPermLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }

        findViewById<Button>(R.id.btnImportJson).setOnClickListener {
            filePicker.launch(arrayOf("application/json", "text/plain", "*/*"))
        }

        findViewById<Button>(R.id.btnValidate).setOnClickListener {
            validateBundleUi()
        }

        findViewById<Button>(R.id.btnEnrollStart).setOnClickListener {
            handleEnrollOrStart()
        }

        findViewById<Button>(R.id.btnSyncNow).setOnClickListener {
            sendServiceAction(SentinelAgentService.ACTION_SYNC_NOW)
        }

        findViewById<Button>(R.id.btnStopService).setOnClickListener {
            sendServiceAction(SentinelAgentService.ACTION_STOP)
        }

        findViewById<Button>(R.id.btnUnenroll).setOnClickListener {
            sendServiceAction(SentinelAgentService.ACTION_UNENROLL)
        }

        val existing = identityStore.loadIdentity()
        if (existing != null) {
            AgentRuntimeState.update(
                enrolled = true,
                endpointId = existing.endpointId,
                statusText = "Enrolled (${existing.endpointId.take(12)}) — tap Start/Resume if stopped"
            )
            consentBox.isChecked = true
        }

        lifecycleScope.launch {
            AgentRuntimeState.state.collect { snap ->
                statusText.text = "Status: ${snap.statusText}\nEndpoint: ${snap.endpointId.ifBlank { "Not enrolled" }} | Queued: ${snap.pendingQueueCount}"
                logText.text = if (snap.logs.isEmpty()) "Waiting for agent activity..." else snap.logs.joinToString("\n")
            }
        }
    }

    private fun validateBundleUi(): Boolean {
        val res = EnrollmentBundleParser.parseAndValidate(jsonBox.text.toString())
        return res.fold(
            onSuccess = { b ->
                validationText.text = "Valid enrollment bundle for project '${b.firebaseProjectId}'."
                true
            },
            onFailure = { err ->
                validationText.text = "Validation error: ${err.message}"
                false
            }
        )
    }

    private fun handleEnrollOrStart() {
        val existingId = identityStore.loadIdentity()
        val existingCfg = identityStore.loadConfig()

        if (existingId != null && existingCfg != null && jsonBox.text.toString().isBlank()) {
            sendServiceAction(SentinelAgentService.ACTION_START)
            return
        }

        if (!consentBox.isChecked) {
            Toast.makeText(this, "Please confirm the telemetry disclosure checkbox first.", Toast.LENGTH_LONG).show()
            return
        }

        val parsed = EnrollmentBundleParser.parseAndValidate(jsonBox.text.toString())
        parsed.onSuccess { b ->
            val cfg = AgentConfig(
                firebaseProjectId = b.firebaseProjectId,
                firebaseWebApiKey = b.firebaseWebApiKey,
                ownerUid = b.ownerUid,
                enrollmentToken = b.enrollmentToken
            )
            identityStore.saveConfig(cfg)
            validationText.text = "Bundle validated and saved. Starting background agent service..."
            sendServiceAction(SentinelAgentService.ACTION_START)
        }.onFailure { err ->
            validationText.text = "Validation error: ${err.message}"
            Toast.makeText(this, err.message ?: "Invalid enrollment JSON", Toast.LENGTH_LONG).show()
        }
    }

    private fun sendServiceAction(action: String) {
        val intent = Intent(this, SentinelAgentService::class.java).apply {
            this.action = action
        }
        if (action == SentinelAgentService.ACTION_START || action == SentinelAgentService.ACTION_SYNC_NOW) {
            ContextCompat.startForegroundService(this, intent)
        } else {
            startService(intent)
        }
    }
}
