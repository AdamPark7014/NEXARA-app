package mx.nexara.mobile.nativeapp.ui.console.screens

import mx.nexara.mobile.nativeapp.data.api.AttendanceRegisterResponse

/**
 * Insignias de una checada (contrato A): qué le pasó al registro y por qué.
 *
 * Sin Android: se prueban en la JVM (`AttendanceBadgesTest`). El color va como
 * ARGB (`Long`) para no arrastrar Compose a las pruebas.
 */
data class AttendanceBadge(val texto: String, val color: Long)

object AttendanceBadges {

    const val VERDE = 0xFF16A34AL
    const val AMBAR = 0xFFD97706L
    const val ROJO = 0xFFDC2626L
    const val AZUL = 0xFF2563EBL
    const val MORADO = 0xFF7C3AEDL
    const val GRIS = 0xFF64748BL

    const val SIN_CONEXION = "Sin conexión"
    const val CIERRE_AUTOMATICO = "Cierre automático"
    const val CORREGIDA = "Corregida"

    const val VALIDACION_OK = "OK"
    const val VALIDACION_PENDIENTE = "PENDIENTE"
    const val VALIDACION_REVISAR = "REVISAR"

    /** «Revisar: La hora del teléfono no coincidía» (sin motivo, solo «Revisar»). */
    fun revisarTexto(motivo: String?): String {
        val m = motivo?.trim().orEmpty()
        return if (m.isEmpty()) "Revisar" else "Revisar: $m"
    }

    /** «Fuera de sitio · 450 m» · «Fuera de sitio · 450 m de Oficina». */
    fun fueraDeSitioTexto(distanciaM: Int?, sitioNombre: String? = null): String {
        val distancia = distanciaM?.takeIf { it >= 0 }?.let { " · $it m" }.orEmpty()
        val sitio = sitioNombre?.trim()?.takeIf { it.isNotEmpty() && distancia.isNotEmpty() }
            ?.let { " de $it" }
            .orEmpty()
        return "Fuera de sitio$distancia$sitio"
    }

    /**
     * Insignias en el orden en que importan: primero por qué no cuenta como
     * normal, luego dónde y al final que alguien la corrigió.
     */
    fun de(
        validacion: String? = null,
        motivoValidacion: String? = null,
        offline: Boolean? = null,
        fueraDeSitio: Boolean? = null,
        distanciaSitioM: Int? = null,
        sitioNombre: String? = null,
        cierreAutomatico: Boolean? = null,
        correcciones: Int = 0,
    ): List<AttendanceBadge> = buildList {
        val estado = validacion?.trim()?.uppercase()
        if (offline == true) add(AttendanceBadge(SIN_CONEXION, GRIS))
        if (cierreAutomatico == true) add(AttendanceBadge(CIERRE_AUTOMATICO, AMBAR))
        if (estado == VALIDACION_REVISAR) {
            add(AttendanceBadge(revisarTexto(motivoValidacion), ROJO))
        } else if (estado == VALIDACION_PENDIENTE && offline != true) {
            // «Registrada sin conexión» sin que la cola lo haya dicho ya.
            add(AttendanceBadge(revisarTexto(motivoValidacion).takeIf { !motivoValidacion.isNullOrBlank() } ?: SIN_CONEXION, AMBAR))
        }
        if (fueraDeSitio == true) {
            add(AttendanceBadge(fueraDeSitioTexto(distanciaSitioM, sitioNombre), AMBAR))
        }
        if (correcciones > 0) add(AttendanceBadge(CORREGIDA, MORADO))
    }

    /** Lo que el servidor contestó al registrar (APIs viejas no traen nada: lista vacía). */
    fun deRegistro(res: AttendanceRegisterResponse?): List<AttendanceBadge> = de(
        validacion = res?.validacion,
        motivoValidacion = res?.motivoValidacion,
        fueraDeSitio = res?.fueraDeSitio,
        distanciaSitioM = res?.distanciaSitioM,
        sitioNombre = res?.sitioNombre,
    )
}
