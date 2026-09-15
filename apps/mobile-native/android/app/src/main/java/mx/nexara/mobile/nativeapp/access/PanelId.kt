package mx.nexara.mobile.nativeapp.access

/**
 * Superficies de la app — espejo de `apps/web/lib/core-surface.ts`.
 *
 * Solo existe NEXARA Core (ERP). El portal de clientes (`/tickets`,
 * portal.nexara.com.mx) se conserva únicamente para cuentas de cliente y de
 * sucursal: el personal interno nunca lo ve. CRM, OPS, STUDIO, LAB, INTEGRA y
 * Contabilidad ya no son paneles.
 */
enum class PanelId(
    val key: String,
    val displayName: String,
) {
    ERP(key = "erp", displayName = "NEXARA Core"),
    PORTAL(key = "portal", displayName = "Portal clientes"),
}
