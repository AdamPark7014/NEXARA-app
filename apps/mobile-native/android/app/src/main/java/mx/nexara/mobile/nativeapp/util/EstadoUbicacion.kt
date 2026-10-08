package mx.nexara.mobile.nativeapp.util

/**
 * Estado de la ubicación del teléfono durante la jornada. Viaja a
 * `POST attendance/estado-ubicacion` y los jefes lo ven en Asistencias:
 * «Ubicación apagada desde 10:15», «Ubicación apagada 25 min».
 *
 * Antes solo se sabía al checar; quien apagaba la ubicación a media jornada
 * dejaba un hueco en el recorrido que nadie podía explicar. Las decisiones viven
 * aquí, sin Android, para probarlas en la JVM; el servicio de GPS de jornada
 * solo les pasa lo que lee del teléfono.
 */
object EstadoUbicacion {

    const val APAGADA = "APAGADA"
    const val SIN_PERMISO = "SIN_PERMISO"
    const val ENCENDIDA = "ENCENDIDA"

    /** El permiso va primero: sin él da igual que la ubicación esté encendida. */
    fun estadoDeUbicacion(tienePermiso: Boolean, ubicacionEncendida: Boolean): String = when {
        !tienePermiso -> SIN_PERMISO
        !ubicacionEncendida -> APAGADA
        else -> ENCENDIDA
    }

    /**
     * ¿Hay que mandar [actual]?
     *
     * - [anterior] null (arranque del servicio, nada enviado en esta jornada): solo
     *   si NO es [ENCENDIDA]; estar bien al empezar no es noticia.
     * - Si no, solo cuando cambió. Android avisa varias veces por cada cambio (uno
     *   por proveedor: GPS, red…) y el servidor ignora repetidos, pero no hace falta
     *   mandárselos.
     */
    fun debeEnviar(anterior: String?, actual: String): Boolean =
        if (anterior == null) actual != ENCENDIDA else actual != anterior
}
