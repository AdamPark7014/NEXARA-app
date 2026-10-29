package mx.nexara.mobile.nativeapp.ui.console.more

import java.text.Collator
import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToInt
import kotlin.math.roundToLong
import mx.nexara.mobile.nativeapp.data.api.KpiEntregasDto
import mx.nexara.mobile.nativeapp.data.api.KpiParteCumplimientoDto
import mx.nexara.mobile.nativeapp.data.api.KpiPersonaFilaDto
import mx.nexara.mobile.nativeapp.data.api.KpiTotalesDto
import mx.nexara.mobile.nativeapp.data.api.KpisEquipoDto

/**
 * KPIs del equipo en el teléfono, ya masticados para pintar — la lectura de
 * `apps/web/lib/desempeno.ts` (índice v2, 29-10) y `apps/web/lib/kpis-lectura.ts`.
 *
 * La web enseña una banda con el índice del equipo, una tabla por persona con los
 * cuatro pilares (Confiabilidad, Calidad, Rendimiento y Disciplina) y la lectura de
 * quien se elija. En un teléfono cada persona es una tarjeta con su semáforo y
 * **tres** números — índice, entregas y disciplina — y la lectura sale al
 * desplegarla: horas estándar ganadas, calificación calibrada, disciplina, «Su
 * equipo» para coordinadores, de qué sale el índice pilar por pilar y, aparte, el
 * diagnóstico que no pesa. Con una API que todavía no manda el índice, la tarjeta y
 * el orden son los de antes. Lo que el API no manda sale «—»; no se inventa un
 * cero, que parece un dato y no lo es.
 *
 * Semáforo, confianza y pilares: el API los manda ya calculados desde f2dc7130
 * (`semaforoIndice`, `confianza`, `pilares[]` y `cumplimientoPartes[].semaforo`, con
 * cortes únicos ≥ 90 verde, ≥ 75 ámbar) y se usan tal cual. Sin ellos (un API anterior),
 * se calculan aquí con los mismos cortes y la confianza de la web (provisional con menos
 * de 10 entregas).
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

    /**
     * El semáforo que manda el API en una parte del índice: texto (`verde` · `amarillo` ·
     * `rojo` · `sin_datos`, o los tonos de la web `ok` · `atencion` · `critico`) u objeto con
     * `semaforo`, `nivel`, `color` o `tono`. `null` si no viene o no se entiende: entonces
     * deciden los cortes locales, que son los mismos del API.
     */
    fun semaforoDelApi(valor: Any?): Semaforo? =
        when (textoDe(valor, "semaforo", "nivel", "color", "tono")?.lowercase()) {
            "verde", "ok" -> Semaforo.VERDE
            "amarillo", "atencion", "atención" -> Semaforo.AMARILLO
            "rojo", "critico", "crítico" -> Semaforo.ROJO
            "sin_datos" -> Semaforo.SIN_DATOS
            else -> null
        }

    /** `"alta"` tal cual, o el primer texto de `claves` dentro de un objeto. */
    private fun textoDe(valor: Any?, vararg claves: String): String? = when (valor) {
        is String -> valor.trim().ifEmpty { null }
        is Map<*, *> -> claves.firstNotNullOfOrNull { (valor[it] as? String)?.trim()?.ifEmpty { null } }
        else -> null
    }

    /** Orden de lectura: primero lo que está mal. Dentro de un nivel, por nombre. */
    private fun peso(s: Semaforo): Int = when (s) {
        Semaforo.ROJO -> 0
        Semaforo.AMARILLO -> 1
        Semaforo.VERDE -> 2
        Semaforo.SIN_DATOS -> 3
    }

    /**
     * ¿La API ya manda el índice? La nueva manda `entregas` SIEMPRE, aunque sea en
     * ceros; la vieja no manda nada de eso. No se pregunta por `cumplimientoPct`
     * solo: Moshi lee igual un campo ausente que un `null`, y con la API nueva
     * `null` quiere decir «nada que medir».
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
     * Con índice (API nueva): el índice más alto arriba, sin dato al final; a
     * igualdad, más entregas a tiempo; luego por nombre — el
     * `ordenaRanking(…, "cumplimiento")` de la web. El semáforo sigue en cada tarjeta.
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
            "Por índice, de mayor a menor"
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

    /**
     * Bajo el nombre, como la web: «Técnico · confianza alta». Con la API vieja, el
     * puesto o el horario, como antes.
     */
    fun subtituloPersona(fila: KpiPersonaFilaDto): String? {
        val area = fila.persona?.puesto?.trim()?.ifEmpty { null }
            ?: fila.horario?.etiqueta?.trim()?.ifEmpty { null }
        if (!conCumplimiento(fila.totales)) return area
        val conf = confianza(fila).etiqueta
        return if (area != null) "$area · $conf" else conf.replaceFirstChar { it.titlecase(ES_MX) }
    }

    // ── Números ──────────────────────────────────────────────────────────────

    /** «83 %» · «—» cuando no hay porcentaje que dar. */
    fun pct(valor: Double?): String {
        val v = valor?.takeIf { it.isFinite() } ?: return "—"
        return "${v.roundToInt()} %"
    }

    /** «86» · «—»: el índice y sus pilares van de 0 a 100, sin «%», como en la web. */
    fun indice(valor: Double?): String = valor?.takeIf { it.isFinite() }?.roundToInt()?.toString() ?: "—"

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

    // ── Cortes del semáforo: los de `UMBRALES_KPI` del API (`apps/api/src/me/kpis-equipo.ts`) ──

    /** Índice, pilares y entregas a tiempo: ≥ 90 verde, ≥ 75 ámbar (`entregasVerde`, `formaVerde`; la web, `tonoCumplimiento`). */
    const val CUMPLIMIENTO_BUENO = 90.0
    const val CUMPLIMIENTO_REGULAR = 75.0

    /** Tiempo en actividades: ≥ 70 verde, ≥ 50 ámbar (`productividadVerde`). Solo informa. */
    const val PRODUCTIVIDAD_BUENA = 70.0
    const val PRODUCTIVIDAD_REGULAR = 50.0

    /** Uniforme ✓ de lo revisado: ≥ 95 verde, ≥ 80 ámbar (`uniformeVerde`). */
    const val UNIFORME_BUENO = 95.0
    const val UNIFORME_REGULAR = 80.0

    /** Retardos en el rango: 1–2 ámbar, 3 o más rojo (`retardosAmarillo`, `retardosRojo`). */
    const val RETARDOS_AMARILLO = 1
    const val RETARDOS_ROJO = 3

    private fun corte(valor: Double?, bueno: Double, regular: Double): Semaforo = when {
        valor == null || !valor.isFinite() -> Semaforo.SIN_DATOS
        valor >= bueno -> Semaforo.VERDE
        valor >= regular -> Semaforo.AMARILLO
        else -> Semaforo.ROJO
    }

    /** Verde ≥ 90, ámbar ≥ 75, rojo debajo; gris sin dato. */
    fun tonoCumplimiento(valor: Double?): Semaforo = corte(valor, CUMPLIMIENTO_BUENO, CUMPLIMIENTO_REGULAR)

    /**
     * Color del índice: el `semaforoIndice` que manda el API (f2dc7130); sin él, el corte
     * 90/75 sobre `cumplimientoPct`. Lo usan la tira del equipo, la tarjeta de cada persona y
     * el anillo del inicio de dirección.
     */
    fun tonoIndice(t: KpiTotalesDto?): Semaforo =
        semaforoDelApi(t?.semaforoIndice) ?: tonoCumplimiento(t?.cumplimientoPct)

    /** Verde ≥ 70, ámbar ≥ 50, rojo debajo; gris sin dato. */
    fun tonoProductividad(valor: Double?): Semaforo = corte(valor, PRODUCTIVIDAD_BUENA, PRODUCTIVIDAD_REGULAR)

    /** Verde ≥ 95, ámbar ≥ 80, rojo debajo; gris sin dato. */
    fun tonoUniforme(valor: Double?): Semaforo = corte(valor, UNIFORME_BUENO, UNIFORME_REGULAR)

    /** Sin retardos verde, 1–2 ámbar, 3 o más rojo; gris sin días con jornada. */
    fun tonoRetardos(t: KpiTotalesDto?): Semaforo {
        if ((t?.diasConJornada ?: 0) <= 0) return Semaforo.SIN_DATOS
        val r = t?.retardos ?: 0
        return when {
            r >= RETARDOS_ROJO -> Semaforo.ROJO
            r >= RETARDOS_AMARILLO -> Semaforo.AMARILLO
            else -> Semaforo.VERDE
        }
    }

    // ── Puntualidad: graduada, como la cuenta el índice ──────────────────────

    /** ¿Viene la Disciplina del índice (puntualidad graduada)? */
    private fun graduada(t: KpiTotalesDto?): Boolean {
        val d = t?.disciplina ?: return false
        return (d.esperados ?: 0) > 0 && d.pct?.isFinite() == true
    }

    /**
     * Puntualidad graduada: `disciplina.pct` del API (hasta 15 min tarde cuenta 1,
     * 16–30 0.6, 31–60 0.3 y más 0, × registro completo). Sin ese dato (API anterior),
     * la binaria de siempre: días sin retardo ÷ días con jornada. `null` si no hubo ni
     * un día que contar — no es 100 %.
     */
    fun puntualidadPct(t: KpiTotalesDto?): Double? {
        if (graduada(t)) return t?.disciplina?.pct
        val dias = t?.diasConJornada ?: return null
        if (dias <= 0) return null
        val retardos = (t.retardos ?: 0).coerceIn(0, dias)
        return (dias - retardos) * 100.0 / dias
    }

    /** Graduada: con los cortes del índice. Binaria: por retardos, como el semáforo del API. */
    fun tonoPuntualidad(t: KpiTotalesDto?): Semaforo =
        if (graduada(t)) tonoCumplimiento(t?.disciplina?.pct) else tonoRetardos(t)

    /** Graduada: el pie de Disciplina. Binaria: «3 retardos · 48 m tarde» · «Sin retardos en 5 días». */
    fun puntualidadPie(t: KpiTotalesDto?): String =
        if (graduada(t)) disciplinaPie(t) else puntualidadPieBinaria(t)

    /**
     * Pie corto de la Disciplina para la tarjeta: «2 retardos · registro 4/5»,
     * «3 retardos = 1 falta», «Sin retardos». Sin el dato graduado, el de la
     * puntualidad binaria.
     */
    fun disciplinaPie(t: KpiTotalesDto?): String {
        val d = t?.disciplina
        if (d == null || (d.esperados ?: 0) <= 0) return puntualidadPieBinaria(t)
        val retardos = d.retardos ?: 0
        val faltas = d.faltasPorRetardos ?: 0
        val revisables = d.jornadasRevisables ?: 0
        val completo = d.registroCompleto ?: 0
        return buildList {
            add(
                if (retardos <= 0) {
                    "Sin retardos"
                } else {
                    plural(retardos, "retardo", "retardos") + if (faltas > 0) " = ${plural(faltas, "falta", "faltas")}" else ""
                },
            )
            if (revisables > 0 && completo < revisables) add("registro $completo/$revisables")
        }.joinToString(" · ")
    }

    private fun puntualidadPieBinaria(t: KpiTotalesDto?): String {
        val dias = t?.diasConJornada ?: 0
        if (dias <= 0) return "Sin días con jornada"
        val retardos = t?.retardos ?: 0
        if (retardos <= 0) return "Sin retardos en $dias ${if (dias == 1) "día" else "días"}"
        val tarde = t?.minutosTarde
        val etiqueta = if (retardos == 1) "1 retardo" else "$retardos retardos"
        return if (tarde != null && tarde > 0) "$etiqueta · ${horas(tarde)} tarde" else etiqueta
    }

    /**
     * Puntualidad graduada y registro completo, en una línea (web `disciplinaTexto`):
     * «4.6 de 5 días en puntos · 3 retardos = 1 falta (no se descuenta sola) · registro
     * completo 4 de 5». `null` sin días que medir.
     */
    fun disciplinaTexto(t: KpiTotalesDto?): String? {
        val d = t?.disciplina ?: return null
        val esperados = d.esperados ?: 0
        if (esperados <= 0) return null
        val partes = mutableListOf("${numero(d.puntos ?: 0.0)} de $esperados días en puntos")
        val faltas = d.faltasPorRetardos ?: 0
        if (faltas > 0) {
            partes += "${d.retardos ?: 0} retardos = $faltas ${if (faltas == 1) "falta" else "faltas"} (no se descuenta sola)"
        }
        val revisables = d.jornadasRevisables ?: 0
        if (revisables > 0) partes += "registro completo ${d.registroCompleto ?: 0} de $revisables"
        return partes.joinToString(" · ")
    }

    /** «6 h 10 m de 7 h 45 m» — productivo contra laborado. */
    fun productividadPie(t: KpiTotalesDto?): String {
        val productivos = t?.minutosProductivos
        val laborados = t?.minutosLaborados
        if (productivos == null && laborados == null) return "Sin horas registradas"
        return "${horas(productivos)} de ${horas(laborados)}"
    }

    private fun plural(n: Int, uno: String, varios: String) = "$n ${if (n == 1) uno else varios}"

    // ── Confianza (web `confianzaDe`) ───────────────────────────────────────

    enum class Confianza(val etiqueta: String) {
        ALTA("confianza alta"),
        MEDIA("confianza media"),
        BAJA("confianza baja"),
    }

    /** §7.2: con 20 entregas medidas o más es alta; de 10 a 19, media; con menos, baja (índice provisional). */
    const val ENTREGAS_CONFIANZA_ALTA = 20
    const val ENTREGAS_CONFIANZA_MEDIA = 10

    /** `"alta"` · `"media"` · `"baja"`, o un objeto con `nivel` / `valor` / `clave` / `confianza`. */
    fun confianzaDelApi(valor: Any?): Confianza? =
        when (textoDe(valor, "nivel", "valor", "clave", "confianza")?.lowercase()) {
            "alta" -> Confianza.ALTA
            "media" -> Confianza.MEDIA
            "baja" -> Confianza.BAJA
            else -> null
        }

    /** La del API si la manda (en la fila o en los totales); si no, la de la web por entregas medidas. */
    fun confianza(t: KpiTotalesDto?, delApi: Any? = null): Confianza =
        confianzaDelApi(delApi) ?: confianzaDelApi(t?.confianza) ?: run {
            val n = t?.entregas?.medidas ?: 0
            when {
                n >= ENTREGAS_CONFIANZA_ALTA -> Confianza.ALTA
                n >= ENTREGAS_CONFIANZA_MEDIA -> Confianza.MEDIA
                else -> Confianza.BAJA
            }
        }

    fun confianza(fila: KpiPersonaFilaDto): Confianza = confianza(fila.totales, fila.confianza)

    /**
     * Pie del índice: «Confianza alta» · «Confianza media» · «Provisional · 7 entregas»
     * (con menos de 10 entregas el índice es provisional y no se publica) · «Sin datos
     * que medir».
     */
    fun indicePie(t: KpiTotalesDto?, confianza: Confianza = confianza(t)): String {
        val pct = t?.cumplimientoPct?.takeIf { it.isFinite() }
        if (t == null || pct == null) return "Sin datos que medir"
        return when (confianza) {
            Confianza.BAJA -> {
                val n = t.entregas?.medidas ?: 0
                if (n > 0) "Provisional · ${plural(n, "entrega", "entregas")}" else "Provisional · sin entregas"
            }
            Confianza.MEDIA -> "Confianza media"
            Confianza.ALTA -> "Confianza alta"
        }
    }

    // ── Pilares del índice v2 (web `pilaresDe`) ────────────────────────────

    /** Un pilar: su promedio ponderado (0–100) y las partes que lo forman. */
    data class Pilar(
        val id: String,
        val etiqueta: String,
        val ayuda: String,
        /** `null` = sin dato en el rango: no pesa. */
        val pct: Int?,
        val partes: List<KpiParteCumplimientoDto>,
        val tono: Semaforo,
    )

    private data class DefPilar(val id: String, val etiqueta: String, val claves: Set<String>, val ayuda: String)

    /** 30 Confiabilidad + 25 Calidad + 30 Rendimiento + 15 Disciplina (los pesos vienen en cada parte). */
    private val PILARES = listOf(
        DefPilar("confiabilidad", "Confiabilidad", setOf("entregas"), "Entrega antes de su límite (en coordinación, su equipo y revisar a tiempo)"),
        DefPilar("calidad", "Calidad", setOf("forma"), "Aprobadas a la primera y su calificación calibrada"),
        DefPilar("rendimiento", "Rendimiento", setOf("estandar"), "Horas estándar ganadas contra sus horas en jornada"),
        DefPilar("disciplina", "Disciplina", setOf("asistencia", "uniforme"), "Puntualidad graduada, registro completo y uniforme"),
    )

    private fun KpiParteCumplimientoDto.pesoPositivo(): Double? = peso?.takeIf { it.isFinite() && it > 0 }

    /**
     * Los cuatro pilares, siempre en el mismo orden. Si el API manda `pilares[]`
     * (f2dc7130), cada uno sale de ahí tal cual (etiqueta, pct y semáforo). Si no lo manda
     * (o le falta alguno), se agrupa aquí como la web: el promedio ponderado (por su peso)
     * de las partes con peso > 0 que le tocan, `null` si no tiene dato, con el tono que
     * mande el API en sus partes (el peor) o, si no, los cortes del índice. En los dos casos
     * el pilar lleva sus partes, para pintarlas debajo. Las de peso 0 son diagnóstico
     * ([diagnostico]) y no entran.
     */
    fun pilares(t: KpiTotalesDto?): List<Pilar> {
        val lista = t?.cumplimientoPartes.orEmpty()
        val delApi = t?.pilares.orEmpty()
        return PILARES.map { def ->
            val suyas = lista.filter { p -> p.clave?.trim() in def.claves && p.pesoPositivo() != null }
            val api = delApi.firstOrNull { it.id?.trim()?.lowercase() == def.id }
            if (api != null) {
                val pct = api.pct?.takeIf { it.isFinite() }?.roundToInt()
                return@map Pilar(
                    id = def.id,
                    etiqueta = api.label?.trim()?.ifEmpty { null } ?: def.etiqueta,
                    ayuda = def.ayuda,
                    pct = pct,
                    partes = suyas,
                    tono = semaforoDelApi(api.semaforo) ?: tonoCumplimiento(pct?.toDouble()),
                )
            }
            val medibles = suyas.filter { it.pct?.isFinite() == true }
            val pesoTotal = medibles.sumOf { it.pesoPositivo() ?: 0.0 }
            val pct = if (pesoTotal > 0) {
                (medibles.sumOf { (it.pct ?: 0.0) * (it.pesoPositivo() ?: 0.0) } / pesoTotal).roundToInt()
            } else {
                null
            }
            val deSusPartes = suyas.mapNotNull { semaforoDelApi(it.semaforo) }
            val tono = deSusPartes.minByOrNull { peso(it) } ?: tonoCumplimiento(pct?.toDouble())
            Pilar(def.id, def.etiqueta, def.ayuda, pct, suyas, tono)
        }
    }

    /** «De qué sale el 86» · «De qué sale el índice» sin número. */
    fun tituloPilares(t: KpiTotalesDto?): String {
        val n = indice(t?.cumplimientoPct)
        return if (n == "—") "De qué sale el índice" else "De qué sale el $n"
    }

    /**
     * Las partes de un pilar, una por renglón, como la web: «Entregas a tiempo: 17 de 18
     * · pesa 30». Sin partes: «Sin dato en estas fechas: no pesa.»
     */
    fun partesDelPilar(p: Pilar): String {
        if (p.partes.isEmpty()) return "Sin dato en estas fechas: no pesa."
        return p.partes.joinToString("\n") { x ->
            val etiqueta = x.etiqueta?.trim()?.ifEmpty { null } ?: nombreDeClave(x.clave.orEmpty())
            val detalle = x.detalle?.trim()?.ifEmpty { null }
            val peso = x.pesoPositivo()?.let { " · pesa ${numero(it)}" }.orEmpty()
            if (detalle != null) "$etiqueta: $detalle$peso" else "$etiqueta$peso"
        }
    }

    /**
     * El diagnóstico (partes de peso 0) que vale la pena leer: lo que va por debajo de su
     * referencia (web `diagnosticoDe`). No pesa en el índice ni lo multiplica: solo se lee.
     */
    fun diagnostico(t: KpiTotalesDto?): List<Linea> =
        t?.cumplimientoPartes.orEmpty()
            .filter { p -> p.peso?.let { it == 0.0 } == true && (p.pct ?: 0.0) < 100.0 }
            .mapNotNull { p ->
                val etiqueta = p.etiqueta?.trim()?.ifEmpty { null }
                    ?: p.clave?.trim()?.ifEmpty { null }?.let(::nombreDeClave)
                    ?: return@mapNotNull null
                val detalle = p.detalle?.trim()?.removeSuffix("· diagnóstico")?.trim()?.ifEmpty { null }
                Linea(etiqueta, detalle ?: pct(p.pct))
            }

    // ── La lectura de la persona (web `Lectura`) ────────────────────────────

    /** Horas estándar ganadas (pilar Rendimiento): lo que vale lo entregado contra sus horas en jornada. */
    data class EstandarGanado(val valor: String, val detalle: String)

    /**
     * «12 h 30 m · 58 % de su jornada» y «9 entregas con estándar · eficiencia 87 %».
     * `null` si en el rango no entregó nada con tiempo estándar.
     */
    fun estandarGanado(t: KpiTotalesDto?): EstandarGanado? {
        val e = t?.entregas ?: return null
        val n = e.conEstandar ?: 0
        val ganados = e.minutosEstandarGanados ?: 0
        if (n <= 0 || ganados <= 0) return null
        val laborados = t.minutosLaborados ?: 0
        val rendimiento = if (laborados > 0) (ganados * 100.0 / laborados).roundToInt() else null
        val partes = mutableListOf(plural(n, "entrega", "entregas") + " con estándar")
        e.pctEficienciaEstandar?.takeIf { it.isFinite() }?.let { partes += "eficiencia ${it.roundToInt()} %" }
        return EstandarGanado(
            valor = if (rendimiento != null) "${horas(ganados)} · $rendimiento % de su jornada" else horas(ganados),
            detalle = partes.joinToString(" · "),
        )
    }

    /** «Entregó 31 de 33 a tiempo. Tuvo una actividad corriendo 128 h de 212 h en jornada.» */
    fun resumen(t: KpiTotalesDto?): String {
        val frases = mutableListOf<String>()
        val e = t?.entregas
        val medidas = e?.medidas ?: 0
        if (e != null && medidas > 0) {
            val sin = e.sinEntregar ?: 0
            val resto = if (sin > 0) " y $sin ${if (sin == 1) "quedó" else "quedaron"} sin entregar" else ""
            frases += "Entregó ${e.aTiempo ?: 0} de $medidas a tiempo$resto."
        } else {
            frases += "No tuvo entregas que medir en estas fechas."
        }
        val laborados = t?.minutosLaborados ?: 0
        if (laborados > 0) {
            frases += "Tuvo una actividad corriendo ${horas(t?.minutosProductivos ?: 0)} de ${horas(laborados)} en jornada."
        }
        return frases.joinToString(" ")
    }

    /**
     * Los datos de la lectura, en el orden de la web: «Su equipo» (solo coordinadores),
     * horas estándar ganadas, aprobadas a la primera, calificación calibrada, retardos,
     * puntualidad y registro, y uniforme.
     */
    fun lectura(t: KpiTotalesDto?): List<Linea> {
        if (t == null) return emptyList()
        val e = t.entregas
        val out = mutableListOf<Linea>()
        t.equipo?.let { q ->
            val total = q.revisiones?.total ?: 0
            val revisiones = if (total > 0) " · revisó ${q.revisiones?.enPlazo ?: 0} de $total en 24 h hábiles" else ""
            out += Linea(
                "Su equipo",
                "${plural(q.personas ?: 0, "persona", "personas")} · ${q.aTiempo ?: 0} de ${q.medidas ?: 0} a tiempo$revisiones",
            )
        }
        val estandar = estandarGanado(t)
        out += Linea(
            "Horas estándar ganadas",
            estandar?.let { "${it.valor} (${it.detalle})" } ?: "Sin entregas con tiempo estándar",
        )
        val revisadas = e?.revisadas ?: 0
        out += Linea("Aprobadas a la primera", if (revisadas > 0) "${e?.aprobadasALaPrimera ?: 0} de $revisadas" else "Sin revisar")
        val cal = t.calificacion
        val calN = cal?.n ?: 0
        val calPct = cal?.pct?.takeIf { it.isFinite() }
        out += Linea("Calificación calibrada", if (calN > 0 && calPct != null) "${calPct.roundToInt()} de 100 ($calN)" else "Sin calificar")
        val retardos = t.retardos ?: 0
        out += Linea("Retardos", if (retardos > 0) "$retardos · ${horas(t.minutosTarde ?: 0)}" else "Ninguno")
        val a = t.asistenciaPuntual
        val esperados = a?.esperados ?: 0
        out += Linea(
            "Puntualidad y registro",
            disciplinaTexto(t) ?: if (esperados > 0) "${a?.puntuales ?: 0} de $esperados días" else "—",
        )
        val revisadasUniforme = t.uniforme?.revisadas ?: 0
        out += Linea("Uniforme", if (revisadasUniforme > 0) "${t.uniforme?.ok ?: 0} de $revisadasUniforme" else "Sin revisar")
        return out
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
        return Dato("Entregas", "$aTiempo/$medidas", pie, tonoCumplimiento(pctATiempo(e)))
    }

    /** % de entregas a tiempo; si el API no lo trae, se saca de los conteos. `null` sin medidas. */
    fun pctATiempo(e: KpiEntregasDto?): Double? {
        val medidas = e?.medidas ?: 0
        if (e == null || medidas <= 0) return null
        return e.pctATiempo?.takeIf { it.isFinite() } ?: ((e.aTiempo ?: 0) * 100.0 / medidas)
    }

    /**
     * Disciplina de la tarjeta: el pilar (puntualidad graduada × registro, con el
     * uniforme cuando pesa), como la columna de la web. Sin partes, el `disciplina.pct`.
     */
    fun disciplinaDato(t: KpiTotalesDto?): Dato {
        val pilar = pilares(t).first { it.id == "disciplina" }
        val valor = pilar.pct?.toDouble() ?: t?.disciplina?.takeIf { (it.esperados ?: 0) > 0 }?.pct?.takeIf { it.isFinite() }
        val tono = if (pilar.pct != null) pilar.tono else tonoCumplimiento(valor)
        return Dato("Disciplina", indice(valor), disciplinaPie(t), tono)
    }

    /** Un renglón de lo desplegado: etiqueta a la izquierda, lo que dice a la derecha. */
    data class Linea(val etiqueta: String, val valor: String)

    /** «40» · «12.5» · «4.6»: el número como viene, sin decimales de más. */
    private fun numero(valor: Double): String {
        val decimas = (valor * 10).roundToLong()
        return if (decimas % 10 == 0L) "${decimas / 10}" else "${decimas / 10}.${abs(decimas % 10)}"
    }

    /** `tiempo_adecuado` → «Tiempo adecuado», para una parte que llegue sin etiqueta. */
    private fun nombreDeClave(clave: String): String =
        clave.replace('_', ' ').replace('-', ' ').trim().replaceFirstChar { it.titlecase(ES_MX) }

    /**
     * Lo que sale al desplegar la tarjeta, antes de los pilares: con índice, la lectura
     * de la web ([lectura]), el tiempo en actividades y las horas. Con la API vieja,
     * nada: esos números siguen en la tarjeta.
     */
    fun lineasDesplegadas(t: KpiTotalesDto?): List<Linea> {
        if (!conCumplimiento(t)) return emptyList()
        return lectura(t) + listOf(
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

    fun datosPersona(fila: KpiPersonaFilaDto): List<Dato> = datosPersona(fila.totales, fila.confianza)

    /**
     * Los tres números que caben en una tarjeta de persona sin apretarla: índice
     * (con su confianza; provisional con menos de 10 entregas), entregas y
     * disciplina. Con la API vieja, los de antes: puntualidad, productividad y horas.
     */
    fun datosPersona(t: KpiTotalesDto?, confianzaDelApi: Any? = null): List<Dato> {
        if (!conCumplimiento(t)) {
            return listOf(
                Dato("Puntualidad", pct(puntualidadPct(t)), puntualidadPie(t), tonoPuntualidad(t)),
                Dato("Productividad", pct(t?.productividadPct), productividadPie(t), tonoProductividad(t?.productividadPct)),
                Dato("Horas", horas(t?.minutosLaborados), jornadasPie(t), Semaforo.SIN_DATOS),
            )
        }
        val confianza = confianza(t, confianzaDelApi)
        return listOf(
            Dato("Índice", indice(t?.cumplimientoPct), indicePie(t, confianza), tonoIndice(t)),
            entregasDato(t),
            disciplinaDato(t),
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
     * La tira de arriba: cómo va el equipo entero en el periodo. Con índice, la banda
     * de la web: índice del equipo (cuántos con confianza alta), entregas a tiempo,
     * tiempo en actividades (sin semáforo: mide reloj corriendo) y extra por decidir.
     * Con la API vieja, la tira de siempre.
     */
    fun datosEquipo(datos: KpisEquipoDto?): List<Dato> {
        val t = datos?.equipo?.totales ?: return emptyList()
        if (!conCumplimiento(t)) {
            val uniforme = t.uniforme
            return listOf(
                Dato("Puntualidad", pct(puntualidadPct(t)), puntualidadPie(t), tonoPuntualidad(t)),
                Dato("Productividad", pct(t.productividadPct), productividadPie(t), tonoProductividad(t.productividadPct)),
                Dato("Uniforme", pct(uniforme?.pct), uniformePie(t), tonoUniforme(uniforme?.pct)),
                Dato("Tiempo extra", horas(t.minutosExtra), extraPie(t), extraTono(t)),
            )
        }
        val e = t.entregas
        val medidas = e?.medidas ?: 0
        return listOf(
            Dato("Índice del equipo", indice(t.cumplimientoPct), indiceEquipoPie(datos.personas.orEmpty()), tonoIndice(t)),
            Dato(
                "Entregas a tiempo",
                if (e != null && medidas > 0) "${e.aTiempo ?: 0} de $medidas" else "—",
                entregasEquipoPie(e),
                tonoCumplimiento(pctATiempo(e)),
            ),
            Dato(
                "Tiempo en actividades",
                horas(t.minutosProductivos),
                "de ${horas(t.minutosLaborados)} en jornada · ${pct(t.productividadPct)}",
                Semaforo.SIN_DATOS,
            ),
            Dato("Extra por decidir", "${t.diasExtraPendientes ?: 0}", extraPorDecidirPie(t), extraPorDecidirTono(t)),
        )
    }

    /** «8 personas · 5 con confianza alta». */
    fun indiceEquipoPie(personas: List<KpiPersonaFilaDto>): String {
        val altas = personas.count { confianza(it) == Confianza.ALTA }
        return "${plural(personas.size, "persona", "personas")} · $altas con confianza alta"
    }

    /** «94 % · 1 sin entregar» · «Sin entregas que medir». */
    fun entregasEquipoPie(e: KpiEntregasDto?): String {
        val medidas = e?.medidas ?: 0
        if (e == null || medidas <= 0) return "Sin entregas que medir"
        return "${pct(pctATiempo(e))} · ${e.sinEntregar ?: 0} sin entregar"
    }

    /** «3 h 20 m sin aprobar» · «Todo decidido». */
    fun extraPorDecidirPie(t: KpiTotalesDto?): String =
        if ((t?.diasExtraPendientes ?: 0) > 0) "${horas(t?.minutosExtraPendientes ?: 0)} sin aprobar" else "Todo decidido"

    fun extraPorDecidirTono(t: KpiTotalesDto?): Semaforo =
        if ((t?.diasExtraPendientes ?: 0) > 0) Semaforo.AMARILLO else Semaforo.VERDE

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

    /** La nota de la web bajo la lectura: el índice ayuda, no decide. */
    const val NOTA_INDICE =
        "El número lo calcula el sistema con reglas fijas. Es una ayuda para el jefe: ninguna decisión de pago o sanción sale sola de aquí."

    /**
     * Lo que esta pantalla NO hace y la web sí, dicho sin rodeos. Nada de
     * «disponible pronto»: el Excel y la aprobación de horas extra se firman en
     * la computadora y punto.
     */
    const val LIMITE =
        "Consulta del periodo. Aprobar tiempo extra y descargar el Excel se hacen desde la computadora."
}
