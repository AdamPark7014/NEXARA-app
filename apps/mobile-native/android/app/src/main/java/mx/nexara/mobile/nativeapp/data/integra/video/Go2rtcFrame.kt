package mx.nexara.mobile.nativeapp.data.integra.video

import java.io.UnsupportedEncodingException
import java.net.URI
import java.net.URISyntaxException
import java.net.URLDecoder
import java.net.URLEncoder

/**
 * De la URL HLS que devuelve la API al fotograma JPEG que un teléfono sí puede pintar.
 *
 * **Por qué esto y no video.** El muro web reproduce video de verdad con MSE
 * sobre WebSocket contra go2rtc (`<video-stream>` de go2rtc, `/api/ws`). Eso no
 * se porta a Android: no hay Media Source Extensions fuera de un navegador, y
 * montar el equivalente nativo es un reproductor de streaming completo. Lo que
 * sí existe en go2rtc y sí es una imagen es `/api/frame.jpeg`, que es el mismo
 * respaldo que el propio muro web usa cuando un mosaico no consigue MSE.
 *
 * **Por qué se puede llegar desde el móvil.** El endurecimiento de Traefik que
 * está pendiente de desplegar (`deploy/traefik/nexara.yml`) cierra el prefijo
 * `/go2rtc` abierto y enumera las rutas permitidas; `Path(/go2rtc/api/frame.jpeg)`
 * está en esa lista blanca, junto con las que necesita el navegador. Es decir:
 * esto sigue funcionando DESPUÉS del parche P0, no antes de él.
 *
 * **Lo que hay que saber igualmente.** Esa ruta es pública: la separación es por
 * camino, no por credencial (`docs/INTEGRA-OPS.md`), porque el navegador entra
 * por ella y ponerle contraseña dejaría al muro sin video. El móvil no empeora
 * esa postura —consume exactamente la misma superficie que la web— pero tampoco
 * la arregla, y conviene que quien lea esto lo sepa.
 *
 * La derivación es la misma que hace `apps/web/app/(panels)/integra/_LivePlayer.tsx`
 * (`parseHls`), replicada aquí para que un cambio en el formato de la URL rompa
 * una prueba en vez de una pantalla.
 */
object Go2rtcFrame {

    private const val HLS_SUFFIX = "/api/stream.m3u8"
    private const val FRAME_PATH = "/api/frame.jpeg"

    /** Base de go2rtc y nombre del stream, extraídos de la URL HLS. */
    data class Parsed(val base: String, val streamName: String)

    /**
     * `https://host/go2rtc/api/stream.m3u8?src=cam_x` →
     * `Parsed("https://host/go2rtc", "cam_x")`.
     *
     * Devuelve `null` —en vez de lanzar— ante cualquier cosa inesperada: URL
     * vacía, relativa, sin `?src=`, con otro sufijo o con otro esquema. Quien
     * llama traduce ese `null` en un motivo visible, que es lo que el operador
     * necesita ver.
     *
     * Usa `java.net.URI` a propósito y no `android.net.Uri`: esta función se
     * prueba en la JVM, donde las clases de `android.*` son sustitutos que
     * devuelven `null` en silencio y darían una prueba verde sobre nada.
     */
    fun parseHls(hls: String?): Parsed? {
        val raw = hls?.trim().orEmpty()
        if (raw.isEmpty()) return null

        val uri = try {
            URI(raw)
        } catch (_: URISyntaxException) {
            return null
        }

        val scheme = uri.scheme?.lowercase() ?: return null
        if (scheme != "http" && scheme != "https") return null

        val host = uri.host?.takeIf { it.isNotBlank() } ?: return null
        val path = uri.path ?: return null
        if (!path.endsWith(HLS_SUFFIX)) return null

        val streamName = queryParam(uri.rawQuery, "src")?.takeIf { it.isNotBlank() } ?: return null

        val basePath = path.removeSuffix(HLS_SUFFIX)
        val port = if (uri.port > 0) ":${uri.port}" else ""
        return Parsed(base = "$scheme://$host$port$basePath", streamName = streamName)
    }

    /**
     * URL del siguiente fotograma. `nonce` va como `?t=` para que ni OkHttp ni
     * Coil sirvan el JPEG anterior desde caché: sin él la celda se congelaría en
     * la primera imagen y parecería que el muro funciona cuando no avanza.
     */
    fun frameUrl(hls: String?, nonce: Long): String? {
        val parsed = parseHls(hls) ?: return null
        return frameUrl(parsed, nonce)
    }

    fun frameUrl(parsed: Parsed, nonce: Long): String =
        parsed.base + FRAME_PATH + "?src=" + encode(parsed.streamName) + "&t=" + nonce

    private fun queryParam(rawQuery: String?, key: String): String? {
        val q = rawQuery ?: return null
        for (pair in q.split('&')) {
            if (pair.isEmpty()) continue
            val eq = pair.indexOf('=')
            val name = if (eq < 0) pair else pair.substring(0, eq)
            if (decode(name) != key) continue
            return if (eq < 0) "" else decode(pair.substring(eq + 1))
        }
        return null
    }

    private fun decode(s: String): String = try {
        URLDecoder.decode(s, "UTF-8")
    } catch (_: UnsupportedEncodingException) {
        s
    } catch (_: IllegalArgumentException) {
        // Un `%` suelto en la URL no puede tumbar el muro entero.
        s
    }

    private fun encode(s: String): String = try {
        // URLEncoder es de formularios: codifica el espacio como `+`, que en la
        // parte de consulta de una URL no es lo mismo que `%20` para go2rtc.
        URLEncoder.encode(s, "UTF-8").replace("+", "%20")
    } catch (_: UnsupportedEncodingException) {
        s
    }
}

/**
 * Ritmo de petición de fotogramas: **autorregulado, nunca por temporizador fijo**.
 *
 * El muro web pedía un JPEG cada 1100 ms con un `setInterval` contra un servidor
 * que tarda entre 0,8 y 2,5 s en servir cada uno —cada fotograma abre su propia
 * sesión RTSP y espera un keyframe—. Se pedía más rápido de lo que se podía
 * entregar, cada petición abortada dejaba un «broken pipe», y salieron **2 254 en
 * una sola sesión de producción** (documentado en `.ai/RELEVO.md`).
 *
 * La regla aquí es la que arregló el muro: el siguiente fotograma se pide cuando
 * ha llegado el anterior, y este objeto solo decide cuánto esperar ENTRE uno y
 * el siguiente. Es imposible adelantar al servidor porque nunca hay dos
 * peticiones vivas para la misma celda.
 *
 * Es un objeto puro y sin reloj para poder probarlo: la política de espera se
 * verifica sin levantar corrutinas ni cámaras.
 */
object FramePacing {

    /**
     * Descanso mínimo entre fotogramas de una misma celda, ya con el anterior en
     * pantalla. No es el periodo de refresco —lo manda el servidor— sino un
     * suelo para no encadenar peticiones sin respirar en cuanto una vaya rápida.
     */
    const val MIN_GAP_MS: Long = 900L

    /** Techo del retroceso: una cámara caída se reintenta, pero cada 15 s. */
    const val MAX_BACKOFF_MS: Long = 15_000L

    /**
     * Cuánto esperar antes de pedir el siguiente fotograma.
     *
     * Con la cámara respondiendo es siempre [MIN_GAP_MS]. En cuanto falla, el
     * hueco se duplica con cada fallo seguido hasta [MAX_BACKOFF_MS]: una cámara
     * apagada no puede costar lo mismo en red y batería que una que sí ve, y sin
     * este retroceso una rejilla con seis cámaras caídas martillea el servidor
     * indefinidamente.
     */
    fun nextDelayMs(consecutiveFailures: Int): Long {
        if (consecutiveFailures <= 0) return MIN_GAP_MS
        // Tope del desplazamiento antes de multiplicar: sin él, un contador que
        // crezca sin freno desborda el Long y devuelve un retraso negativo.
        val shift = consecutiveFailures.coerceAtMost(6)
        val backoff = MIN_GAP_MS shl shift
        return backoff.coerceAtMost(MAX_BACKOFF_MS)
    }
}
