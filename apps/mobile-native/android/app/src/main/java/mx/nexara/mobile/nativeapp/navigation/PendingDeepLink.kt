package mx.nexara.mobile.nativeapp.navigation

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import mx.nexara.mobile.nativeapp.access.DeepLinkDestination
import mx.nexara.mobile.nativeapp.access.PanelId

/** Destino de módulo pendiente (incluye entidad opcional). */
data class PendingModuleLink(
    val key: String,
    val entityId: Long? = null,
    val params: Map<String, String> = emptyMap(),
)

/** Cola de deep link hasta que la app esté lista (sesión + NavHost). */
object PendingDeepLink {

    @Volatile
    var destination: DeepLinkDestination? = null

    private val _signal = MutableStateFlow(0)
    val signal: StateFlow<Int> = _signal.asStateFlow()

    fun publish(destination: DeepLinkDestination?) {
        this.destination = destination
        _signal.update { it + 1 }
    }

    /** Toma el destino pendiente, sea cual sea, y lo limpia. */
    fun consume(): DeepLinkDestination? {
        val d = destination ?: return null
        destination = null
        return d
    }

    fun consumeModuleDestination(panel: PanelId): PendingModuleLink? {
        val d = destination as? DeepLinkDestination.Module ?: return null
        if (d.panel != panel) return null
        destination = null
        return PendingModuleLink(
            key = d.key,
            entityId = d.entityId,
            params = d.params,
        )
    }
}
