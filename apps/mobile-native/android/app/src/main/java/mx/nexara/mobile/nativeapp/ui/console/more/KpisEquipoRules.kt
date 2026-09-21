package mx.nexara.mobile.nativeapp.ui.console.more

import kotlin.math.abs
import kotlin.math.roundToInt
import mx.nexara.mobile.nativeapp.data.api.KpiPersonaFilaDto
import mx.nexara.mobile.nativeapp.data.api.KpiTotalesDto
import mx.nexara.mobile.nativeapp.data.api.KpisEquipoDto

/**
 * KPIs del equipo en el teléfono, ya masticados para pintar.
 *
 * La web enseña una tabla de doce columnas por persona. En un teléfono eso no se
 * lee: aquí cada persona es una tarjeta con su semáforo y **tres** números —
 * puntualidad, productividad y horas — y el resto (uniforme, extra, jornadas sin
 * cerrar) sale al desplegarla. Lo que el API no manda sale «—»; no se inventa un
 * cero, que parece un dato y no lo es.
 *
 * Sin Android: se prueba en la JVM (`KpisEquipoRulesTest`).
 */
object KpisEquipoRules {

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
     * Las personas como se leen en el teléfono: lo urgente arriba. En la web se
     * ordena alfabéticamente porque hay espacio para buscar con la vista; en una
     * lista de una columna, quien está en rojo tiene que aparecer primero.
     */
    fun ordenar(personas: List<KpiPersonaFilaDto>): List<KpiPersonaFilaDto> =
        personas.sortedWith(
            compareBy(
                { peso(semaforo(it.semaforo)) },
                { it.persona?.nombre?.lowercase().orEmpty() },
            ),
        )

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

    /** Un número de la tira de arriba o de la tarjeta de una persona. */
    data class Dato(
        val etiqueta: String,
        val valor: String,
        val pie: String,
        val tono: Semaforo,
    )

    /** Los tres números que caben en una tarjeta de persona sin apretarla. */
    fun datosPersona(t: KpiTotalesDto?): List<Dato> {
        val puntualidad = puntualidadPct(t)
        return listOf(
            Dato("Puntualidad", pct(puntualidad), puntualidadPie(t), tonoPct(puntualidad)),
            Dato("Productividad", pct(t?.productividadPct), productividadPie(t), tonoPct(t?.productividadPct)),
            Dato("Horas", horas(t?.minutosLaborados), jornadasPie(t), Semaforo.SIN_DATOS),
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

    /** La tira de arriba: cómo va el equipo entero en el periodo. */
    fun datosEquipo(datos: KpisEquipoDto?): List<Dato> {
        val t = datos?.equipo?.totales ?: return emptyList()
        val puntualidad = puntualidadPct(t)
        val uniforme = t.uniforme
        return listOf(
            Dato("Puntualidad", pct(puntualidad), puntualidadPie(t), tonoPct(puntualidad)),
            Dato("Productividad", pct(t.productividadPct), productividadPie(t), tonoPct(t.productividadPct)),
            Dato("Uniforme", pct(uniforme?.pct), uniformePie(t), tonoPct(uniforme?.pct)),
            Dato("Tiempo extra", horas(t.minutosExtra), extraPie(t), extraTono(t)),
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
