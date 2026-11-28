package com.sentinelsoc.agent.service

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

data class AgentUiSnapshot(
    val running: Boolean = false,
    val enrolled: Boolean = false,
    val endpointId: String = "",
    val statusText: String = "Idle (Not Enrolled)",
    val pendingQueueCount: Int = 0,
    val logs: List<String> = emptyList()
)

object AgentRuntimeState {
    private val _state = MutableStateFlow(AgentUiSnapshot())
    val state: StateFlow<AgentUiSnapshot> = _state.asStateFlow()
    private val sdf = SimpleDateFormat("HH:mm:ss", Locale.US)

    @Synchronized
    fun update(
        running: Boolean = _state.value.running,
        enrolled: Boolean = _state.value.enrolled,
        endpointId: String = _state.value.endpointId,
        statusText: String = _state.value.statusText,
        pendingQueueCount: Int = _state.value.pendingQueueCount
    ) {
        _state.value = _state.value.copy(
            running = running,
            enrolled = enrolled,
            endpointId = endpointId,
            statusText = statusText,
            pendingQueueCount = pendingQueueCount
        )
    }

    @Synchronized
    fun log(msg: String) {
        val stamp = sdf.format(Date())
        val updated = (_state.value.logs + "[$stamp] $msg").takeLast(80)
        _state.value = _state.value.copy(logs = updated)
    }
}
