package mx.nexara.mobile.nativeapp.data.realtime

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Helper to refresh ViewModels based on `entity:updated` (Prisma model name).
 *
 * Example model payload from backend: { model: "Notification", action: "create", ... }
 */
fun ViewModel.refreshOnModels(
    models: Set<String>,
    throttleMs: Long = 900L,
    refresh: () -> Unit,
): Job {
    val normalized = models.map { it.trim().lowercase() }.toSet()
    return viewModelScope.launch {
        var last = 0L
        RealtimeBus.events.collect { ev ->
            val model = ev.model?.trim()?.lowercase() ?: return@collect
            if (!normalized.contains(model)) return@collect

            val now = System.currentTimeMillis()
            val elapsed = now - last
            if (elapsed < throttleMs) {
                delay(throttleMs - elapsed)
            }
            last = System.currentTimeMillis()
            refresh()
        }
    }
}

