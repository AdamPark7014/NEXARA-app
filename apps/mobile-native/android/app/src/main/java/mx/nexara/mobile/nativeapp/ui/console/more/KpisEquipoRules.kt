package mx.nexara.mobile.nativeapp.ui.console.more

import java.text.Collator
import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToInt
import kotlin.math.roundToLong
import mx.nexara.mobile.nativeapp.data.api.KpiEntregasDto
import mx.nexara.mobile.nativeapp.data.api.KpiPersonaFilaDto
import mx.nexara.mobile.nativeapp.data.api.KpiTotalesDto
import mx.nexara.mobile.nativeapp.data.api.KpisEquipoDto

/**
 * KPIs del equipo en el teléfono, ya masticados para pintar — la lectura de
 * `apps/web/lib/kpis-lectura.ts`.
 *
 * La web enseña un ranking por persona. En un teléfono cada persona es una
 * tarjeta con su semáforo y **tres** números — cumplimiento, entregas y
 * puntualidad — y el resto (de qué sale el cumplimiento, tiempo en actividades,
 * horas, uniforme, extra, jornadas sin cerrar) sale al desplegarla. Con una API
 * que todavía no manda el cumplimiento, la tarjeta y el orden son los de antes.
 * Lo que el API no manda sale «—»; no se inventa un cero, que parece un dato y
 * no lo es.
 *
 * Sin Android: se prueba en la JVM (`KpisEquipoRulesTest`).
 */
object KpisEquipoRules {

    private val ES_MX: Locale = Locale.forLanguageTag("es-MX")

    /** Semáforo del servidor (`verde` · `amarillo` · `rojo` · `sin_datos`). */
    enum class Semaforo(val etiqueta: String) {
        VERDE("Bien"),
        AMARILLO("Atención"),
        ROJO("Mal"),
        SIN_DATOS("Sin datos"),
    }

    fun semaforo(valor: String?): Semaforo = when (valor?.trim()?.lowercase()) {
        "verde" -> Semaforo.VERDE
        "amarillo" -> Semaforo.AMARILLO
        "rojo" -> Semaforo.ROJO
        else -> Semaforo.SIN_DATOS
    }

    /** Orden de lectura: primero lo que está mal. Dentro de un nivel, por nombre. */
    private fun peso(s: Semaforo): Int = when (s) {
        Semaforo.ROJO -> 0
        Semaforo.AMARILLO -> 1
        Semaforo.VERDE -> 2
        Semaforo.SIN_DATOS -> 3
    }

    /**
     * ¿La API ya manda el cumplimiento? La nueva manda `entregas` SIEMPRE, aunque
     * sea en ceros; la vieja no manda nada de eso. No se pregunta por
     * `cumplimientoPct` solo: Moshi lee igual un campo ausente que un `null`, y
     * con la API nueva `null` quiere decir «sin entregas que medir».
     */
    fun conCumplimiento(t: KpiTotalesDto?): Boolean =
        t != null && (t.entregas != null || t.cumplimientoPartes != null || t.cumplimientoPct != null)

    /** Por nombre como lo ordena una persona: «Ángel» va con la A, no después de la Z. */
    private fun porNombre(): Comparator<KpiPersonaFilaDto> {
        val collator = Collator.getInstance(ES_MX)
        return Comparator { a, b ->
            collator.compare(a.persona?.nombre?.trim().orEmpty(), b.persona?.nombre?.trim().orEmpty())
        }
    }

    /** Mayor primero; sin dato (o un número roto) al final. */
    private fun mayorPrimero(x: Double?, y: Double?): Int {
        val a = x?.takeIf { it.isFinite() }
        val b = y?.takeIf { it.isFinite() }
        return when {
            a == null && b == null -> 0
            a == null -> 1
            b == null -> -1
            else -> b.compareTo(a)
        }
    }

    /**
     * El orden de la lista.
     *
     * Con cumplimiento (API nueva): quien más cumple en tiempo y forma arriba, sin
     * dato al final; a igualdad, más entregas a tiempo; luego por nombre — el
     * `ordenaRanking(…, "cumplimiento")` de la web. Adam quiere ver quién cumple
     * más; el semáforo sigue en cada tarjeta.
     *
     * Con la API vieja, lo de antes: primero quien está en rojo, porque en una
     * columna de tarjetas nadie baja hasta la número catorce.
     */
    fun ordenar(personas: List<KpiPersonaFilaDto>): List<KpiPersonaFilaDto> {
        val nombre = porNombre()
        if (personas.any { conCumplimiento(it.totales) }) {
            return personas.sortedWith(
                Comparator { a, b ->
                    mayorPrimero(a.totales?.cumplimientoPct, b.totales?.cumplimientoPct).takeIf { it != 0 }
                        ?: ((b.totales?.entregas?.aTiempo ?: 0) - (a.totales?.entregas?.aTiempo ?: 0)).takeIf { it != 0 }
                        ?: nombre.compare(a, b)
                },
            )
        }
        return personas.sortedWith(compareBy<KpiPersonaFilaDto> { peso(semaforo(it.semaforo)) }.then(nombre))
    }

    /** Lo que se lee bajo «Persona por persona»: cómo está ordenada la lista. */
    fun subtituloLista(personas: List<KpiPersonaFilaDto>): String =
        if (personas.any { conCumplimiento(it.totales) }) {
            "Por cumplimiento, de mayor a menor"
        } else {
            "De peor a mejor, para no tener que buscarlo"
        }

    /** Filtro por nombre, puesto o correo; sin texto devuelve todo. */
    fun filtrar(personas: List<KpiPersonaFilaDto>, consulta: String): List<KpiPersonaFilaDto> {
        val q = consulta.trim().lowercase()
        if (q.isEmpty()) return personas
        return personas.filter { fila ->
            val p = fila.persona
            listOfNotNull(p?.nombre, p?.puesto, p?.email)
                .any { it.lowercase().contains(q) }
        }
    }

    /** «Toda la empresa» / «Mi equipo» — de dónde salen estos números. */
    fun alcance(scope: String?): String =
        if (scope?.trim()?.lowercase() == "company") "Toda la empresa" else "Mi equipo"

    // ── Números ──────────────────────────────────────────────────────────────

    /** «83 %» · «—» cuando no hay porcentaje que dar. */
    fun pct(valor: Double?): String {
        val v = valor?.takeIf { it.isFinite() } ?: return "—"
        return "${v.roundToInt()} %"
    }

    /** «7 h 30 m» · «45 m» · «—». Minutos negativos se leen igual que positivos. */
    fun horas(minutos: Int?): String {
        val m = minutos ?: return "—"
        val total = abs(m)
        val h = total / 60
        val resto = total % 60
        val signo = if (m < 0) "-" else ""
        return when {
            h == 0 -> "$signo$resto m"
            resto == 0 -> "$signo$h h"
            else -> "$signo$h h $resto m"
        }
    }

    /**
     * Puntualidad: de los días con jornada, cuántos sin retardo.
     * `null` si no hubo ni un día que contar — no es 100 %.
     */
    fun puntualidadPct(t: KpiTotalesDto?): Double? {
        val dias = t?.diasConJornada ?: return null
        if (dias <= 0) return null
        val retardos = (t.retardos ?: 0).coerceIn(0, dias)
        return (dias - retardos) * 100.0 / dias
    }

    /** «3 retardos · 48 m tarde» · «Sin retardos» · «—» sin días que contar. */
    fun puntualidadPie(t: KpiTotalesDto?): String {
        val dias = t?.diasConJornada ?: 0
        if (dias <= 0) return "Sin días con jornada"
        val retardos = t?.retardos ?: 0
        if (retardos <= 0) return "Sin retardos en $dias ${if (dias == 1) "día" else "días"}"
        val tarde = t?.minutosTarde
        val etiqueta = if (retardos == 1) "1 retardo" else "$retardos retardos"
        return if (tarde != null && tarde > 0) "$etiqueta · ${horas(tarde)} tarde" else etiqueta
    }

    /** «6 h 10 m de 7 h 45 m» — productivo contra laborado. */
    fun productividadPie(t: KpiTotalesDto?): String {
        val productivos = t?.minutosProductivos
        val laborados = t?.minutosLaborados
        if (productivos == null && laborados == null) return "Sin horas registradas"
        return "${horas(productivos)} de ${horas(laborados)}"
    }

    /** Verde arriba de 85, naranja arriba de 60, rojo debajo; gris sin dato. */
    const val PCT_BUENO = 85.0
    const val PCT_MALO = 60.0

    fun tonoPct(valor: Double?): Semaforo = when {
        valor == null || !valor.isFinite() -> Semaforo.SIN_DATOS
        valor >= PCT_BUENO -> Semaforo.VERDE
        valor >= PCT_MALO -> Semaforo.AMARILLO
        else -> Semaforo.ROJO
    }

    /** Cumplimiento en tiempo y forma, con los cortes del semáforo de entregas de la API. */
    const val CUMPLIMIENTO_BUENO = 90.0
    const val CUMPLIMIENTO_REGULAR = 75.0

    /** Verde ≥ 90, ámbar ≥ 75, rojo debajo; gris sin dato. */
    fun tonoCumplimiento(valor: Double?): Semaforo = when {
        valor == null || !valor.isFinite() -> Semaforo.SIN_DATOS
        valor >= CUMPLIMIENTO_BUENO -> Semaforo.VERDE
        valor >= CUMPLIMIENTO_REGULAR -> Semaforo.AMARILLO
        else -> Semaforo.ROJO
    }

    private fun plural(n: Int, uno: String, varios: String) = "$n ${if (n == 1) uno else varios}"

    /** «En tiempo y forma» · «Sin entregas» cuando en el rango no hubo nada que medir. */
    fun cumplimientoPie(t: KpiTotalesDto?): String =
        if (t?.cumplimientoPct?.takeIf { it.isFinite() } == null) "Sin entregas" else "En tiempo y forma"

    /** Pie del cumplimiento del equipo: «17 de 18 entregas a tiempo · 0 devueltas». */
    fun entregasDelEquipo(e: KpiEntregasDto?): String {
        val medidas = e?.medidas ?: 0
        if (e == null || medidas <= 0) return "Sin entregas en estas fechas"
        return "${e.aTiempo ?: 0} de ${plural(medidas, "entrega", "entregas")} a tiempo · " +
            plural(e.devueltas ?: 0, "devuelta", "devueltas")
    }

    /**
     * Las entregas de una persona: «17/18» a tiempo, y en el pie cuántas le
     * aprobaron a la primera. Sin nada que medir, «—» y «Sin entregas».
     */
    fun entregasDato(t: KpiTotalesDto?): Dato {
        val e = t?.entregas
        val medidas = e?.medidas ?: 0
        if (e == null || medidas <= 0) return Dato("Entregas", "—", "Sin entregas", Semaforo.SIN_DATOS)
        val aTiempo = e.aTiempo ?: 0
        val revisadas = e.revisadas ?: 0
        val pie = if (revisadas > 0) {
            "a tiempo · ${e.aprobadasALaPrimera ?: 0}/$revisadas a la primera"
        } else {
            "a tiempo"
        }
        val pctATiempo = e.pctATiempo ?: (aTiempo * 100.0 / medidas)
        return Dato("Entregas", "$aTiempo/$medidas", pie, tonoCumplimiento(pctATiempo))
    }

    /**
     * «Tiempo en actividades» (la vieja «productividad»): minutos con el reloj de
     * una actividad corriendo ÷ minutos en jornada. Pie «92 h de 189 h en jornada».
     */
    fun tiempoEnActividadesPie(t: KpiTotalesDto?): String {
        val productivos = t?.minutosProductivos
        val laborados = t?.minutosLaborados
        if (productivos == null || laborados == null) return productividadPie(t)
        return "${(productivos / 60.0).roundToInt()} h de ${(laborados / 60.0).roundToInt()} h en jornada"
    }

    /** Un renglón de lo desplegado: etiqueta a la izquierda, lo que dice a la derecha. */
    data class Linea(val etiqueta: String, val valor: String)

    /** «40» · «12.5»: el peso como viene, sin decimales de más. */
    private fun numero(valor: Double): String {
        val decimas = (valor * 10).roundToLong()
        return if (decimas % 10 == 0L) "${decimas / 10}" else "${decimas / 10}.${abs(decimas % 10)}"
    }

    /** `tiempo_adecuado` → «Tiempo adecuado», para una parte que llegue sin etiqueta. */
    private fun nombreDeClave(clave: String): String =
        clave.replace('_', ' ').replace('-', ' ').trim().replaceFirstChar { it.titlecase(ES_MX) }

    /**
     * De qué está hecho el cumplimiento, una parte por renglón:
     * «Entregas a tiempo» → «17 de 18 · 94 % · pesa 40 %».
     *
     * Se recorre la lista que mande el API tal cual: ni cuántas partes son, ni sus
     * claves, ni sus pesos están escritos aquí. Una parte nueva se pinta igual.
     */
    fun partesCumplimiento(t: KpiTotalesDto?): List<Linea> =
        t?.cumplimientoPartes.orEmpty().mapNotNull { p ->
            val etiqueta = p.etiqueta?.trim()?.ifEmpty { null }
                ?: p.clave?.trim()?.ifEmpty { null }?.let(::nombreDeClave)
                ?: return@mapNotNull null
            val valor = listOfNotNull(
                p.detalle?.trim()?.ifEmpty { null },
                p.pct?.takeIf { it.isFinite() }?.let { pct(it) },
                p.peso?.takeIf { it.isFinite() }?.let { "pesa ${numero(it)} %" },
            ).joinToString(" · ")
            Linea(etiqueta, valor.ifEmpty { "—" })
        }

    /**
     * Lo que sale al desplegar la tarjeta, antes del horario y el uniforme: con
     * cumplimiento, sus partes, el tiempo en actividades y las horas (lo que antes
     * eran dos de los tres números de la tarjeta). Con la API vieja, nada: esos
     * números siguen en la tarjeta.
     */
    fun lineasDesplegadas(t: KpiTotalesDto?): List<Linea> {
        if (!conCumplimiento(t)) return emptyList()
        return partesCumplimiento(t) + listOf(
            Linea("Tiempo en actividades", "${pct(t?.productividadPct)} · ${productividadPie(t)}"),
            Linea("Horas", "${horas(t?.minutosLaborados)} · ${jornadasPie(t)}"),
        )
    }

    /** Un número de la tira de arriba o de la tarjeta de una persona. */
    data class Dato(
        val etiqueta: String,
        val valor: String,
        val pie: String,
        val tono: Semaforo,
    )

    /**
     * Los tres números que caben en una tarjeta de persona sin apretarla:
     * cumplimiento, entregas y puntualidad. Con la API vieja, los de antes:
     * puntualidad, productividad y horas.
     */
    fun datosPersona(t: KpiTotalesDto?): List<Dato> {
        val puntualidad = puntualidadPct(t)
        val datoPuntualidad = Dato("Puntualidad", pct(puntualidad), puntualidadPie(t), tonoPct(puntualidad))
        if (!conCumplimiento(t)) {
            return listOf(
                datoPuntualidad,
                Dato("Productividad", pct(t?.productividadPct), productividadPie(t), tonoPct(t?.productividadPct)),
                Dato("Horas", horas(t?.minutosLaborados), jornadasPie(t), Semaforo.SIN_DATOS),
            )
        }
        return listOf(
            Dato("Cumplimiento", pct(t?.cumplimientoPct), cumplimientoPie(t), tonoCumplimiento(t?.cumplimientoPct)),
            entregasDato(t),
            datoPuntualidad,
        )
    }

    /** «5 días · 1 sin checar» — de qué se compone el total de horas. */
    fun jornadasPie(t: KpiTotalesDto?): String {
        val dias = t?.diasConJornada ?: 0
        val base = "$dias ${if (dias == 1) "día" else "días"}"
        val sinChecar = t?.diasSinChecada ?: 0
        val justificadas = t?.faltasJustificadas ?: 0
        val extras = buildList {
            if (sinChecar > 0) add("$sinChecar sin checar")
            if (justificadas > 0) add("$justificadas justificada${if (justificadas == 1) "" else "s"}")
        }
        return if (extras.isEmpty()) base else "$base · ${extras.joinToString(" · ")}"
    }

    /**
     * La tira de arriba: cómo va el equipo entero en el periodo. Con cumplimiento:
     * cumplimiento, puntualidad, tiempo en actividades (sin semáforo: mide reloj
     * corriendo, no si entregó a tiempo), uniforme y tiempo extra. Con la API
     * vieja, la tira de siempre.
     */
    fun datosEquipo(datos: KpisEquipoDto?): List<Dato> {
        val t = datos?.equipo?.totales ?: return emptyList()
        val puntualidad = puntualidadPct(t)
        val uniforme = t.uniforme
        val datoPuntualidad = Dato("Puntualidad", pct(puntualidad), puntualidadPie(t), tonoPct(puntualidad))
        val datoUniforme = Dato("Uniforme", pct(uniforme?.pct), uniformePie(t), tonoPct(uniforme?.pct))
        val datoExtra = Dato("Tiempo extra", horas(t.minutosExtra), extraPie(t), extraTono(t))
        if (!conCumplimiento(t)) {
            return listOf(
                datoPuntualidad,
                Dato("Productividad", pct(t.productividadPct), productividadPie(t), tonoPct(t.productividadPct)),
                datoUniforme,
                datoExtra,
            )
        }
        return listOf(
            Dato("Cumplimiento", pct(t.cumplimientoPct), entregasDelEquipo(t.entregas), tonoCumplimiento(t.cumplimientoPct)),
            datoPuntualidad,
            Dato("Tiempo en actividades", pct(t.productividadPct), tiempoEnActividadesPie(t), Semaforo.SIN_DATOS),
            datoUniforme,
            datoExtra,
        )
    }

    /** «12 de 15 revisadas» · «Nadie ha revisado». */
    fun uniformePie(t: KpiTotalesDto?): String {
        val u = t?.uniforme
        val revisadas = u?.revisadas ?: 0
        if (revisadas <= 0) return "Nadie ha revisado"
        val ok = u?.ok ?: 0
        return "$ok de $revisadas revisadas"
    }

    /** «2 h pendientes de aprobar» es lo que importa: lo aprobado ya está resuelto. */
    fun extraPie(t: KpiTotalesDto?): String {
        if (t?.minutosExtra == null) return "Sin horario fijo"
        val pendientes = t.minutosExtraPendientes ?: 0
        if (pendientes > 0) {
            val dias = t.diasExtraPendientes ?: 0
            val diasTexto = if (dias > 0) " en $dias ${if (dias == 1) "día" else "días"}" else ""
            return "${horas(pendientes)} por aprobar$diasTexto"
        }
        val aprobados = t.minutosExtraAprobados ?: 0
        return if (aprobados > 0) "${horas(aprobados)} aprobadas" else "Nada pendiente"
    }

    /** Tiempo extra sin decidir = ámbar; todo resuelto = verde. */
    fun extraTono(t: KpiTotalesDto?): Semaforo = when {
        t?.minutosExtra == null -> Semaforo.SIN_DATOS
        (t.minutosExtraPendientes ?: 0) > 0 -> Semaforo.AMARILLO
        else -> Semaforo.VERDE
    }

    /**
     * Lo que esta pantalla NO hace y la web sí, dicho sin rodeos. Nada de
     * «disponible pronto»: el Excel y la aprobación de horas extra se firman en
     * la computadora y punto.
     */
    const val LIMITE =
        "Consulta del periodo. Aprobar tiempo extra y descargar el Excel se hacen desde la computadora."
}
