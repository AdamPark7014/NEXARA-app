package mx.nexara.mobile.nativeapp.ui.console.activities

import java.text.Collator
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale
import mx.nexara.mobile.nativeapp.data.api.TeamBoardUserDto
import mx.nexara.mobile.nativeapp.ui.enterprise.NxFormat
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
 *
 * Aquí vive también lo que pidió Adam el 07-10: separar el ámbar en atrasados,
 * sin nada asignado (y desde cuándo), sin entrada y ya salieron, y el bloque
 * «Para atender hoy» con lo último que terminó cada quien.
 */
enum class EquipoAro(val clave: String, val etiqueta: String, val color: Long) {
    TRABAJANDO("trabajando", "Trabajando", CoreActivityRules.VERDE),
    RETRASO("retraso", "Con retraso", CoreActivityRules.NARANJA),
    LIBRE("libre", "Libres", CoreActivityRules.CIAN),
}

object EquipoEstado {

    /** Las horas y fechas de la pizarra son de México, esté donde esté el teléfono. */
    private val MX: ZoneId = ZoneId.of("America/Mexico_City")
    private val ES_MX: Locale = Locale.forLanguageTag("es-MX")
    private val HORA: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm", ES_MX)
    private val FECHA: DateTimeFormatter = NxFormat.patron("EEE d MMM")
    private val FECHA_CON_ANIO: DateTimeFormatter = NxFormat.patron("EEE d MMM yyyy")

    /** Renglones por grupo de «Para atender hoy» antes de «Ver N más». */
    const val VISIBLES_POR_GRUPO = 5

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

    private fun sinNadaAbierto(status: String?): Boolean =
        when (status?.trim()?.lowercase()) {
            "sin_actividad", "inactivo" -> true
            else -> false
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

    /**
     * «AN-1042 · Despacho · Atrasado 1 h 20 min» — el contexto, en gris, bajo la
     * línea de arriba. Sin nada abierto, su jornada de hoy: «Entró 10:05 · sin
     * nada hace 2 h 15 min», «Salió 18:02» o «Sin entrada hoy» (con la API vieja,
     * el rótulo del estado, como antes).
     */
    fun contexto(user: TeamBoardUserDto, ahora: Instant = Instant.now()): String {
        val abierta = user.openActivities.orEmpty().firstOrNull()
        val partes = buildList {
            abierta?.anNumber?.trim()?.takeIf { it.isNotEmpty() }?.let { add(it) }
            cargaTexto(abierta?.assignmentCharge)?.let { add(it) }
            if (sinNadaAbierto(user.status) && user.jornadaHoyConocida) {
                add(jornadaSinNada(user, ahora))
            } else {
                add(
                    CoreActivityRules.boardEstadoTexto(
                        status = user.status,
                        currentLateMinutes = user.currentLateMinutes,
                        idleSinceAt = user.idleSinceAt,
                        now = ahora,
                    ),
                )
            }
        }
        return partes.joinToString(" · ")
    }

    /** «Entró 10:05 · sin nada hace 2 h 15 min» · «Salió 18:02» · «Sin entrada hoy». */
    fun jornadaSinNada(user: TeamBoardUserDto, ahora: Instant = Instant.now()): String {
        val entrada = instante(user.entradaHoyAt) ?: return "Sin entrada hoy"
        instante(user.salidaHoyAt)?.let { return "Salió ${hora(it)}" }
        val min = minutosDesde(user.idleSinceAt, ahora)
        return if (min != null && min >= 1) {
            "Entró ${hora(entrada)} · sin nada hace ${CoreActivityRules.formatBoardMinutes(min.toDouble())}"
        } else {
            "Entró ${hora(entrada)}"
        }
    }

    /**
     * Renglón extra de la tarjeta cuando no tiene nada abierto: «Última: AN-0091 ·
     * ayer 18:11». En «libre» no sale: su contexto ya dice cuándo terminó.
     */
    fun ultimaDeTarjeta(user: TeamBoardUserDto, ahora: Instant = Instant.now()): String? {
        if (user.openActivities.orEmpty().isNotEmpty() || user.currentActivity != null) return null
        if (user.status?.trim()?.lowercase() == "libre") return null
        return ultimaActividadCorta(user, ahora)
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

    // ── Resumen: los tres aros y el desglose del ámbar ──────────────────────

    /** Por qué alguien no tiene nada abierto: está en jornada, no ha llegado o ya se fue. */
    enum class MotivoSinActividad { SIN_NADA, SIN_ENTRADA, YA_SALIO }

    /**
     * Separa a quien no tiene nada abierto («sin_actividad» / «inactivo») por su
     * jornada de hoy; `null` para los demás estados. Con la API vieja no viene
     * `entradaHoyAt` y no hay cómo separarlos: todo cuenta como «sin nada», como antes.
     */
    fun motivoSinActividad(user: TeamBoardUserDto): MotivoSinActividad? {
        if (!sinNadaAbierto(user.status)) return null
        if (!user.jornadaHoyConocida) return MotivoSinActividad.SIN_NADA
        if (user.entradaHoyAt.isNullOrBlank()) return MotivoSinActividad.SIN_ENTRADA
        if (!user.salidaHoyAt.isNullOrBlank()) return MotivoSinActividad.YA_SALIO
        return MotivoSinActividad.SIN_NADA
    }

    data class Resumen(
        val trabajando: Int,
        val retraso: Int,
        val libres: Int,
        val total: Int,
        /** Desglose del ámbar. */
        val atrasados: Int = 0,
        /** Checó hoy, sigue en jornada y no tiene nada abierto. */
        val sinNada: Int = 0,
        /** Hoy no ha checado entrada. */
        val sinEntrada: Int = 0,
        /** Ya checó su salida y no tiene nada abierto. */
        val yaSalieron: Int = 0,
    )

    fun resumen(users: List<TeamBoardUserDto>): Resumen {
        val porAro = users.groupingBy { aro(it.status) }.eachCount()
        val motivos = users.mapNotNull { motivoSinActividad(it) }.groupingBy { it }.eachCount()
        return Resumen(
            trabajando = porAro[EquipoAro.TRABAJANDO] ?: 0,
            retraso = porAro[EquipoAro.RETRASO] ?: 0,
            libres = porAro[EquipoAro.LIBRE] ?: 0,
            total = users.size,
            atrasados = users.count { it.status?.trim()?.lowercase() == "atrasado" },
            sinNada = motivos[MotivoSinActividad.SIN_NADA] ?: 0,
            sinEntrada = motivos[MotivoSinActividad.SIN_ENTRADA] ?: 0,
            yaSalieron = motivos[MotivoSinActividad.YA_SALIO] ?: 0,
        )
    }

    /**
     * El ámbar en una línea: «2 atrasados · 4 sin nada asignado · 4 sin entrada»
     * (+ «· 1 ya salió»). Los ceros no se dicen; si no hay nadie, «nadie pendiente».
     */
    fun desgloseRetraso(r: Resumen): String {
        val partes = buildList {
            if (r.atrasados > 0) add("${r.atrasados} ${if (r.atrasados == 1) "atrasado" else "atrasados"}")
            if (r.sinNada > 0) add("${r.sinNada} sin nada asignado")
            if (r.sinEntrada > 0) add("${r.sinEntrada} sin entrada")
            if (r.yaSalieron > 0) add("${r.yaSalieron} ${if (r.yaSalieron == 1) "ya salió" else "ya salieron"}")
        }
        return when {
            partes.isNotEmpty() -> partes.joinToString(" · ")
            r.retraso == 0 -> "nadie pendiente"
            // Un estado que la app no conoce también es ámbar: hay que ir a ver.
            else -> "hay que ir a ver"
        }
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
                pista = desgloseRetraso(r),
                // Color solo cuando el número pide acción (regla 6).
                color = CoreActivityRules.NARANJA.takeIf { r.retraso > 0 },
                // El desglose no se corta: «2 atrasados · 4 sin…» ya no dice cuántos faltan por llegar.
                pistaLineas = 6,
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

    // ── Horas y fechas en hora de México ────────────────────────────────────

    private fun instante(iso: String?): Instant? = CoreActivityRules.parseInstant(iso, MX)

    /** «13:39»: hora de México, 24 h. */
    private fun hora(instante: Instant): String = HORA.format(instante.atZone(MX))

    /** Minutos enteros de `iso` a `ahora` (nunca negativos); `null` sin fecha válida. */
    private fun minutosDesde(iso: String?, ahora: Instant): Long? {
        val d = instante(iso) ?: return null
        return ((ahora.toEpochMilli() - d.toEpochMilli()) / 60_000).coerceAtLeast(0)
    }

    /** Días de calendario (en México) entre dos instantes: hoy 0, ayer 1… */
    private fun diasEntre(desde: Instant, hasta: Instant): Long =
        ChronoUnit.DAYS.between(desde.atZone(MX).toLocalDate(), hasta.atZone(MX).toLocalDate())

    /**
     * Cuándo pasó algo, como se dice: «hoy 13:39», «ayer 18:11» o «lun 5 oct
     * 18:11» (con el año solo si no es el de hoy). Hora de México, 24 h.
     */
    fun cuandoMx(iso: String?, ahora: Instant = Instant.now()): String {
        val d = instante(iso) ?: return ""
        val h = hora(d)
        return when (diasEntre(d, ahora)) {
            0L -> "hoy $h"
            1L -> "ayer $h"
            else -> {
                val otroAnio = d.atZone(MX).year != ahora.atZone(MX).year
                "${(if (otroAnio) FECHA_CON_ANIO else FECHA).format(d.atZone(MX))} $h"
            }
        }
    }

    /** «hace 2 h 15 min»; con menos de un minuto, «hace un momento». */
    private fun hace(minutos: Long): String =
        if (minutos < 1) "hace un momento" else "hace ${CoreActivityRules.formatBoardMinutes(minutos.toDouble())}"

    /** Días de calendario desde `iso`: «hoy», «hace 1 día», «hace 3 días». */
    private fun haceDias(iso: String?, ahora: Instant): String? {
        val d = instante(iso) ?: return null
        val dias = diasEntre(d, ahora)
        return when {
            dias <= 0 -> "hoy"
            dias == 1L -> "hace 1 día"
            else -> "hace $dias días"
        }
    }

    private fun recortar(texto: String?, max: Int): String {
        val t = texto?.trim().orEmpty()
        return if (t.length > max) "${t.take(max - 1).trimEnd()}…" else t
    }

    // ── Última actividad terminada ──────────────────────────────────────────

    /** Sin límite cuenta a tiempo (lo mismo que los KPI de entregas). */
    private fun comoEntrego(lateMinutes: Double?): String =
        if (lateMinutes != null && lateMinutes > 0) {
            "con ${CoreActivityRules.formatBoardMinutes(lateMinutes)} de atraso"
        } else {
            "a tiempo"
        }

    /** «Última: AN-0091 · ayer 18:11». `null` sin nada terminado. */
    fun ultimaActividadCorta(user: TeamBoardUserDto, ahora: Instant = Instant.now()): String? {
        val f = user.lastFinished ?: return null
        val que = f.anNumber?.trim()?.takeIf { it.isNotEmpty() } ?: recortar(f.titulo, 24)
        return listOf("Última: $que", cuandoMx(f.finishedAt, ahora)).filter { it.isNotBlank() }.joinToString(" · ")
    }

    /**
     * «Última: AN-0085 · ayer 17:15, a tiempo» (o «…, con 40 min de atraso»).
     * Sin nada terminado: «Sin actividades terminadas».
     */
    fun ultimaActividad(user: TeamBoardUserDto, ahora: Instant = Instant.now()): String {
        val corta = ultimaActividadCorta(user, ahora) ?: return "Sin actividades terminadas"
        return "$corta, ${comoEntrego(user.lastFinished?.lateMinutes)}"
    }

    // ── «Para atender hoy»: atrasados, sin nada asignado y sin entrada ──────

    /** El motivo del atraso, en palabras. */
    val MOTIVO_ATRASO: Map<String, String> = mapOf(
        "inicio" to "no la ha iniciado",
        "tope" to "pasó su hora límite",
        "plan" to "pasó su tiempo planeado",
    )

    data class Atrasado(
        val persona: TeamBoardUserDto,
        val folio: String?,
        val titulo: String?,
        val minutosAtraso: Double?,
        /** «no la ha iniciado», «pasó su hora límite»… `null` si la API no dice por qué. */
        val motivo: String?,
        /** «Atrasada · 2 h 15 min · no la ha iniciado». */
        val detalle: String,
    ) {
        /** «AN-0091 · Depurar base de datos»; «Actividad sin datos» sin folio ni título. */
        val actividad: String
            get() = listOfNotNull(folio, titulo).joinToString(" · ").ifEmpty { "Actividad sin datos" }
    }

    data class SinNada(
        val persona: TeamBoardUserDto,
        /** Minutos sin nada abierto; `null` si la API no dice desde cuándo (API vieja). */
        val minutosSinNada: Long?,
        /** Lo dejaron sin nada desde que llegó (`idleSinceAt == entradaHoyAt`). */
        val desdeQueEntro: Boolean,
        /** «Entró 10:05»; `null` sin entrada conocida. */
        val entrada: String?,
        /** «sin nada desde hace 25 min» o «sin nada desde que entró (hace 2 h 15 min)». */
        val sinNadaDesde: String?,
        /** Ver [ultimaActividad]. */
        val ultima: String,
    ) {
        /** «Entró 08:57 · sin nada desde que entró (hace 1 h 50 min)»; vacío con la API vieja. */
        val jornada: String get() = listOfNotNull(entrada, sinNadaDesde).joinToString(" · ")
    }

    data class SinEntrada(
        val persona: TeamBoardUserDto,
        /** «Última: AN-0080 · lun 5 oct 18:38» o «Sin actividades terminadas». */
        val ultima: String,
        /** Desde su última actividad terminada: «hace 3 días». `null` si nunca terminó nada. */
        val haceCuanto: String?,
    )

    data class Atencion(
        /** Más atraso primero. */
        val atrasados: List<Atrasado>,
        /** Más tiempo sin nada primero. */
        val sinNada: List<SinNada>,
        /** Lo último que terminaron, de lo más viejo a lo más reciente; sin nada terminado al final. */
        val sinEntrada: List<SinEntrada>,
    ) {
        val vacia: Boolean get() = atrasados.isEmpty() && sinNada.isEmpty() && sinEntrada.isEmpty()
    }

    /** Mayor primero; sin dato, al final. */
    private fun <T : Comparable<T>> mayorPrimero(a: T?, b: T?): Int = when {
        a == null && b == null -> 0
        a == null -> 1
        b == null -> -1
        else -> b.compareTo(a)
    }

    /**
     * La actividad por la que va tarde: la que está haciendo (`currentActivity`,
     * con su atraso en `currentLateMinutes`); si solo vienen las abiertas, la más
     * atrasada de ellas.
     */
    private fun atrasadoDe(user: TeamBoardUserDto): Atrasado {
        val abiertas = user.openActivities.orEmpty()
        var folio: String? = null
        var titulo: String? = null
        var minutos = user.currentLateMinutes
        val actual = user.currentActivity
        if (actual != null) {
            folio = actual.anNumber?.trim()?.takeIf { it.isNotEmpty() }
            titulo = actual.titulo?.trim()?.takeIf { it.isNotEmpty() }
            if (minutos == null) minutos = abiertas.firstOrNull { it.id == actual.id }?.minutosAtraso
        } else {
            val tarde = abiertas
                .filter { it.atrasada == true }
                .sortedWith(Comparator { a, b -> mayorPrimero(a.minutosAtraso, b.minutosAtraso) })
                .firstOrNull() ?: abiertas.firstOrNull()
            if (tarde != null) {
                folio = tarde.anNumber?.trim()?.takeIf { it.isNotEmpty() }
                titulo = tarde.titulo?.trim()?.takeIf { it.isNotEmpty() }
                if (minutos == null) minutos = tarde.minutosAtraso
            }
        }
        val motivo = user.currentLateReason?.trim()?.lowercase()?.let { MOTIVO_ATRASO[it] }
        val detalle = listOfNotNull(
            if (minutos != null && minutos > 0) "Atrasada · ${CoreActivityRules.formatBoardMinutes(minutos)}" else "Atrasada",
            motivo,
        ).joinToString(" · ")
        return Atrasado(user, folio, titulo, minutos, motivo, detalle)
    }

    private fun sinNadaDe(user: TeamBoardUserDto, ahora: Instant): SinNada {
        val entrada = instante(user.entradaHoyAt)
        val idle = instante(user.idleSinceAt)
        val minutos = minutosDesde(user.idleSinceAt, ahora)
        val desdeQueEntro = idle != null && entrada != null && idle == entrada
        val desde = minutos?.let {
            if (desdeQueEntro) "sin nada desde que entró (${hace(it)})" else "sin nada desde ${hace(it)}"
        }
        return SinNada(
            persona = user,
            minutosSinNada = minutos,
            desdeQueEntro = desdeQueEntro,
            entrada = entrada?.let { "Entró ${hora(it)}" },
            sinNadaDesde = desde,
            ultima = ultimaActividad(user, ahora),
        )
    }

    /**
     * Lo que el encargado tiene que ir a ver, en tres listas: quién va tarde y con
     * qué, a quién dejaron sin nada (y desde cuándo, y qué fue lo último que hizo) y
     * quién no ha checado. Quien ya salió y los libres no piden nada.
     */
    fun atencionEquipo(users: List<TeamBoardUserDto>, ahora: Instant = Instant.now()): Atencion {
        val collator = Collator.getInstance(ES_MX)
        val nombre = { a: TeamBoardUserDto, b: TeamBoardUserDto ->
            collator.compare(a.nombre?.trim().orEmpty(), b.nombre?.trim().orEmpty())
        }
        val atrasados = mutableListOf<Atrasado>()
        val sinNada = mutableListOf<SinNada>()
        val sinEntrada = mutableListOf<SinEntrada>()
        for (u in users) {
            if (u.status?.trim()?.lowercase() == "atrasado") {
                atrasados += atrasadoDe(u)
                continue
            }
            when (motivoSinActividad(u)) {
                MotivoSinActividad.SIN_NADA -> sinNada += sinNadaDe(u, ahora)
                MotivoSinActividad.SIN_ENTRADA -> sinEntrada += SinEntrada(
                    persona = u,
                    ultima = ultimaActividadCorta(u, ahora) ?: "Sin actividades terminadas",
                    haceCuanto = haceDias(u.lastFinished?.finishedAt, ahora),
                )
                MotivoSinActividad.YA_SALIO, null -> Unit
            }
        }
        val terminoHace = { s: SinEntrada ->
            instante(s.persona.lastFinished?.finishedAt)?.let { ahora.toEpochMilli() - it.toEpochMilli() }
        }
        return Atencion(
            atrasados = atrasados.sortedWith(
                Comparator { a, b -> mayorPrimero(a.minutosAtraso, b.minutosAtraso).takeIf { it != 0 } ?: nombre(a.persona, b.persona) },
            ),
            sinNada = sinNada.sortedWith(
                Comparator { a, b -> mayorPrimero(a.minutosSinNada, b.minutosSinNada).takeIf { it != 0 } ?: nombre(a.persona, b.persona) },
            ),
            sinEntrada = sinEntrada.sortedWith(
                Comparator { a, b -> mayorPrimero(terminoHace(a), terminoHace(b)).takeIf { it != 0 } ?: nombre(a.persona, b.persona) },
            ),
        )
    }

    /** Un renglón de «Para atender hoy», ya dicho en palabras. */
    data class RenglonAtencion(
        val persona: TeamBoardUserDto,
        val principal: String,
        /** ARGB del renglón principal; `null` = tinta normal. */
        val colorPrincipal: Long? = null,
        val secundaria: String? = null,
        val colorSecundaria: Long? = null,
        /** Dato corto a la derecha del nombre («hace 3 días»). */
        val meta: String? = null,
    )

    /** Un grupo de «Para atender hoy»: título, el color de su punto y sus renglones. */
    data class GrupoAtencion(
        val clave: String,
        val titulo: String,
        /** ARGB del punto; `null` = el gris del flujo normal. */
        val color: Long?,
        val renglones: List<RenglonAtencion>,
    )

    /**
     * «Para atender hoy» listo para pintar: atrasados (lo suyo y el atraso en
     * rojo), sin nada asignado (su jornada en ámbar y lo último que terminó) y sin
     * entrada hoy (lo último que terminó y hace cuánto). Un grupo vacío no sale;
     * sin ninguno, la lista viene vacía y la sección no se pinta.
     */
    fun gruposAtencion(users: List<TeamBoardUserDto>, ahora: Instant = Instant.now()): List<GrupoAtencion> {
        val a = atencionEquipo(users, ahora)
        return listOf(
            GrupoAtencion(
                clave = "atrasados",
                titulo = "Atrasados",
                color = CoreActivityRules.ROJO,
                renglones = a.atrasados.map {
                    RenglonAtencion(
                        persona = it.persona,
                        principal = it.actividad,
                        secundaria = it.detalle,
                        colorSecundaria = CoreActivityRules.ROJO,
                    )
                },
            ),
            GrupoAtencion(
                clave = "sin-nada",
                titulo = "Sin nada asignado",
                color = CoreActivityRules.NARANJA,
                renglones = a.sinNada.map {
                    val jornada = it.jornada
                    if (jornada.isNotEmpty()) {
                        RenglonAtencion(
                            persona = it.persona,
                            principal = jornada,
                            colorPrincipal = CoreActivityRules.NARANJA,
                            secundaria = it.ultima,
                        )
                    } else {
                        // API vieja: no se sabe desde cuándo; queda lo último que terminó.
                        RenglonAtencion(persona = it.persona, principal = it.ultima)
                    }
                },
            ),
            GrupoAtencion(
                clave = "sin-entrada",
                titulo = "Sin entrada hoy",
                color = null,
                renglones = a.sinEntrada.map {
                    RenglonAtencion(persona = it.persona, principal = it.ultima, meta = it.haceCuanto)
                },
            ),
        ).filter { it.renglones.isNotEmpty() }
    }
}
