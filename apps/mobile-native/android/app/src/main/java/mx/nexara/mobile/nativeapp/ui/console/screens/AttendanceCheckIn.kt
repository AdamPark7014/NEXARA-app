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

    /**
     * Qué hacer según el motivo por el que el servidor no aceptó la checada.
     *
     * Son tres rechazos distintos y la salida es distinta en cada uno; decir siempre lo
     * mismo («desactiva el GPS falso») a quien solo tenía el teléfono en un sótano no
     * ayuda a nadie a checar. El texto del servidor ya dice qué pasó: esto dice qué hacer.
     */
    fun ayudaDelRechazo(mensaje: String?): String {
        val texto = mensaje?.lowercase().orEmpty()
        return when {
            texto.contains("ubicación vieja") || texto.contains("ubicacion vieja") ->
                "Tu teléfono mandó la última posición que tenía guardada. Sal al aire libre o " +
                    "asómate a una ventana unos segundos para que el GPS mida de nuevo, y vuelve a intentarlo."
            texto.contains("distancia imposible") ->
                "Tu ubicación no cuadra con tu checada anterior. Si de verdad te trasladaste, " +
                    "avisa a tu jefe para que la registre él; tu checada no se guardó."
            texto.contains("app nexara") ->
                "Las checadas solo se registran desde esta app. Si no puedes usar tu teléfono, " +
                    "tu jefe puede registrarla por ti."
            else -> MOCK_AYUDA
        }
    }

    /**
     * ¿El error es un rechazo del servidor (422) y no un fallo de red o de datos?
     *
     * Todos se ven igual para la persona —«no se registró tu checada»— así que todos van
     * al mismo diálogo, con la ayuda que corresponda.
     */
    fun esRechazoDelServidor(code: Int?, mensaje: String?): Boolean =
        esUbicacionSimulada(code, mensaje) ||
            mensaje?.lowercase()?.let { t ->
                t.contains("ubicación vieja") || t.contains("ubicacion vieja") ||
                    t.contains("distancia imposible") || t.contains("app nexara")
            } == true

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
