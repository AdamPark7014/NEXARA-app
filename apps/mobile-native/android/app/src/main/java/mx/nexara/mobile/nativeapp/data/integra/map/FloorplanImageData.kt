package mx.nexara.mobile.nativeapp.data.integra.map

/**
 * El plano llega dentro del JSON, no por una URL.
 *
 * La consola web sube la imagen con `FileReader.readAsDataURL`, así que
 * `imageData` es un URI de datos: `data:image/png;base64,iVBORw0…`. Este objeto
 * separa la cabecera del contenido y deja el base64 listo para decodificar.
 *
 * Es lógica pura y sin Android a propósito: la decodificación de verdad necesita
 * `android.util.Base64` (el `java.util.Base64` del JDK exige API 26 y aquí
 * `minSdk` es 24), y eso no se puede ejecutar en una prueba unitaria. Lo que sí
 * se puede probar —y donde de verdad se rompe— es esto: la cabecera, los saltos
 * de línea dentro del base64 y el caso de que lo guardado no sea una imagen
 * incrustada sino una URL.
 */
object FloorplanImageData {

    /** Contenido ya limpio, listo para `android.util.Base64.decode`. */
    data class Payload(
        val mimeType: String?,
        val base64: String,
    )

    private const val DATA_PREFIX = "data:"
    private const val BASE64_MARK = ";base64,"

    /**
     * Extrae el base64 del plano.
     *
     * Devuelve `null` cuando no hay nada que decodificar: campo vacío, o un
     * `imageData` que en realidad es una URL. Ese `null` no es un error a
     * tragarse — la pantalla tiene que decir que el plano no está incrustado en
     * vez de enseñar un recuadro en blanco.
     */
    fun parse(raw: String?): Payload? {
        val s = raw?.trim().orEmpty()
        if (s.isEmpty()) return null
        if (isRemoteUrl(s)) return null

        if (s.startsWith(DATA_PREFIX, ignoreCase = true)) {
            val mark = s.indexOf(BASE64_MARK, ignoreCase = true)
            // `data:` sin `;base64,` es texto plano (SVG sin codificar, por
            // ejemplo). No es lo que sube la web y no se adivina.
            if (mark < 0) return null
            val mime = s.substring(DATA_PREFIX.length, mark)
                .substringBefore(';')
                .trim()
                .takeIf { it.isNotEmpty() }
            val body = stripWhitespace(s.substring(mark + BASE64_MARK.length))
            if (body.isEmpty()) return null
            return Payload(mimeType = mime, base64 = body)
        }

        // Base64 pelado, sin cabecera. Lo aceptamos porque el servidor sólo
        // exige que `imageData` mida más de 32 caracteres: nada garantiza la
        // cabecera, y un plano que existe tiene que verse.
        val body = stripWhitespace(s)
        if (body.length < 32 || !looksLikeBase64(body)) return null
        return Payload(mimeType = null, base64 = body)
    }

    /**
     * ¿Lo guardado es una URL en vez de la imagen? Con `http(s)://` o una ruta
     * absoluta del servidor. Se distingue para poder decirlo con palabras.
     */
    fun isRemoteUrl(raw: String?): Boolean {
        val s = raw?.trim().orEmpty()
        if (s.isEmpty()) return false
        return s.startsWith("http://", ignoreCase = true) ||
            s.startsWith("https://", ignoreCase = true) ||
            (s.startsWith("/") && !s.startsWith("//"))
    }

    /**
     * Los saltos de línea dentro del base64 son legales en un URI de datos
     * generado a mano y `Base64.decode` no siempre los perdona. Se quitan aquí,
     * una vez, en vez de descubrirlo con un plano en blanco en una caseta.
     */
    private fun stripWhitespace(raw: String): String {
        if (raw.none { it.isWhitespace() }) return raw.trim()
        return buildString(raw.length) {
            for (ch in raw) if (!ch.isWhitespace()) append(ch)
        }
    }

    private fun looksLikeBase64(s: String): Boolean = s.all {
        it in 'A'..'Z' || it in 'a'..'z' || it in '0'..'9' || it == '+' || it == '/' || it == '='
    }
}
