package mx.nexara.mobile.nativeapp.ui.console.activities

import mx.nexara.mobile.nativeapp.data.api.MyActivityItemDto
import mx.nexara.mobile.nativeapp.data.api.TeamBoardUserDto

/**
 * Decisiones de presentación de Actividades que no dependen de Compose: qué
 * filtros de la pizarra se ofrecen y cuál es el botón principal de cada
 * actividad propia. No cambia quién ve qué ni cómo se captura la evidencia.
 */
object ActividadesUx {

    /** Estado de la pizarra con el mismo respaldo que la leyenda: sin estado = sin actividad. */
    fun boardStatusKey(user: TeamBoardUserDto): String = user.status ?: "sin_actividad"

    /** Conteo por estado para los chips de filtro. */
    fun boardCounts(users: List<TeamBoardUserDto>): Map<String, Int> =
        users.groupingBy { boardStatusKey(it) }.eachCount()

    /**
     * Chips de filtro, en el orden de la leyenda web. `inactivo` solo aparece si
     * una API vieja lo manda; un estado ya elegido nunca desaparece de la fila.
     */
    fun boardFilterOptions(counts: Map<String, Int>, selected: String? = null): List<String> =
        CoreActivityRules.BOARD_STATUS_ORDER +
            listOfNotNull("inactivo".takeIf { (counts["inactivo"] ?: 0) > 0 || selected == "inactivo" })

    /** `null` = todos. */
    fun filterBoard(users: List<TeamBoardUserDto>, status: String?): List<TeamBoardUserDto> =
        if (status == null) users else users.filter { boardStatusKey(it) == status }

    enum class PrimaryKind {
        /** Despachador que aún no la pasa a nadie. */
        REPARTIR,

        /** Sin foto de entrada todavía. */
        INICIAR,

        /** Ya empezó: le faltan pasos de evidencia. */
        CONTINUAR,

        /** Se la regresaron para corregir. */
        CORREGIR,

        /** Evidencia enviada o actividad en revisión: solo consultar. */
        VER,

        /** Solo reparte (no captura) o no hay nada que capturar. */
        ABRIR,
    }

    data class PrimaryAction(
        val kind: PrimaryKind,
        val label: String,
        /** Pestaña del detalle que abre (`evidencias`) o null para Detalle. */
        val tab: String?,
    )

    /**
     * Botón principal de una actividad en «Mis actividades». Todo lleva a la
     * pestaña Evidencias, donde viven la foto de entrada, la geocerca y los
     * pasos; aquí solo se elige la palabra que describe el siguiente paso.
     */
    fun primaryAction(a: MyActivityItemDto): PrimaryAction {
        if (a.porRepartir == true) return PrimaryAction(PrimaryKind.REPARTIR, "Repartir", null)
        if (a.despachador == true) return PrimaryAction(PrimaryKind.ABRIR, "Abrir", null)

        val estatus = a.estatus.orEmpty().lowercase()
        val step = a.evidenceStatus
        return when {
            estatus.contains("rechazada") ->
                PrimaryAction(PrimaryKind.CORREGIR, "Corregir evidencias", TAB_EVIDENCIAS)
            step == CoreActivityRules.STEP_COMPLETED || estatus.contains("validar") ->
                PrimaryAction(PrimaryKind.VER, "Ver evidencias", TAB_EVIDENCIAS)
            (step != null && step != CoreActivityRules.STEP_ENTRY) || estatus.contains("proceso") ->
                PrimaryAction(PrimaryKind.CONTINUAR, "Continuar evidencias", TAB_EVIDENCIAS)
            else -> PrimaryAction(PrimaryKind.INICIAR, "Iniciar", TAB_EVIDENCIAS)
        }
    }

    /** «3 por hacer · 1 urgente · 2 hechas hoy» — el resumen del encabezado. */
    fun resumenDia(porHacer: Int, urgentes: Int, hechasHoy: Int, seguimiento: Int): String =
        buildList {
            add(if (porHacer == 0) "Nada por hacer" else "$porHacer por hacer")
            if (urgentes > 0) add(if (urgentes == 1) "1 urgente" else "$urgentes urgentes")
            if (hechasHoy > 0) add(if (hechasHoy == 1) "1 hecha hoy" else "$hechasHoy hechas hoy")
            if (seguimiento > 0) add("$seguimiento en seguimiento")
        }.joinToString(" · ")

    const val TAB_EVIDENCIAS = "evidencias"
}
