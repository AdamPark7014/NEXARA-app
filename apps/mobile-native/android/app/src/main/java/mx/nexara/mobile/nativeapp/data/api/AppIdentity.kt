package mx.nexara.mobile.nativeapp.data.api

/**
 * Cabeceras con las que la app se presenta al API, sin Android: se prueban en
 * la JVM (`AppIdentityTest`). Quien las manda es [ApiClient.aplicarIdentidad];
 * aquí solo vive el formato.
 *
 * Tienen que ir en TODO lo que la app manda al API, no solo en Retrofit. La
 * cola sin conexión reenviaba las checadas con su propio cliente y sin estas
 * cabeceras: el servidor las veía como «Escritorio · PC», origen WEB, y con la
 * excepción web cerrada las rechazaba (5 checadas reales entre el 28-09 y el 06-10).
 */
object AppIdentity {

    /** Lo que el servidor muestra como «navegador»: «Móvil · Android · NEXARA App». */
    const val NAVEGADOR = "NEXARA App"

    /**
     * `NexaraApp/1.2.3 (Android 14; samsung SM-A536B) OkHttp`. Lleva la palabra
     * "Android" a propósito — es lo que el detector del servidor busca para
     * clasificar el registro como móvil.
     */
    fun userAgent(version: String, release: String?, modelo: String): String =
        "NexaraApp/${version.ifBlank { "0" }} (Android ${release ?: "?"}; $modelo) OkHttp"

    /** Modelo legible para la ficha de dispositivo del servidor: «samsung SM-A536B». */
    fun modelo(fabricante: String?, modelo: String?): String =
        listOf(fabricante, modelo)
            .filter { !it.isNullOrBlank() }
            .joinToString(" ")
            .ifBlank { "Android" }

    /**
     * @param nombreVisible el nombre del teléfono en Ajustes («Galaxy S24 Ultra»).
     * Viaja codificado en URL porque puede traer acentos y OkHttp solo admite
     * ASCII en cabeceras; si no hay, la cabecera no va.
     */
    fun cabeceras(
        version: String,
        release: String?,
        modelo: String,
        nombreVisible: String?,
    ): Map<String, String> = buildMap {
        put("User-Agent", userAgent(version, release, modelo))
        put("X-Device-Model", modelo)
        // El servidor usa esta cabecera como "navegador" al describir el
        // registro; así un fichaje desde la app se lee "Móvil · Android · NEXARA
        // App" y no se confunde con Chrome en el mismo teléfono. Exigirla en el
        // servidor para los fichajes que digan venir del móvil queda pendiente de
        // que la v2 esté desplegada: ver
        // `.ai/auditoria-2026-09/14-integridad-datos-remediacion.md`.
        put("X-Device-Browser", NAVEGADOR)
        put("X-Device-OS", "Android ${release ?: ""}".trim())
        nombreVisible?.takeIf { it.isNotBlank() }?.let {
            put("X-Device-Name", java.net.URLEncoder.encode(it, "UTF-8"))
        }
    }
}
