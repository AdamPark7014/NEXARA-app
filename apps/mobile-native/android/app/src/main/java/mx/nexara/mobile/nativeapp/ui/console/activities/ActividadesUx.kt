package mx.nexara.mobile.nativeapp.ui.console.activities

import mx.nexara.mobile.nativeapp.data.api.MyActivityItemDto
import mx.nexara.mobile.nativeapp.data.api.TeamBoardUserDto
import mx.nexara.mobile.nativeapp.ui.enterprise.NxMetric

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

        /** Sin iniciar: «Iniciar actividad» (marca la hora real y abre Evidencias). */
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
        /**
         * Antes de abrir, guarda la hora real de inicio (`me/activities/:id/iniciar`).
         * false con una API anterior al contrato: ahí la foto de entrada marca el inicio.
         */
        val marcaInicio: Boolean = false,
    )

    /**
     * Botón principal de una actividad en «Mis actividades». Todo lleva a la
     * pestaña Evidencias, donde viven la foto de entrada, la geocerca y los
     * pasos; aquí solo se elige la palabra que describe el siguiente paso.
     *
     * Quien la recibe no la acepta ni la rechaza (regla del 18-09): mientras no
     * tenga inicio real, lo único que se le ofrece es «Iniciar actividad».
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
            // Aunque un compañero ya la tenga «En Proceso», cada quien marca su propio inicio.
            (step == null || step == CoreActivityRules.STEP_ENTRY) &&
                ActivitySemaforo.puedeIniciar(a.aceptacion, a.inicioRealAt, a.despachador, a.estatus) ->
                PrimaryAction(PrimaryKind.INICIAR, ActivitySemaforo.ACCION_INICIAR, TAB_EVIDENCIAS, marcaInicio = true)
            (step != null && step != CoreActivityRules.STEP_ENTRY) || estatus.contains("proceso") ->
                PrimaryAction(PrimaryKind.CONTINUAR, "Continuar evidencias", TAB_EVIDENCIAS)
            else -> PrimaryAction(PrimaryKind.INICIAR, ActivitySemaforo.ACCION_INICIAR, TAB_EVIDENCIAS)
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

    // ── Color con significado (reglas 3 y 6) ────────────────────────────────
    //
    // El contrato de diseño dice que el estado es un punto y una palabra, y que
    // el color entra **solo** cuando el renglón pide acción o algo salió mal.
    // Antes cada estado traía su propio color de relleno: una actividad normal
    // llegaba a enseñar seis pastillas de colores y ninguna destacaba.

    /** Rojo si urge, ámbar si va justa; en verde (todo en orden) no se tiñe nada. */
    fun colorSemaforo(semaforo: String?): Long? = when (semaforo?.trim()?.lowercase()) {
        ActivitySemaforo.ROJO -> CoreActivityRules.ROJO
        ActivitySemaforo.AMARILLO -> CoreActivityRules.NARANJA
        else -> null
    }

    /**
     * «Te la regresaron» en rojo porque hay que corregirla hoy y «Terminada» en
     * verde porque cierra el asunto. «En curso» y «En revisión» son el flujo
     * normal: van en gris.
     */
    fun colorEstatus(estatus: String?): Long? = when (CoreActivityRules.estatusUi(estatus).color) {
        CoreActivityRules.ROJO -> CoreActivityRules.ROJO
        CoreActivityRules.VERDE -> CoreActivityRules.VERDE
        else -> null
    }

    /**
     * Solo lo urgente se pinta. «Esta semana» y «Puede esperar» se leen, no se
     * gritan: si toda la lista va en color, el color deja de significar algo.
     */
    fun colorPrioridad(prioridad: String?): Long? =
        if (CoreActivityRules.isUrgent(prioridad)) CoreActivityRules.ROJO else null

    /**
     * Lo que dice el encabezado bajo el saludo. No repite las cifras de la tira
     * —para eso está la tira— sino qué hacer ahora, que es lo que el técnico
     * necesita leer en dos segundos.
     */
    fun instruccionDia(porHacer: Int, cargando: Boolean): String = when {
        cargando -> "Cargando tus actividades…"
        porHacer <= 0 -> "Nada pendiente por ahora."
        porHacer == 1 -> "Tienes 1 actividad. Empieza por ella."
        else -> "Tienes $porHacer por hacer. Empieza por la #1."
    }

    const val METRICA_POR_HACER = "por_hacer"
    const val METRICA_HECHAS = "hechas_hoy"
    const val METRICA_SEGUIMIENTO = "seguimiento"

    /**
     * La tira de cifras de «Mis actividades»: por hacer, hechas hoy y —solo si
     * las hay— las que repartió y sigue vigilando.
     *
     * Regla 7 del contrato de diseño: un día sin nada **no pinta ceros**. Tres
     * celdas en `0` encima de un «Todo al día» le quitan el sitio a lo único
     * útil en esa pantalla, que es el botón para auto-asignarse algo. La
     * condición es el conteo real, no que las cifras den cero.
     *
     * «En seguimiento» tampoco se pinta en cero: solo aparece cuando la persona
     * de verdad repartió trabajo.
     */
    fun metricas(porHacer: Int, urgentes: Int, hechasHoy: Int, seguimiento: Int): List<NxMetric> {
        if (porHacer == 0 && hechasHoy == 0 && seguimiento == 0) return emptyList()
        return buildList {
            add(
                NxMetric(
                    clave = METRICA_POR_HACER,
                    etiqueta = "Por hacer",
                    valor = porHacer.toString(),
                    pista = when {
                        urgentes == 1 -> "1 urgente"
                        urgentes > 1 -> "$urgentes urgentes"
                        porHacer == 0 -> "nada en tu cola"
                        else -> "en tu cola"
                    },
                    // El rojo es la alarma de que algo no aguanta hasta mañana.
                    color = CoreActivityRules.ROJO.takeIf { urgentes > 0 },
                ),
            )
            add(
                NxMetric(
                    clave = METRICA_HECHAS,
                    etiqueta = "Hechas hoy",
                    valor = hechasHoy.toString(),
                    pista = if (hechasHoy == 0) "aún ninguna" else "van del día",
                ),
            )
            if (seguimiento > 0) {
                add(
                    NxMetric(
                        clave = METRICA_SEGUIMIENTO,
                        etiqueta = "En seguimiento",
                        valor = seguimiento.toString(),
                        pista = "las repartiste",
                    ),
                )
            }
        }
    }

    const val TAB_EVIDENCIAS = "evidencias"
}
