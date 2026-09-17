package mx.nexara.mobile.nativeapp.data.offline

/**
 * Marcas que la cola le pone al cuerpo de una mutación **al encolarla**.
 *
 * Contrato A: una checada lleva `offline: true` **solo** cuando se capturó sin
 * conexión y se reenvía después. Quien lo sabe es la cola, no la pantalla: si
 * lo pusiera la pantalla, toda checada diría «sin conexión» y el servidor le
 * creería la hora del teléfono (que es justo lo que no queremos).
 *
 * Sin Android adentro: se prueba en la JVM (`OfflineQueueBodyTest`).
 */
object OfflineQueueBody {

    /** `POST .../attendance` (no `attendance/justificaciones`, no `attendance/…`). */
    fun isAttendanceCheckIn(url: String, method: String): Boolean {
        if (!method.equals("POST", ignoreCase = true)) return false
        val ruta = url.substringBefore('?').trimEnd('/')
        return ruta.endsWith("/attendance")
    }

    /**
     * Devuelve el cuerpo tal cual, salvo cuando es una checada JSON: ahí le
     * agrega `"offline":true`. Un cuerpo que ya lo trae, uno binario
     * (`nexara-media-bin://…`) o uno que no es JSON se devuelven intactos.
     */
    fun markOffline(url: String, method: String, contentType: String, body: String?): String? {
        if (body == null) return null
        if (!isAttendanceCheckIn(url, method)) return body
        if (!contentType.contains("json", ignoreCase = true)) return body
        val trimmed = body.trimStart()
        if (!trimmed.startsWith("{")) return body
        if (OFFLINE_KEY.containsMatchIn(trimmed)) return body
        val rest = trimmed.removePrefix("{")
        return if (rest.trimStart().startsWith("}")) {
            "{\"offline\":true$rest"
        } else {
            "{\"offline\":true,$rest"
        }
    }

    private val OFFLINE_KEY = Regex("\"offline\"\\s*:")
}
