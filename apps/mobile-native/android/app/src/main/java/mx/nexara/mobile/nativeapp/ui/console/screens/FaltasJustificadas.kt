package mx.nexara.mobile.nativeapp.ui.console.screens

import mx.nexara.mobile.nativeapp.access.PlatformAccounts
import mx.nexara.mobile.nativeapp.data.api.AttendanceJustificacionDto

/**
 * Faltas justificadas en Asistencias. Puro, sin Android. Espejo de
 * `apps/api/src/attendance/attendance-justifications.service.ts`: solo Christian
 * justifica, con motivo, un día sin checada de entrada que no sea futuro.
 */
object FaltasJustificadas {
    const val MOTIVO_MINIMO = 10
    const val ETIQUETA = "Falta justificada"

    /** Solo Christian (y su equivalente de pruebas). */
    fun puedeJustificar(email: String?): Boolean = PlatformAccounts.isCeoEquivalentEmail(email)

    /** La justificación de ese día (AAAA-MM-DD), si la hay. */
    fun delDia(lista: List<AttendanceJustificacionDto>?, fecha: String): AttendanceJustificacionDto? =
        lista.orEmpty().firstOrNull { it.fecha?.trim()?.take(10) == fecha }

    /** «Falta justificada · Incapacidad del IMSS». */
    fun texto(j: AttendanceJustificacionDto): String {
        val motivo = j.motivo?.trim().orEmpty()
        return if (motivo.isBlank()) ETIQUETA else "$ETIQUETA · $motivo"
    }

    /** «Justificó Christian Ruiz» para la línea de abajo. */
    fun quien(j: AttendanceJustificacionDto): String? =
        j.justificadaPor?.nombre?.trim()?.takeIf { it.isNotBlank() }?.let { "Justificó $it" }

    fun motivoLimpio(motivo: String): String = motivo.trim().replace(Regex("\\s+"), " ")

    fun motivoOk(motivo: String): Boolean = motivoLimpio(motivo).length >= MOTIVO_MINIMO

    /**
     * «Justificar falta» solo aparece si quien ve es Christian, la persona no checó
     * entrada ese día, aún no está justificado y el día no es futuro.
     */
    fun ofrecerJustificar(
        puede: Boolean,
        hayEntrada: Boolean,
        yaJustificada: Boolean,
        fecha: String,
        hoy: String,
    ): Boolean = puede && !hayEntrada && !yaJustificada && fecha.isNotBlank() && fecha <= hoy
}
