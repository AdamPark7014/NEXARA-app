package mx.nexara.mobile.nativeapp.navigation

import mx.nexara.mobile.nativeapp.access.DeepLinkDestination
import mx.nexara.mobile.nativeapp.access.PanelId

/** Cola de deep link hasta que la app esté lista (sesión + NavHost). */
object PendingDeepLink {
    @Volatile
    var destination: DeepLinkDestination? = null

    fun consumeNotifications(): Boolean {
        if (destination is DeepLinkDestination.Notifications) {
            destination = null
            return true
        }
        return false
    }

    fun consumeModuleFor(panel: PanelId): String? {
        val d = destination as? DeepLinkDestination.Module ?: return null
        if (d.panel != panel) return null
        destination = null
        return d.key
    }

    fun peekModulePanel(): PanelId? = (destination as? DeepLinkDestination.Module)?.panel
}
