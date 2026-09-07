package mx.nexara.mobile.nativeapp.data.integra.detection

/**
 * Contrato de AJUSTES de INTEGRA — sitios, sincronización y estado del abanico ACS.
 *
 * Espejo Kotlin de `apps/web/app/(panels)/integra/settings/page.tsx`. Kotlin
 * puro y sin Android: aquí vive lo que se puede probar sin emulador.
 *
 * **Este módulo destruye cosas.** Borrar un sitio se lleva por delante su
 * inventario espejo y la conexión con el parque; sincronizar reescribe el
 * espejo entero desde los equipos. Las funciones [deletionImpact] y
 * [syncImpact] existen para que el diálogo de confirmación diga **qué se
 * pierde** con nombre y cifras, y no un «¿Estás seguro?» al aire. Hay
 * precedente en este proyecto: en la web, pulsar un pin del plano lo borraba
 * sin preguntar, y el `window.confirm` que había aquí ni decía qué sitio era.
 */

/* ── Tipos ──────────────────────────────────────────────────────────────── */

/** Inventario espejo de un sitio. Todo nulable: el `_count` puede no venir. */
data class SiteInventory(
    val cameras: Int? = null,
    val doors: Int? = null,
    val people: Int? = null,
    val vehicles: Int? = null,
) {
    val isEmpty: Boolean
        get() = cameras == null && doors == null && people == null && vehicles == null
}

data class IntegraSite(
    val id: Int,
    val name: String,
    val label: String?,
    val host: String,
    val provider: String,
    val isActive: Boolean,
    val isDefault: Boolean,
    val lastSyncAt: String?,
    val serviceClientId: Int?,
    /** `null` = el sitio no tiene overrides: todos los módulos por defecto. */
    val modulesOverride: Map<String, Boolean>?,
    val inventory: SiteInventory,
) {
    /** Cómo se llama en pantalla: la etiqueta si la hay, si no el nombre. */
    val displayName: String get() = label?.takeIf { it.isNotBlank() } ?: name
}

/** Última corrida de sincronización (`GET integra/sync/last`). `null` = nunca. */
data class SyncRun(
    val status: String?,
    val error: String?,
    val startedAt: String?,
    val finishedAt: String?,
    val cameras: Int?,
    val doors: Int?,
)

/** Un push ACS reciente (`GET integra/acs-fanout/status`). */
data class AcsFanoutEntry(
    val id: String,
    val at: String?,
    val op: String,
    val employeeNo: String,
    val pendingRetry: Boolean,
    val okCount: Int,
    val failCount: Int,
    val note: String?,
)

/** Conteos globales del sitio (`GET integra/capabilities`). */
data class IntegraCapabilityCounts(
    val entries: List<Pair<String, Int>>,
    val modules: List<Pair<String, Boolean>>,
)

/* ── Catálogo de módulos ────────────────────────────────────────────────── */

val MODULE_LABELS: List<Pair<String, String>> = listOf(
    "video" to "Video",
    "access" to "Accesos",
    "people" to "Personas",
    "events" to "Eventos",
    "vehicles" to "Vehículos",
    "anpr" to "ANPR",
    "visitors" to "Visitas",
    "alarms" to "Alarmas",
)

fun moduleLabel(key: String): String =
    MODULE_LABELS.firstOrNull { it.first == key }?.second ?: key

/**
 * Overrides que solo existen en Artemis. En HCT no deben fingirse disponibles
 * (ADR-0019): enseñar un interruptor que no hace nada es peor que no enseñarlo.
 */
val HCT_ARTEMIS_ONLY: Set<String> = setOf("people", "visitors", "vehicles", "anpr")

val PROVIDERS: List<String> = listOf("ARTEMIS", "HCT", "ISAPI")

fun providerLabel(v: String): String = when (v.uppercase()) {
    "ARTEMIS" -> "HikCentral (en sitio)"
    "HCT" -> "Hik-Connect (nube)"
    "ISAPI" -> "ISAPI directo (LAN)"
    else -> v
}

/** ¿Este módulo se puede tocar en un sitio de este proveedor? */
fun moduleApplies(provider: String, moduleKey: String): Boolean =
    !(provider.equals("HCT", ignoreCase = true) && moduleKey in HCT_ARTEMIS_ONLY)

/** Estado efectivo de un módulo: sin override explícito, encendido. */
fun moduleEnabled(site: IntegraSite, moduleKey: String): Boolean =
    site.modulesOverride?.get(moduleKey) != false

/* ── Lectura defensiva ──────────────────────────────────────────────────── */

private fun asMap(v: Any?): Map<String, Any?>? {
    if (v !is Map<*, *>) return null
    val out = LinkedHashMap<String, Any?>(v.size)
    for ((k, value) in v) if (k is String) out[k] = value
    return out
}

private fun asInt(v: Any?): Int? = when (v) {
    is Number -> if (v.toDouble().isFinite()) v.toInt() else null
    is String -> v.trim().toIntOrNull()
    else -> null
}

private fun asText(v: Any?): String? = when (v) {
    is String -> v.trim().takeIf { it.isNotEmpty() && it != "null" }
    is Number -> v.toString()
    else -> null
}

private fun asBool(v: Any?): Boolean? = when (v) {
    is Boolean -> v
    is String -> when (v.lowercase()) {
        "true", "1" -> true
        "false", "0" -> false
        else -> null
    }
    is Number -> v.toInt() != 0
    else -> null
}

fun parseInventory(v: Any?): SiteInventory {
    val m = asMap(v) ?: return SiteInventory()
    return SiteInventory(
        cameras = asInt(m["cameras"]),
        doors = asInt(m["doors"]),
        people = asInt(m["people"]),
        vehicles = asInt(m["vehicles"]),
    )
}

/**
 * Fila de `GET integra/sites` → [IntegraSite].
 *
 * Devuelve `null` si no hay id numérico: sin id no se puede ni editar ni
 * borrar, y una fila así en la lista solo sirve para que alguien la pulse y no
 * pase nada.
 */
fun parseSite(raw: Any?): IntegraSite? {
    val m = asMap(raw) ?: return null
    val id = asInt(m["id"]) ?: return null
    val overrides = asMap(m["modulesOverride"])?.let { src ->
        val out = LinkedHashMap<String, Boolean>()
        for ((k, value) in src) asBool(value)?.let { out[k] = it }
        out
    }
    return IntegraSite(
        id = id,
        name = asText(m["name"]) ?: "Sitio $id",
        label = asText(m["label"]),
        host = asText(m["host"]) ?: "",
        provider = (asText(m["provider"]) ?: "ARTEMIS").uppercase(),
        isActive = asBool(m["isActive"]) ?: true,
        isDefault = asBool(m["isDefault"]) ?: false,
        lastSyncAt = asText(m["lastSyncAt"]),
        serviceClientId = asInt(m["serviceClientId"]),
        modulesOverride = overrides,
        inventory = parseInventory(m["_count"]),
    )
}

fun parseSites(rows: List<Map<String, Any?>>): List<IntegraSite> = rows.mapNotNull(::parseSite)

fun parseSyncRun(raw: Any?): SyncRun? {
    val m = asMap(raw) ?: return null
    if (m.isEmpty()) return null
    return SyncRun(
        status = asText(m["status"]),
        error = asText(m["error"]),
        startedAt = asText(m["startedAt"]),
        finishedAt = asText(m["finishedAt"]),
        cameras = asInt(m["cameras"]),
        doors = asInt(m["doors"]),
    )
}

fun parseFanoutEntry(raw: Any?): AcsFanoutEntry? {
    val m = asMap(raw) ?: return null
    val results = (m["results"] as? List<*>).orEmpty().mapNotNull(::asMap)
    val ok = results.count { asBool(it["ok"]) == true }
    return AcsFanoutEntry(
        id = asText(m["id"]) ?: return null,
        at = asText(m["at"]),
        op = asText(m["op"]) ?: "—",
        employeeNo = asText(m["employeeNo"]) ?: "—",
        pendingRetry = asBool(m["pendingRetry"]) ?: false,
        okCount = ok,
        failCount = results.size - ok,
        note = asText(m["note"]),
    )
}

/**
 * `GET integra/capabilities` → cifras y módulos.
 *
 * El contrato del servidor no está cerrado, así que se lee por forma: los
 * números de primer nivel son conteos y los booleanos, módulos encendidos.
 * Lo que no encaje se ignora en vez de inventarle un sitio en la pantalla.
 */
fun parseCapabilityCounts(raw: Any?): IntegraCapabilityCounts {
    val m = asMap(raw) ?: return IntegraCapabilityCounts(emptyList(), emptyList())
    val counts = ArrayList<Pair<String, Int>>()
    val modules = ArrayList<Pair<String, Boolean>>()
    for ((k, v) in m) {
        when (v) {
            is Boolean -> modules.add(k to v)
            is Number -> counts.add(k to v.toInt())
            is Map<*, *> -> {
                val nested = asMap(v).orEmpty()
                for ((nk, nv) in nested) {
                    when (nv) {
                        is Boolean -> modules.add(nk to nv)
                        is Number -> counts.add(nk to nv.toInt())
                        else -> Unit
                    }
                }
            }
            else -> Unit
        }
    }
    return IntegraCapabilityCounts(entries = counts, modules = modules)
}

/* ── Consecuencias, dichas con todas las letras ─────────────────────────── */

/** Lo que hay que enseñar antes de borrar un sitio. */
data class DestructiveImpact(
    val title: String,
    val message: String,
    val confirmLabel: String,
    /** Frase corta que el operador tiene que reconocer antes de confirmar. */
    val requiresTyping: String? = null,
)

/**
 * Borrar un sitio: qué desaparece exactamente.
 *
 * Se nombra el sitio, su servidor y su inventario en cifras. Y se dice lo que
 * NO pasa —los equipos no se tocan— porque un operador que teme desconfigurar
 * cámaras acaba dejando sitios muertos en la lista por no atreverse.
 */
fun deletionImpact(site: IntegraSite): DestructiveImpact {
    val inv = site.inventory
    val arrastra = if (inv.isEmpty) {
        ""
    } else {
        " Se lleva su inventario espejo: ${inv.cameras ?: 0} cámaras, " +
            "${inv.doors ?: 0} puertas, ${inv.people ?: 0} personas y " +
            "${inv.vehicles ?: 0} vehículos."
    }
    val predeterminado = if (site.isDefault) {
        " Además es el sitio PREDETERMINADO: al borrarlo, las pantallas que no " +
            "nombran sitio se quedan sin ninguno hasta que marques otro."
    } else {
        ""
    }
    return DestructiveImpact(
        title = "Eliminar sitio",
        message = "Vas a eliminar «${site.displayName}» (${site.host}).$arrastra$predeterminado " +
            "Los equipos no se tocan: lo que se pierde es la conexión y todo lo sincronizado.",
        confirmLabel = "Eliminar sitio",
        requiresTyping = site.displayName,
    )
}

/**
 * Sincronizar: qué reescribe.
 *
 * No borra datos del cliente, pero sí reconstruye el espejo contra el parque y
 * habla con equipos que van por Tailscale a 87 ms; en un sitio de dieciséis
 * cámaras eso no es instantáneo ni gratis. Merece un aviso, no un botón suelto.
 */
fun syncImpact(site: IntegraSite): DestructiveImpact = DestructiveImpact(
    title = "Sincronizar inventario",
    message = "Se va a reconstruir el espejo de «${site.displayName}» preguntando a los " +
        "equipos de ${site.host}. Sobrescribe cámaras, puertas y equipos con lo que " +
        "conteste el parque, y las fichas que solo existan en NEXARA no se pierden pero " +
        "tampoco se crean allá. Tarda y carga los equipos: no lo lances dos veces seguidas.",
    confirmLabel = "Sincronizar ahora",
)

/**
 * Apagar un módulo del sitio: qué deja de verse.
 *
 * No borra nada, pero deja pantallas vacías para todo el mundo en ese sitio, y
 * eso desde el móvil se hace con un dedo sin querer.
 */
fun moduleToggleImpact(site: IntegraSite, moduleKey: String, turningOn: Boolean): DestructiveImpact {
    val nombre = moduleLabel(moduleKey)
    return if (turningOn) {
        DestructiveImpact(
            title = "Activar $nombre",
            message = "«$nombre» volverá a aparecer en «${site.displayName}» para todos los " +
                "usuarios con acceso al sitio.",
            confirmLabel = "Activar",
        )
    } else {
        DestructiveImpact(
            title = "Desactivar $nombre",
            message = "«$nombre» dejará de aparecer en «${site.displayName}» para TODOS los " +
                "usuarios del sitio, no solo para ti. Los datos siguen en la base: se " +
                "ocultan, no se borran.",
            confirmLabel = "Desactivar",
        )
    }
}

/* ── Alta de sitio ──────────────────────────────────────────────────────── */

/** Lo que se teclea para dar de alta un sitio. Las claves son del cliente. */
data class SiteDraft(
    val name: String = "",
    val label: String = "",
    val host: String = "",
    val appKey: String = "",
    val appSecret: String = "",
    val provider: String = "ARTEMIS",
)

/**
 * Qué impide crear el sitio. El servidor vuelve a validar; esto solo evita un
 * viaje a la red por un campo vacío.
 */
fun siteDraftProblems(d: SiteDraft): List<String> {
    val out = ArrayList<String>()
    if (d.name.trim().isBlank()) out.add("El sitio necesita un nombre.")
    val host = d.host.trim()
    if (host.isBlank()) {
        out.add("Falta la dirección del servidor.")
    } else if (!host.startsWith("http://") && !host.startsWith("https://")) {
        out.add("La dirección del servidor debe empezar por http:// o https://.")
    }
    if (d.appKey.trim().isBlank()) out.add("Falta la clave de aplicación (appKey).")
    if (d.appSecret.trim().isBlank()) out.add("Falta el secreto de aplicación (appSecret).")
    if (d.provider.uppercase() !in PROVIDERS) out.add("Tipo de conexión no reconocido.")
    return out
}

/** Borrador → cuerpo del POST. El host va sin barra final, como en la web. */
fun siteCreateBody(d: SiteDraft, isFirstSite: Boolean): Map<String, Any?> = buildMap {
    put("name", d.name.trim())
    put("host", d.host.trim().trimEnd('/'))
    put("appKey", d.appKey.trim())
    put("appSecret", d.appSecret.trim())
    put("provider", d.provider.uppercase())
    put("isDefault", isFirstSite)
    val label = d.label.trim()
    if (label.isNotEmpty()) put("label", label)
}
