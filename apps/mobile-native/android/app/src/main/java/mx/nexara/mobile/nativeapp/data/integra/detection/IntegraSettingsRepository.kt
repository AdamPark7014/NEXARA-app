package mx.nexara.mobile.nativeapp.data.integra.detection

import android.content.Context
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.ApiClient

/**
 * Ajustes de INTEGRA: sitios, sincronización y salud del abanico ACS.
 *
 * Las tres operaciones que cambian el mundo —[deleteSite], [runSync] y
 * [setModuleEnabled]— están separadas de las lecturas y llevan nombre explícito
 * para que en la pantalla no se llamen por accidente. Ninguna se ejecuta sin
 * que el operador haya visto antes lo que dice [deletionImpact] / [syncImpact]
 * / [moduleToggleImpact].
 */
class IntegraSettingsRepository(context: Context) {
    private val authRepo = AuthRepository(context)
    private val api: IntegraSettingsApi = ApiClient.authed(
        tokenProvider = { authRepo.token() },
        companyIdProvider = { authRepo.companyId() },
    ).create(IntegraSettingsApi::class.java)

    /* ── Lecturas ───────────────────────────────────────────────────── */

    suspend fun sites(): List<IntegraSite> = parseSites(IntegraJson.list(api.listSites()))

    suspend fun lastSync(siteId: Int): SyncRun? = parseSyncRun(IntegraJson.map(api.lastSync(siteId)))

    suspend fun acsFanout(siteId: Int? = null): List<AcsFanoutEntry> =
        IntegraJson.itemsOf(IntegraJson.map(api.acsFanoutStatus(siteId))).mapNotNull(::parseFanoutEntry)

    suspend fun capabilities(siteId: Int? = null): IntegraCapabilityCounts =
        parseCapabilityCounts(IntegraJson.map(api.capabilities(siteId)))

    /** Regiones del espejo: cuántas y cómo se llaman. */
    suspend fun regions(siteId: Int? = null): List<String> =
        IntegraJson.itemsOf(IntegraJson.map(api.regions(siteId))).mapNotNull { row ->
            (row["name"] as? String)?.takeIf { it.isNotBlank() }
                ?: (row["id"] as? String)?.takeIf { it.isNotBlank() }
        }

    /* ── Escrituras ─────────────────────────────────────────────────── */

    suspend fun createSite(draft: SiteDraft, isFirstSite: Boolean): IntegraSite? =
        parseSite(IntegraJson.map(api.createSite(siteCreateBody(draft, isFirstSite))))

    /**
     * Cambia un módulo del sitio. Se manda el mapa COMPLETO de overrides, no
     * solo la clave tocada: el servidor sustituye la columna entera y un envío
     * parcial apagaría en silencio todo lo que no viniera.
     */
    suspend fun setModuleEnabled(site: IntegraSite, moduleKey: String, enabled: Boolean): IntegraSite? {
        val merged = LinkedHashMap<String, Any?>()
        site.modulesOverride?.forEach { (k, v) -> merged[k] = v }
        merged[moduleKey] = enabled
        return parseSite(
            IntegraJson.map(api.updateSite(site.id, mapOf("modulesOverride" to merged))),
        )
    }

    suspend fun setActive(site: IntegraSite, active: Boolean): IntegraSite? =
        parseSite(IntegraJson.map(api.updateSite(site.id, mapOf("isActive" to active))))

    suspend fun makeDefault(site: IntegraSite): IntegraSite? =
        parseSite(IntegraJson.map(api.updateSite(site.id, mapOf("isDefault" to true))))

    suspend fun rename(site: IntegraSite, label: String): IntegraSite? =
        parseSite(IntegraJson.map(api.updateSite(site.id, mapOf("label" to label.trim()))))

    /** DESTRUCTIVO. Arrastra el inventario espejo del sitio. */
    suspend fun deleteSite(siteId: Int) {
        api.deleteSite(siteId)
    }

    /** Reconstruye el espejo desde los equipos. Tarda y carga el parque. */
    suspend fun runSync(siteId: Int): SyncRun? = parseSyncRun(IntegraJson.map(api.runSync(siteId)))
}
