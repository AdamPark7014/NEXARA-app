package mx.nexara.mobile.nativeapp.util

/**
 * ¿De cuándo es esta ubicación?
 *
 * No de cuándo se mandó la petición: de cuándo el teléfono midió el punto. Es la
 * diferencia que separa «estoy aquí» de «aquí estuve la última vez que tuve señal», y
 * el servidor la necesita para no aceptar una posición guardada como si fuera del
 * momento (rechaza arriba de 30 min, marca a revisión arriba de 5).
 *
 * Se calcula con `elapsedRealtime`, que es el reloj monótono desde el último arranque:
 * cambiar la hora del sistema —el truco más fácil que queda— no lo mueve. Por eso no se
 * usa `Location.getTime()`, que sí es hora de pared.
 *
 * Sin Android adentro para poder probarlo en la JVM (`FixAgeTest`); quien lee el
 * `Location` le pasa los dos nanosegundos.
 */
object FixAge {

    /**
     * Milisegundos entre la medición y ahora, o `null` si no se puede saber.
     *
     * @param ahoraNanos `SystemClock.elapsedRealtimeNanos()` al leer la ubicación.
     * @param medicionNanos `Location.getElapsedRealtimeNanos()`.
     *
     * Devuelve `null` cuando el teléfono no da el dato (0 o negativo) y `0` cuando la
     * medición dice ser del futuro, que en un reloj monótono solo pasa por redondeo.
     */
    fun millis(ahoraNanos: Long, medicionNanos: Long): Long? {
        if (medicionNanos <= 0L || ahoraNanos <= 0L) return null
        val diffNanos = ahoraNanos - medicionNanos
        if (diffNanos < 0L) return 0L
        return diffNanos / 1_000_000L
    }
}
