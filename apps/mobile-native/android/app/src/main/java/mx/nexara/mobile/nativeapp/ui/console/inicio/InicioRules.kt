package mx.nexara.mobile.nativeapp.ui.console.inicio

import mx.nexara.mobile.nativeapp.data.api.MyActivityItemDto
import mx.nexara.mobile.nativeapp.ui.console.activities.ActividadesUx
import mx.nexara.mobile.nativeapp.ui.console.activities.ActivitySemaforo
import mx.nexara.mobile.nativeapp.ui.console.activities.CoreActivityRules
import mx.nexara.mobile.nativeapp.ui.console.activities.SesionActividad
import mx.nexara.mobile.nativeapp.ui.console.activities.SesionActividadRules
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

/** Reloj de esta persona en una actividad de «Mis actividades». */
fun MyActivityItemDto.sesion(): SesionActividad = SesionActividad(
    enCurso = enCurso,
    enPausa = enPausa,
    pausaTipo = pausaTipo,
    pausadaAt = pausadaAt,
    pausadaPor = pausadaPor,
    motivoPausa = motivoPausa,
    sesionAbiertaDesde = sesionAbiertaDesde,
)

/**
 * Reglas de la pantalla Inicio (rediseño v2): qué actividad es «la de ahora»,
 * qué botón lleva, cuáles van después y qué aviso importa hoy. Todo sale de lo
 * que la app ya consulta (`GET me/activities`, `attendance/current`,
 * `attendance/history`); no hay endpoint nuevo.
 *
 * Sin Android: se prueba en la JVM (`InicioRulesTest`).
 */
object InicioRules {

    enum class AccionKind { INICIAR, CONTINUAR, REANUDAR, CORREGIR, VER, REPARTIR, ABRIR }

    data class Accion(
        val kind: AccionKind,
        val label: String,
        /** Pestaña del detalle que abre (`evidencias`) o null para Detalle. */
        val tab: String?,
        /** Antes de abrir, guarda la hora real de inicio (`me/activities/:id/iniciar`). */
        val marcaInicio: Boolean = false,
    )

    /** Tono del chip de estado y del aviso (color con significado, no decorativo). */
    enum class Tono { INFO, WARNING, DANGER, SUCCESS, NEUTRAL }

    data class Estado(val label: String, val tono: Tono)

    data class Aviso(
        val titulo: String,
        val detalle: String,
        /** Actividad que abre al tocarlo; null = solo informa. */
        val activityId: Long?,
        val tono: Tono,
    )

    enum class Jornada { EN_JORNADA, COMPLETADA, SIN_ENTRADA }

    const val SIGUIENTES_MAX = 3

    /** ¿Ya la empezó? Hora real de inicio, evidencia más allá de la entrada o estatus «En Proceso». */
    fun empezada(a: MyActivityItemDto): Boolean {
        if (!a.inicioRealAt.isNullOrBlank()) return true
        val step = a.evidenceStatus
        if (step != null && step != CoreActivityRules.STEP_ENTRY) return true
        return a.estatus.orEmpty().contains("proceso", ignoreCase = true)
    }

    /**
     * La actividad «de ahora»: la que tiene el reloj corriendo; si no, la que
     * está en pausa; si no, la primera ya empezada; si no, la #1 de la cola (el
     * orden de `me/activities` ya es el orden de trabajo).
     */
    fun actividadActual(open: List<MyActivityItemDto>): MyActivityItemDto? {
        if (open.isEmpty()) return null
        open.firstOrNull { it.enCurso == true }?.let { return it }
        open.firstOrNull { it.enPausa == true }?.let { return it }
        open.firstOrNull { empezada(it) }?.let { return it }
        return open.first()
    }

    /** Lo que sigue después de [actual], en el orden de la cola, como mucho [max]. */
    fun siguientes(
        open: List<MyActivityItemDto>,
        actual: MyActivityItemDto?,
        max: Int = SIGUIENTES_MAX,
    ): List<MyActivityItemDto> = open.filter { it.id != actual?.id }.take(max)

    /**
     * Botón grande de la tarjeta «Ahora». En pausa → «Reanudar» (llama al API
     * directo); lo demás sale de [ActividadesUx.primaryAction] con etiquetas
     * cortas para un botón de 52 dp.
     */
    fun accion(a: MyActivityItemDto): Accion {
        val sesion = a.sesion()
        if (SesionActividadRules.puedeReanudar(sesion, despachador = a.despachador == true, estatus = a.estatus)) {
            return Accion(AccionKind.REANUDAR, "Reanudar", ActividadesUx.TAB_EVIDENCIAS)
        }
        val p = ActividadesUx.primaryAction(a)
        return when (p.kind) {
            ActividadesUx.PrimaryKind.REPARTIR -> Accion(AccionKind.REPARTIR, "Repartir", null)
            ActividadesUx.PrimaryKind.ABRIR -> Accion(AccionKind.ABRIR, "Abrir", null)
            ActividadesUx.PrimaryKind.INICIAR ->
                Accion(AccionKind.INICIAR, ActivitySemaforo.ACCION_INICIAR, p.tab, marcaInicio = p.marcaInicio)
            ActividadesUx.PrimaryKind.CONTINUAR -> Accion(AccionKind.CONTINUAR, "Continuar evidencia", p.tab)
            ActividadesUx.PrimaryKind.CORREGIR -> Accion(AccionKind.CORREGIR, "Corregir evidencias", p.tab)
            ActividadesUx.PrimaryKind.VER -> Accion(AccionKind.VER, "Ver evidencias", p.tab)
        }
    }

    /** Chip de estado de la tarjeta «Ahora»: el reloj manda sobre el estatus. */
    fun estado(a: MyActivityItemDto): Estado {
        if (a.enPausa == true) return Estado("En pausa", Tono.WARNING)
        if (a.enCurso == true) return Estado("En curso", Tono.INFO)
        val ui = CoreActivityRules.estatusUi(a.estatus)
        val tono = when (ui.color) {
            CoreActivityRules.ROJO -> Tono.DANGER
            CoreActivityRules.VERDE -> Tono.SUCCESS
            CoreActivityRules.AZUL, CoreActivityRules.MORADO -> Tono.INFO
            else -> Tono.NEUTRAL
        }
        return Estado(ui.label, tono)
    }

    /**
     * Avance de evidencia como «hechos de total» (pasos del tipo), o null si no
     * ha empezado a capturar. Con `COMPLETED` está todo hecho.
     */
    fun avance(a: MyActivityItemDto): Pair<Int, Int>? {
        val steps = CoreActivityRules.evidenceStepsForKind(a.coreKind)
        val step = a.evidenceStatus ?: return null
        if (step == CoreActivityRules.STEP_COMPLETED) return steps.size to steps.size
        val i = steps.indexOf(step)
        return if (i < 0) null else i to steps.size
    }

    /** Cliente o proyecto: dónde es el trabajo. */
    fun lugar(a: MyActivityItemDto): String? =
        a.cliente?.trim()?.takeIf { it.isNotEmpty() } ?: a.proyecto?.trim()?.takeIf { it.isNotEmpty() }

    /**
     * El único aviso de Inicio, por orden de urgencia: una actividad devuelta,
     * una que un jefe te pausó, una atrasada (semáforo rojo). Nada más: un aviso
     * por pantalla o deja de ser aviso.
     */
    fun aviso(open: List<MyActivityItemDto>, miId: Long?): Aviso? {
        open.firstOrNull { it.estatus.orEmpty().contains("rechazada", ignoreCase = true) }?.let {
            return Aviso(
                titulo = "Te regresaron «${titulo(it)}»",
                detalle = "Corrige las evidencias que te marcaron y vuelve a enviarla.",
                activityId = it.id,
                tono = Tono.DANGER,
            )
        }
        open.firstOrNull { a ->
            a.enPausa == true && a.pausaTipo == "PAUSA" &&
                a.pausadaPor?.id != null && a.pausadaPor.id != miId
        }?.let {
            return Aviso(
                titulo = "Te pausaron «${titulo(it)}»",
                detalle = SesionActividadRules.textoPausa(it.sesion(), miId = miId, propia = true)
                    ?: "Reanúdala cuando vuelvas a ella.",
                activityId = it.id,
                tono = Tono.WARNING,
            )
        }
        open.firstOrNull { a ->
            a.semaforo?.trim()?.lowercase() == ActivitySemaforo.ROJO && !SesionActividadRules.cerrada(a.estatus)
        }?.let {
            return Aviso(
                titulo = "«${titulo(it)}» va atrasada",
                detalle = "Pasó su fecha límite. Empiézala ya o avisa a tu jefe.",
                activityId = it.id,
                tono = Tono.DANGER,
            )
        }
        return null
    }

    fun titulo(a: MyActivityItemDto): String =
        a.titulo?.trim()?.takeIf { it.isNotEmpty() } ?: a.anNumber?.trim()?.takeIf { it.isNotEmpty() } ?: "Actividad #${a.id}"

    fun jornada(abierta: Boolean, hayEntrada: Boolean, haySalida: Boolean): Jornada = when {
        abierta -> Jornada.EN_JORNADA
        hayEntrada && haySalida -> Jornada.COMPLETADA
        else -> Jornada.SIN_ENTRADA
    }

    /** Cifra grande de la tarjeta de jornada: «6:41» (horas:minutos). */
    fun horasMinutos(ms: Long): String {
        val total = (ms.coerceAtLeast(0) / 60_000L)
        return "${total / 60}:${(total % 60).toString().padStart(2, '0')}"
    }

    /** «Hola, Fernanda» · sin nombre, «Hola». */
    fun saludo(nombre: String?): String {
        val first = CoreActivityRules.firstName(nombre)
        return if (first.isBlank()) "Hola" else "Hola, $first"
    }

    private val FECHA_LARGA: DateTimeFormatter =
        DateTimeFormatter.ofPattern("EEEE d 'de' MMMM", Locale.forLanguageTag("es-MX"))

    /** «Viernes 2 de octubre». */
    fun fechaLarga(dia: LocalDate): String {
        val texto = dia.format(FECHA_LARGA).replace(".", "")
        return texto.replaceFirstChar { it.titlecase(Locale.forLanguageTag("es-MX")) }
    }

    /** Hora programada de una actividad («16:00»), o null si no trae. */
    fun horaDe(iso: String?): String? = CoreActivityRules.formatClock(iso).takeIf { it != "—" }

    /** Línea de detalle de «Después, hoy»: lugar · plan. */
    fun detalleSiguiente(a: MyActivityItemDto): String {
        val plan = a.minutosPlan?.takeIf { it > 0 } ?: a.tiempoEstimadoMin?.takeIf { it > 0 }
        return listOfNotNull(
            lugar(a),
            plan?.let { CoreActivityRules.formatMinutes(it) },
        ).joinToString(" · ").ifBlank { CoreActivityRules.kindLabel(a.coreKind, a.ticketTypeCustom) }
    }

    /** Insignia de la pestaña Actividades: lo que falta por hacer. */
    fun pendientes(open: List<MyActivityItemDto>): Int = open.size
}
