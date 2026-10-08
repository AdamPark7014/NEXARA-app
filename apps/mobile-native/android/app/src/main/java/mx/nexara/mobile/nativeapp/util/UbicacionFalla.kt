package mx.nexara.mobile.nativeapp.util

/**
 * Por qué una checada salió sin coordenadas. Viaja como `ubicacionFalla` en
 * `POST attendance` (solo cuando `latitude/longitude` van null) y el servidor lo
 * convierte en el motivo que ven los jefes: «Sin ubicación: permiso de ubicación
 * negado», «… ubicación del teléfono apagada», «… no consiguió señal a tiempo».
 *
 * Antes la checada llegaba sin coordenadas y sin motivo, y nadie podía saber si
 * la persona negó el permiso, apagó la ubicación o estaba en un sótano. La
 * decisión vive aquí, sin Android, para probarla en la JVM; quien lee el
 * teléfono solo le pasa los dos valores.
 */
object UbicacionFalla {

    /** NEXARA no tiene permiso de ubicación (ni fina ni aproximada). */
    const val PERMISO_NEGADO = "PERMISO_NEGADO"

    /** El interruptor de ubicación del teléfono está apagado. */
    const val UBICACION_APAGADA = "UBICACION_APAGADA"

    /** Hay permiso y ubicación, pero ni la lectura balanceada ni la fina contestaron a tiempo. */
    const val SIN_SENAL = "SIN_SENAL"

    /** La lectura misma falló (excepción): no se sabe más. */
    const val ERROR = "ERROR"

    /**
     * Motivo de una lectura que no trajo coordenadas. El permiso va primero:
     * sin él da igual que la ubicación esté encendida, la app no puede leerla.
     */
    fun fallaDeUbicacion(tienePermiso: Boolean, ubicacionEncendida: Boolean): String = when {
        !tienePermiso -> PERMISO_NEGADO
        !ubicacionEncendida -> UBICACION_APAGADA
        else -> SIN_SENAL
    }
}
