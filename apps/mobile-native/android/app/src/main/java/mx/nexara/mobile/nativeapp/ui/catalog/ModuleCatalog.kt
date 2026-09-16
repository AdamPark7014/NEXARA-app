package mx.nexara.mobile.nativeapp.ui.catalog

/**
 * Catálogo de NEXARA Core — espejo de `CORE_OLA1_MODULE_IDS`
 * (`apps/web/lib/core-surface.ts`) filtrado de `apps/web/lib/access-matrix.ts`.
 *
 * Solo existe ERP/Core. El resto de paneles (CRM, OPS, STUDIO, LAB, INTEGRA,
 * Contabilidad) y los módulos ERP fuera de Core se quitaron de la app.
 *
 * `webPath` apunta a la ruta equivalente en apps/web (sin host).
 * `parityStatus` es la fuente de verdad; ver `docs/native-parity-matrix.md` y
 * `scripts/check-app-web-parity.py`.
 */
object ParityStatus {
    const val NATIVO = "NATIVO"
    const val SOLO_LECTURA = "SOLO_LECTURA"
    const val CASCARON = "CASCARON"
    const val AUSENTE = "AUSENTE"
    const val WEBVIEW = "WEBVIEW"
}

data class ModuleEntry(
    val key: String,
    val label: String,
    val icon: String,
    val webPath: String,
    val parityStatus: String = ParityStatus.AUSENTE,
) {
    /** true solo con CRUD/ops nativos reales (no listas finas ni placeholders). */
    val nativeImplemented: Boolean get() = parityStatus == ParityStatus.NATIVO
}

private fun mod(
    key: String,
    label: String,
    icon: String,
    webPath: String,
    status: String,
) = ModuleEntry(key, label, icon, webPath, status)

object ModuleCatalog {

    /**
     * Módulos de Core. `mis-actividades` y `pizarra` son una sola entrada
     * («Actividades»); la vista «Mis actividades» vive dentro de ella.
     */
    val core: List<ModuleEntry> = listOf(
        mod("activities", "Actividades", "📋", "/erp/pizarra", ParityStatus.NATIVO),
        mod("attendance", "Asistencias", "🗓️", "/erp/asistencias", ParityStatus.NATIVO),
        mod("chat", "Chat", "💬", "/erp/chat", ParityStatus.NATIVO),
        mod("erp-clients", "Clientes", "🤝", "/erp/clientes", ParityStatus.NATIVO),
        mod("my-profile", "Mi perfil", "👤", "/erp/my-profile", ParityStatus.NATIVO),
        mod("notifications-center", "Notificaciones", "🔔", "/erp/notifications-center", ParityStatus.NATIVO),
    )

    fun byKey(key: String): ModuleEntry? = core.firstOrNull { it.key == key }
}
