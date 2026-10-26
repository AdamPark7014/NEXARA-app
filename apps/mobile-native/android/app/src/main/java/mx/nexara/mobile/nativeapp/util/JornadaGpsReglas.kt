package mx.nexara.mobile.nativeapp.util

/**
 * Reglas del GPS de jornada, sin Android para probarlas en la JVM (`JornadaGpsReglasTest`).
 *
 * Adam (23-10-2026): «debe tomarse cada media hora». Un punto cada [CADENCIA_MS] desde la entrada
 * hasta la salida, con la app cerrada o en segundo plano y con o sin actividad en curso; sin
 * ráfagas. Lo que pasaba antes:
 *
 * - Sin actividad, el pedido al GPS llevaba «mínimo 500 m entre puntos»: quien no se movía no
 *   mandaba nada en horas (Android lo aplica como filtro, no como «o»).
 * - Con actividad mandaba cada 5–10 min, y al iniciarla rearmaba el servicio y salía otro punto
 *   a los 4 segundos del anterior.
 * - Un 401 (la sesión se cerró) tiraba el punto: del 23-10 de Iván se perdieron cinco horas.
 */
object JornadaGpsReglas {

    /** Un punto cada media hora. */
    const val CADENCIA_MS = 30 * 60_000L

    /** Menos que esto desde el último punto enviado: no se manda otro (el servidor usa la misma cifra). */
    const val ESPACIADO_MINIMO_MS = 20 * 60_000L

    /** Sin señal en el intento: se reintenta a los 5 min, hasta [REINTENTOS_MAX] veces. */
    const val REINTENTO_MS = 5 * 60_000L
    const val REINTENTOS_MAX = 3

    /** Puntos guardados para reenviar (sesión cerrada, servidor caído): un día completo y algo más. */
    const val PENDIENTES_MAX = 60

    /**
     * ¿Toca mandar un punto ahora? Ni la alarma, ni el GPS, ni un latido del servidor mandan dos
     * puntos en 20 min: eso es justo la ráfaga que se quiere evitar. La checada con ubicación cuenta
     * como punto (el servidor la guarda en el recorrido).
     */
    fun debeTomarPunto(ultimoEnviadoMs: Long?, ahoraMs: Long): Boolean {
        if (ultimoEnviadoMs == null || ultimoEnviadoMs <= 0L) return true
        if (ahoraMs < ultimoEnviadoMs) return true // reloj movido: mejor un punto de más
        return ahoraMs - ultimoEnviadoMs >= ESPACIADO_MINIMO_MS
    }

    /**
     * Cuándo despertar otra vez (milisegundos desde ahora).
     *
     * - Con un punto enviado: a los 30 min de ese punto (nunca menos de 1 min).
     * - Sin señal: 5 min, hasta [REINTENTOS_MAX] seguidos; luego la cadencia normal.
     */
    fun siguienteAlarmaEnMs(ultimoEnviadoMs: Long?, ahoraMs: Long, reintentos: Int): Long {
        if (reintentos in 1..REINTENTOS_MAX) return REINTENTO_MS
        val base = ultimoEnviadoMs?.takeIf { it in 1..ahoraMs } ?: return CADENCIA_MS
        return (base + CADENCIA_MS - ahoraMs).coerceIn(60_000L, CADENCIA_MS)
    }

    /** Un punto que no llegó al servidor; [enMs] es la hora en que el teléfono lo midió. */
    data class PuntoPendiente(
        val lat: Double,
        val lng: Double,
        val enMs: Long,
        val actividadId: Long?,
        val mock: Boolean,
    )

    /** Se agrega al final; si pasa del tope se tiran los más viejos. Sin repetidos por hora. */
    fun agregarPendiente(lista: List<PuntoPendiente>, punto: PuntoPendiente, max: Int = PENDIENTES_MAX): List<PuntoPendiente> {
        val sinRepetido = lista.filterNot { it.enMs == punto.enMs }
        return (sinRepetido + punto).sortedBy { it.enMs }.takeLast(max)
    }

    /** Texto plano para SharedPreferences: `lat,lng,ms,actividad,mock;…` (sin JSON para probarlo en la JVM). */
    fun serializar(lista: List<PuntoPendiente>): String =
        lista.joinToString(";") { "${it.lat},${it.lng},${it.enMs},${it.actividadId ?: ""},${if (it.mock) 1 else 0}" }

    fun deserializar(texto: String?): List<PuntoPendiente> =
        texto.orEmpty().split(';').mapNotNull { fila ->
            val c = fila.split(',')
            if (c.size != 5) return@mapNotNull null
            val lat = c[0].toDoubleOrNull() ?: return@mapNotNull null
            val lng = c[1].toDoubleOrNull() ?: return@mapNotNull null
            val en = c[2].toLongOrNull() ?: return@mapNotNull null
            PuntoPendiente(lat, lng, en, c[3].toLongOrNull(), c[4] == "1")
        }

    /** «Última ubicación 10:30» para la notificación de la jornada. */
    fun textoUltimo(horaMinuto: String?): String =
        if (horaMinuto.isNullOrBlank()) {
            "Se toma tu ubicación cada 30 min hasta que registres tu salida."
        } else {
            "Última ubicación $horaMinuto · cada 30 min hasta tu salida."
        }
}
