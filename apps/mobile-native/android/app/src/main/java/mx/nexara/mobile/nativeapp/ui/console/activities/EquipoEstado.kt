package mx.nexara.mobile.nativeapp.ui.console.activities

import java.time.Instant
import mx.nexara.mobile.nativeapp.data.api.TeamBoardUserDto
import mx.nexara.mobile.nativeapp.ui.enterprise.NxMetric

/**
 * Cómo se lee la pizarra del equipo — espejo de
 * `apps/web/components/pizarra/equipo-estado.ts`.
 *
 * Sin Compose: se prueba en la JVM (`EquipoEstadoTest`).
 *
 * El cambio de fondo respecto a la versión anterior de la app es que los cinco
 * estados que manda el API colapsan a **tres aros de color**. Cinco colores
 * distintos obligan a memorizar una leyenda; tres responden a la única pregunta
 * que se hace quien mira la pizarra desde el teléfono: ¿trabaja, hay que ir a
 * ver, o ya terminó? «Atrasado» y «Sin actividad» comparten ámbar porque piden
 * lo mismo del encargado.
 */
enum class EquipoAro(val clave: String, val etiqueta: String, val color: Long) {
    TRABAJANDO("trabajando", "Trabajando", CoreActivityRules.VERDE),
    RETRASO("retraso", "Con retraso", CoreActivityRules.NARANJA),
    LIBRE("libre", "Libres", CoreActivityRules.CIAN),
}

object EquipoEstado {

    /** Marca corta bajo el nombre: por qué esa persona necesita atención ahora. */
    data class Marca(val texto: String, val color: Long)

    /** Una opción de la barra de filtros: etiqueta, conteo y su color. */
    data class Filtro(val aro: EquipoAro?, val etiqueta: String, val conteo: Int, val color: Long?)

    /**
     * Los cinco estados del API en los tres aros. Lo desconocido y lo ausente
     * caen en RETRASO a propósito: si no se sabe qué hace alguien, es justo lo
     * que hay que ir a mirar.
     */
    fun aro(status: String?): EquipoAro = when (status?.trim()?.lowercase()) {
        "activo" -> EquipoAro.TRABAJANDO
        "libre" -> EquipoAro.LIBRE
        else -> EquipoAro.RETRASO
    }

    /** Primer renglón de la tarjeta: qué está haciendo esa persona, en una línea. */
    fun queHace(user: TeamBoardUserDto): String {
        val abierta = user.openActivities.orEmpty().firstOrNull()?.titulo?.trim()?.takeIf { it.isNotEmpty() }
        if (abierta != null) return abierta
        val actual = user.currentActivity?.titulo?.trim()?.takeIf { it.isNotEmpty() }
        if (actual != null) return actual
        val ultima = user.lastFinished?.titulo?.trim()?.takeIf { it.isNotEmpty() }
        if (ultima != null) return "Última: $ultima"
        return "Sin actividad asignada"
    }

    /** «AN-1042 · Despacho · Atrasado 1 h 20 min» — el contexto, en gris, bajo la línea de arriba. */
    fun contexto(user: TeamBoardUserDto, ahora: Instant = Instant.now()): String {
        val abierta = user.openActivities.orEmpty().firstOrNull()
        val partes = buildList {
            abierta?.anNumber?.trim()?.takeIf { it.isNotEmpty() }?.let { add(it) }
            cargaTexto(abierta?.assignmentCharge)?.let { add(it) }
            add(
                CoreActivityRules.boardEstadoTexto(
                    status = user.status,
                    currentLateMinutes = user.currentLateMinutes,
                    idleSinceAt = user.idleSinceAt,
                    now = ahora,
                ),
            )
        }
        return partes.joinToString(" · ")
    }

    /** `despacho` / `ejecucion` en palabras; lo demás no se nombra. */
    fun cargaTexto(assignmentCharge: String?): String? = when (assignmentCharge?.trim()?.lowercase()) {
        "despacho" -> "Despacho"
        "ejecucion" -> "Ejecución"
        else -> null
    }

    /**
     * Las marcas de la tarjeta: «Tú», quién está corrigiendo evidencia devuelta
     * y cuántas entregas suyas esperan aprobación. No se inventa ninguna: si no
     * hay nada que avisar, la tarjeta se queda limpia.
     */
    fun marcas(user: TeamBoardUserDto, meId: Long?): List<Marca> = buildList {
        if (meId != null && user.id == meId) add(Marca("Tú", CoreActivityRules.AZUL))
        val enCorreccion = user.enCorreccion ?: 0
        if (enCorreccion > 0) add(Marca("Corrigiendo", CoreActivityRules.NARANJA))
        val enEspera = user.enEsperaAprobacion ?: 0
        if (enEspera > 0) {
            add(Marca(if (enEspera == 1) "1 en espera" else "$enEspera en espera", CoreActivityRules.MORADO))
        }
    }

    data class Resumen(val trabajando: Int, val retraso: Int, val libres: Int, val total: Int)

    fun resumen(users: List<TeamBoardUserDto>): Resumen {
        val porAro = users.groupingBy { aro(it.status) }.eachCount()
        return Resumen(
            trabajando = porAro[EquipoAro.TRABAJANDO] ?: 0,
            retraso = porAro[EquipoAro.RETRASO] ?: 0,
            libres = porAro[EquipoAro.LIBRE] ?: 0,
            total = users.size,
        )
    }

    /**
     * La tira de cifras del equipo.
     *
     * Regla 7 del contrato de diseño: con la pizarra vacía **no se pinta nada**.
     * Tres celdas en cero encima de un «Nadie en tu equipo» ocupan el sitio de lo
     * único que sirve ahí, que es el texto que explica por qué está vacía.
     */
    fun metricas(users: List<TeamBoardUserDto>): List<NxMetric> {
        if (users.isEmpty()) return emptyList()
        val r = resumen(users)
        return listOf(
            NxMetric(
                clave = EquipoAro.TRABAJANDO.clave,
                etiqueta = "Trabajando",
                valor = r.trabajando.toString(),
                pista = "de ${r.total} en el equipo",
            ),
            NxMetric(
                clave = EquipoAro.RETRASO.clave,
                etiqueta = "Con retraso",
                valor = r.retraso.toString(),
                pista = if (r.retraso == 0) "nadie pendiente" else "hay que ir a ver",
                // Color solo cuando el número pide acción (regla 6).
                color = CoreActivityRules.NARANJA.takeIf { r.retraso > 0 },
            ),
            NxMetric(
                clave = EquipoAro.LIBRE.clave,
                etiqueta = "Libres",
                valor = r.libres.toString(),
                pista = "terminaron lo suyo",
            ),
        )
    }

    /** «Todos 8 · Trabajando 3 · Con retraso 2 · Libres 3» — la única barra de filtros. */
    fun filtros(users: List<TeamBoardUserDto>): List<Filtro> {
        if (users.isEmpty()) return emptyList()
        val porAro = users.groupingBy { aro(it.status) }.eachCount()
        return buildList {
            add(Filtro(null, "Todos", users.size, null))
            EquipoAro.entries.forEach { a ->
                add(Filtro(a, a.etiqueta, porAro[a] ?: 0, a.color))
            }
        }
    }

    /** `null` = todos. */
    fun filtrar(users: List<TeamBoardUserDto>, aro: EquipoAro?): List<TeamBoardUserDto> =
        if (aro == null) users else users.filter { aro(it.status) == aro }
}
