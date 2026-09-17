package mx.nexara.mobile.nativeapp.ui.console.screens

/**
 * Textos y decisiones de la checada (contrato A), sin Android: se prueban en la
 * JVM (`AttendanceCheckInTest`).
 */
object AttendanceCheckIn {

    /** Lo que contesta el servidor con 422 cuando el teléfono traía GPS falso. */
    const val MOCK_MENSAJE =
        "Detectamos una ubicación simulada. Desactiva cualquier app de GPS falso para checar."

    /** Qué hacer después del 422: se dice completo, no como un error suelto. */
    const val MOCK_AYUDA =
        "Tu checada no se registró y tus jefes recibieron el aviso. Desactiva la app de ubicación " +
            "simulada (Opciones de desarrollador → «Seleccionar app de ubicación simulada» → Ninguna), " +
            "reinicia la app y vuelve a intentarlo."

    /** Arriba de 200 m el servidor la acepta pero la deja «Revisar: Ubicación imprecisa». */
    const val PRECISION_A_REVISAR = 200f

    /** Baja precisión: se avisa en pantalla antes de que el servidor lo marque. */
    private const val PRECISION_BAJA = 100f

    /**
     * ¿El error es el 422 de ubicación simulada? Se acepta el 422 a secas y
     * también un mensaje que hable de ubicación simulada (por si el código
     * cambia), nunca al revés: un 400 cualquiera no es esto.
     */
    fun esUbicacionSimulada(code: Int?, mensaje: String?): Boolean {
        if (code == 422) return true
        val texto = mensaje?.lowercase().orEmpty()
        return texto.contains("ubicación simulada") || texto.contains("ubicacion simulada")
    }

    /** Sufijo de la confirmación: « · GPS ±12m», « (sin GPS — activa ubicación)». */
    fun notaGps(hayCoords: Boolean, accuracyM: Float?, mock: Boolean = false): String = when {
        !hayCoords -> " (sin GPS — activa ubicación)"
        mock -> " · ubicación simulada detectada"
        accuracyM == null -> " · GPS ok"
        accuracyM > PRECISION_A_REVISAR -> " · GPS ±${accuracyM.toInt()}m (quedará para revisar)"
        accuracyM > PRECISION_BAJA -> " · GPS ±${accuracyM.toInt()}m (baja precisión)"
        else -> " · GPS ±${accuracyM.toInt()}m"
    }
}
