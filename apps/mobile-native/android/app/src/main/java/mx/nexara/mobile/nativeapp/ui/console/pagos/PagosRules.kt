package mx.nexara.mobile.nativeapp.ui.console.pagos

import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Instant
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import mx.nexara.mobile.nativeapp.data.api.PagoEmpleadoDto
import mx.nexara.mobile.nativeapp.ui.console.viaticos.Dinero
import mx.nexara.mobile.nativeapp.ui.enterprise.NxMetric

/**
 * Pagos a empleados en el teléfono: qué se enseña de cada pago, en qué orden y
 * qué cifras van arriba.
 *
 * **Esto es nómina.** La regla que manda sobre todas las demás: un importe que
 * no se puede interpretar con certeza se enseña como `"—"`, nunca como cero. Un
 * cero inventado en esta pantalla es un empleado convencido de que no le
 * pagaron, y eso acaba en una queja o en una demanda laboral. Por el mismo
 * motivo, un `status` que no se reconozca **no se da por pagado**: el servidor
 * normaliza cualquier cosa rara a `Pagado` al escribir (`normalizeStatus`),
 * pero al leer eso sería afirmar que el dinero salió sin saberlo.
 *
 * La web (`app/(panels)/erp/finance/employee-payments/page.tsx`) es una tabla
 * con alta, edición, anulación y comprobantes. Aquí no se paga nada: se
 * consulta. Cada pago es una fila densa que contesta lo que se pregunta con el
 * teléfono en la mano — **a quién, cuánto, de qué periodo y si ya salió**.
 *
 * Sin Android ni Compose: se prueba entera en la JVM (`PagosRulesTest`).
 */
object PagosRules {

    /** La zona en la que trabaja la gente; con ella se decide qué día fue un instante. */
    val ZONA: ZoneId = ZoneId.of("America/Mexico_City")

    // ── Estado ───────────────────────────────────────────────────────────────

    /**
     * Los tres estados del servidor (`STATUS` de `employee-payments.service.ts`),
     * más uno que el servidor no tiene y esta pantalla sí necesita.
     *
     * [DESCONOCIDO] existe porque leer no es escribir. `normalizeStatus` del
     * servicio manda a `Pagado` todo lo que no reconoce, lo cual está bien para
     * guardar un alta; al mostrar, decir «Pagado» de una fila cuyo estado no se
     * entiende es afirmar que el dinero ya salió. Se dice que no se sabe.
     */
    enum class Estado(val clave: String, val etiqueta: String) {
        BORRADOR("Borrador", "Borrador"),
        PAGADO("Pagado", "Pagado"),
        ANULADO("Anulado", "Anulado"),
        DESCONOCIDO("", "Estado desconocido"),
    }

    /**
     * Estado a partir de lo que mande el servidor.
     *
     * Se aceptan los mismos sinónimos que `normalizeStatus` (`draft`,
     * `pendiente`, `cancelado`, `void`) y el inglés de la base, porque una fila
     * vieja o una migración pueden traerlos. Lo que NO se hace es el `else` del
     * servidor: aquí lo desconocido se queda en [Estado.DESCONOCIDO].
     */
    fun estado(valor: String?): Estado {
        val clave = valor?.trim()?.lowercase(ESPANOL).orEmpty()
        return when (clave) {
            "borrador", "draft", "pendiente" -> Estado.BORRADOR
            "pagado", "paid" -> Estado.PAGADO
            "anulado", "cancelado", "void", "canceled", "cancelled" -> Estado.ANULADO
            else -> Estado.DESCONOCIDO
        }
    }

    fun estadoDe(row: PagoEmpleadoDto): Estado = estado(row.status)

    /**
     * El color del estado, como ARGB, para no arrastrar Compose a las pruebas
     * (mismo criterio que `AttendanceUx` y `CoreActivityRules`).
     *
     * Regla 3 del contrato de diseño: gris para el flujo normal, color **solo**
     * cuando el renglón pide acción o algo salió mal. Un borrador pide que
     * alguien lo autorice, y un estado ilegible pide que alguien lo mire.
     */
    fun colorDe(estado: Estado): Long? = when (estado) {
        Estado.PAGADO -> VERDE
        Estado.BORRADOR -> AMBAR
        Estado.ANULADO -> GRIS
        Estado.DESCONOCIDO -> AMBAR
    }

    // ── Dinero ───────────────────────────────────────────────────────────────

    /**
     * Importe del API → centavos. `null` si no es un número.
     *
     * `amount` es un `Decimal(12,2)` de Prisma: viaja como texto
     * (`Decimal.toJSON()`), pero se acepta también el número JSON por si alguna
     * ruta lo convierte, porque Moshi lo entrega como texto igual. Se redondea a
     * centavo con `HALF_UP`, la misma regla que el `Math.round(n * 100)` del
     * servidor, para que los dos lados digan la misma cifra.
     *
     * Gemela de `CotizacionesRules.centavos`. Está repetida y no compartida a
     * propósito: el día que alguien las junte, su casa es `Dinero` —el
     * formateador único de pesos de la app— y no las reglas de otro módulo. Las
     * pruebas de las dos fijan el mismo comportamiento, así que una divergencia
     * se cae en verde/rojo y no en la nómina de alguien.
     */
    fun centavos(valor: String?): Long? {
        val texto = valor?.trim()?.takeIf { it.isNotEmpty() && it != "null" } ?: return null
        val decimal = runCatching { BigDecimal(texto) }.getOrNull()
            ?: texto.toDoubleOrNull()?.let { BigDecimal.valueOf(it) }
            ?: return null
        return runCatching {
            decimal.movePointRight(2).setScale(0, RoundingMode.HALF_UP).longValueExact()
        }.getOrNull()
    }

    fun centavosDe(row: PagoEmpleadoDto): Long? = centavos(row.amount)

    /**
     * El importe listo para leer: `"$12,345.67"`, o [SIN_DATO] si no hay cifra.
     *
     * Usa [Dinero], el mismo formateador de pesos que Viáticos y Cotizaciones:
     * dos maneras de escribir un peso en la misma app son dos maneras de dudar
     * de la cifra.
     */
    fun pesos(valor: String?): String = centavos(valor)?.let { Dinero.pesos(it) } ?: SIN_DATO

    fun montoTexto(row: PagoEmpleadoDto): String = pesos(row.amount)

    /** ¿Este pago trae un importe que se pueda leer? */
    fun tieneImporteLegible(row: PagoEmpleadoDto): Boolean = centavosDe(row) != null

    // ── Fechas ───────────────────────────────────────────────────────────────

    /**
     * Un **día** del API (`periodFrom`, `periodTo`) como `LocalDate`.
     *
     * Se cortan los diez primeros caracteres a propósito. Los dos son
     * `@db.Date` en Prisma y se guardan a medianoche UTC, así que
     * `"2026-09-15T00:00:00.000Z"` en la zona de México son las 18:00 del **14**:
     * convertir de zona correría el periodo un día hacia atrás por los dos
     * extremos, y un periodo de pago corrido un día es exactamente el error que
     * la gente nota en su recibo.
     */
    fun dia(iso: String?): LocalDate? {
        val texto = iso?.trim()?.takeIf { it.length >= 10 } ?: return null
        return runCatching {
            LocalDate.parse(texto.substring(0, 10), DateTimeFormatter.ISO_LOCAL_DATE)
        }.getOrNull()
    }

    /**
     * Un **instante** del API (`paidAt`, `createdAt`) como el día que fue en México.
     *
     * Aquí sí hay que pasar por la zona, y es el caso contrario al de [dia]: un
     * pago marcado a las 19:00 de un martes se guarda como `01:00Z` del
     * miércoles, y quedarse con el texto diría que se pagó al día siguiente.
     */
    fun diaDeInstante(iso: String?, zona: ZoneId = ZONA): LocalDate? {
        val texto = iso?.trim()?.takeIf { it.isNotEmpty() && it != "null" } ?: return null
        val instante = runCatching { Instant.parse(texto) }.getOrNull()
            ?: runCatching { OffsetDateTime.parse(texto).toInstant() }.getOrNull()
            ?: return null
        return instante.atZone(zona).toLocalDate()
    }

    /**
     * El periodo que cubre el pago, en una línea: `"1 – 15 sep 2026"`.
     *
     * Se repite lo menos posible sin perder el año: dentro del mismo mes solo se
     * escribe una vez el mes, y dentro del mismo año solo una vez el año. Si
     * falta cualquiera de las dos fechas devuelve `null`: media línea de periodo
     * se lee como el periodo entero y sería mentira.
     */
    fun periodoTexto(row: PagoEmpleadoDto): String? {
        val desde = dia(row.periodFrom) ?: return null
        val hasta = dia(row.periodTo) ?: return null
        return when {
            desde == hasta -> desde.format(FORMATO_LARGO)
            desde.year == hasta.year && desde.month == hasta.month ->
                "${desde.dayOfMonth} – ${hasta.format(FORMATO_LARGO)}"
            desde.year == hasta.year ->
                "${desde.format(FORMATO_CORTO)} – ${hasta.format(FORMATO_LARGO)}"
            else -> "${desde.format(FORMATO_LARGO)} – ${hasta.format(FORMATO_LARGO)}"
        }
    }

    /** Días que cubre el periodo, contando los dos extremos. `null` si falta una fecha. */
    fun diasDelPeriodo(row: PagoEmpleadoDto): Long? {
        val desde = dia(row.periodFrom) ?: return null
        val hasta = dia(row.periodTo) ?: return null
        if (hasta < desde) return null
        return java.time.temporal.ChronoUnit.DAYS.between(desde, hasta) + 1
    }

    /**
     * Cuándo salió el dinero: `"Pagado el 20 sep 2026"`.
     *
     * Solo para los que ya están pagados y traen el instante. Un `Pagado` sin
     * `paidAt` devuelve `null` en vez de inventarle la fecha de captura: son
     * cosas distintas y en una aclaración de nómina se pregunta justo por ésta.
     */
    fun pagadoElTexto(row: PagoEmpleadoDto, zona: ZoneId = ZONA): String? {
        if (estadoDe(row) != Estado.PAGADO) return null
        val dia = diaDeInstante(row.paidAt, zona) ?: return null
        return "Pagado el ${dia.format(FORMATO_LARGO)}"
    }

    // ── Textos de la fila ────────────────────────────────────────────────────

    /**
     * De quién es el pago.
     *
     * Si el servidor no mandó el usuario se usa el id, igual que hace
     * `analytics` (`Usuario #12`): es feo, pero es cierto, y permite buscarlo en
     * la web. Decir «Sin empleado» de un pago que sí tiene uno sería peor.
     */
    fun empleadoTexto(row: PagoEmpleadoDto): String {
        row.user?.nombre?.trim()?.ifEmpty { null }?.let { return it }
        val id = row.userId ?: return "Empleado sin identificar"
        return "Usuario #$id"
    }

    /**
     * Qué se le pagó. El mismo orden que el servidor usa en `analytics`:
     * concepto, si no la nota, y si no una frase honesta.
     */
    fun conceptoTexto(row: PagoEmpleadoDto): String =
        row.concepto?.trim()?.ifEmpty { null }
            ?: row.note?.trim()?.ifEmpty { null }
            ?: "Pago sin concepto"

    /**
     * Las horas que respaldan el pago: `"12 h 30 min"`.
     *
     * `totalMinutes` vale `0` por omisión en la base, y un pago que no se
     * calculó por horas (un bono, un anticipo) lo deja así. Un `0` en pantalla
     * se leería como «trabajó cero horas», así que en ese caso no se dice nada.
     */
    fun horasTexto(row: PagoEmpleadoDto): String? {
        val minutos = row.totalMinutes ?: return null
        if (minutos <= 0) return null
        val horas = minutos / 60
        val resto = minutos % 60
        return when {
            horas == 0 -> "$resto min"
            resto == 0 -> "$horas h"
            else -> "$horas h $resto min"
        }
    }

    /** Cuántos comprobantes trae; `null` si ninguno, para no escribir «0 comprobantes». */
    fun comprobantesTexto(row: PagoEmpleadoDto): String? {
        val total = row.evidenceUrls?.count { !it.isBlank() } ?: 0
        return when {
            total <= 0 -> null
            total == 1 -> "1 comprobante"
            else -> "$total comprobantes"
        }
    }

    /**
     * La línea secundaria de la fila: periodo, horas y comprobantes.
     *
     * Regla 2 del contrato: el contexto va en gris bajo el concepto, no en
     * columnas extra que ensanchan la tabla y obligan a hacer scroll lateral.
     */
    fun contextoTexto(row: PagoEmpleadoDto): String? =
        listOfNotNull(periodoTexto(row), horasTexto(row), comprobantesTexto(row))
            .joinToString(" · ")
            .ifEmpty { null }

    // ── Filtros, búsqueda y orden ────────────────────────────────────────────

    /**
     * Los filtros de arriba, por lo que se hace con cada grupo:
     *
     * - **Pagados**: el dinero que ya salió. Es la primera pregunta.
     * - **Borradores**: lo capturado que todavía espera autorización.
     * - **Anulados**: los que no cuentan, guardados para la auditoría.
     *
     * Los de estado ilegible caen en [Filtro.TODOS] y en ningún otro, que es
     * justo lo que hace que se noten.
     */
    enum class Filtro(val etiqueta: String) {
        TODOS("Todos"),
        PAGADOS("Pagados"),
        BORRADORES("Borradores"),
        ANULADOS("Anulados"),
    }

    fun cumple(row: PagoEmpleadoDto, filtro: Filtro): Boolean = when (filtro) {
        Filtro.TODOS -> true
        Filtro.PAGADOS -> estadoDe(row) == Estado.PAGADO
        Filtro.BORRADORES -> estadoDe(row) == Estado.BORRADOR
        Filtro.ANULADOS -> estadoDe(row) == Estado.ANULADO
    }

    fun colorDeFiltro(filtro: Filtro): Long? = when (filtro) {
        Filtro.TODOS -> null
        Filtro.PAGADOS -> VERDE
        Filtro.BORRADORES -> AMBAR
        Filtro.ANULADOS -> GRIS
    }

    /**
     * Lo que mira la búsqueda: lo mismo que la web (empleado, concepto y nota),
     * más el folio de la póliza. En una aclaración, el folio `PAG-…` es lo único
     * que trae impreso quien viene a preguntar.
     */
    private fun camposBuscables(row: PagoEmpleadoDto): List<String> = listOfNotNull(
        row.user?.nombre,
        row.concepto,
        row.note,
        row.contabilidadRef,
    )

    fun coincide(row: PagoEmpleadoDto, consulta: String): Boolean {
        val q = consulta.trim().lowercase(ESPANOL)
        if (q.isEmpty()) return true
        return camposBuscables(row).any { it.lowercase(ESPANOL).contains(q) }
    }

    /**
     * El orden del servidor: el más reciente primero
     * (`orderBy: { createdAt: 'desc' }`), y aquí se hace explícito.
     *
     * `createdAt` es ISO y se compara como texto, que para ese formato ordena
     * igual que como fecha. Los que no traigan fecha caen al final por `id`
     * descendente, que es el mismo criterio con otro nombre.
     */
    fun ordenar(pagos: List<PagoEmpleadoDto>): List<PagoEmpleadoDto> =
        pagos.sortedWith(
            compareByDescending<PagoEmpleadoDto> { it.createdAt.orEmpty() }
                .thenByDescending { it.id ?: 0L },
        )

    /** Filtro + búsqueda, ya ordenado: lo que se pinta. */
    fun aplicar(pagos: List<PagoEmpleadoDto>, filtro: Filtro, consulta: String): List<PagoEmpleadoDto> =
        ordenar(pagos.filter { cumple(it, filtro) && coincide(it, consulta) })

    /** Cuántos hay en cada filtro, para el número de la pastilla. */
    fun conteos(pagos: List<PagoEmpleadoDto>): Map<Filtro, Int> =
        Filtro.entries.associateWith { filtro -> pagos.count { cumple(it, filtro) } }

    // ── La tira de cifras (reglas 1 y 7) ─────────────────────────────────────

    /**
     * Lo que suman los pagos, contando **solo los importes legibles**.
     *
     * [sinImporte] no es un detalle: es la diferencia entre una cifra corta y
     * una mentira. Si hay filas cuyo importe no se pudo interpretar, la suma de
     * arriba se queda corta y la pantalla tiene que decirlo en voz alta en vez
     * de disimularlo con ceros.
     */
    data class Cifras(
        val pagadoCentavos: Long,
        val pagados: Int,
        val borradorCentavos: Long,
        val borradores: Int,
        val empleados: Int,
        val anulados: Int,
        /** Filas con un importe que no se pudo leer; no suman en ninguna cifra. */
        val sinImporte: Int,
    )

    fun cifras(pagos: List<PagoEmpleadoDto>): Cifras {
        val pagados = pagos.filter { estadoDe(it) == Estado.PAGADO }
        val borradores = pagos.filter { estadoDe(it) == Estado.BORRADOR }
        return Cifras(
            pagadoCentavos = pagados.sumOf { centavosDe(it) ?: 0L },
            pagados = pagados.size,
            borradorCentavos = borradores.sumOf { centavosDe(it) ?: 0L },
            borradores = borradores.size,
            // Por empleado, no por fila: es «a cuánta gente», no «cuántos pagos».
            empleados = pagos.mapNotNull { it.userId }.distinct().size,
            anulados = pagos.count { estadoDe(it) == Estado.ANULADO },
            // Los anulados no cuentan: que no traigan importe legible da igual,
            // porque nadie va a sumarlos ni a cobrarlos.
            sinImporte = pagos.count { estadoDe(it) != Estado.ANULADO && !tieneImporteLegible(it) },
        )
    }

    const val METRICA_PAGADO = "pagado"
    const val METRICA_BORRADOR = "borrador"
    const val METRICA_EMPLEADOS = "empleados"
    const val METRICA_ANULADOS = "anulados"

    /**
     * La tira de cifras de la pantalla.
     *
     * Regla 7 del contrato de diseño: **sin una sola fila no se pinta nada**.
     * Cuatro celdas en `$0` encima de un «Sin pagos registrados» ocupan el sitio
     * de lo único que ayuda ahí, que es la frase que explica de dónde sale el
     * primer renglón. La condición es el conteo real de filas, no que las cifras
     * den cero: un periodo que de verdad cerró sin pagar nada SÍ se enseña,
     * porque eso es información y además es una pregunta que alguien va a hacer.
     *
     * Regla 6: el color solo aparece donde pide acción — borradores por
     * autorizar e importes que no se pudieron leer.
     */
    fun metricas(pagos: List<PagoEmpleadoDto>): List<NxMetric> {
        if (pagos.isEmpty()) return emptyList()
        val c = cifras(pagos)
        return listOf(
            NxMetric(
                clave = METRICA_PAGADO,
                etiqueta = "Pagado",
                valor = Dinero.pesos(c.pagadoCentavos),
                pista = when {
                    c.pagados == 0 -> "nada liquidado"
                    c.pagados == 1 -> "1 pago"
                    else -> "${c.pagados} pagos"
                },
                color = VERDE.takeIf { c.pagados > 0 },
            ),
            NxMetric(
                clave = METRICA_BORRADOR,
                etiqueta = "En borrador",
                valor = Dinero.pesos(c.borradorCentavos),
                pista = when {
                    c.borradores == 0 -> "nada pendiente"
                    c.borradores == 1 -> "1 por autorizar"
                    else -> "${c.borradores} por autorizar"
                },
                // Solo se tiñe si hay algo esperando: si no hay nada, gris y tranquila.
                color = AMBAR.takeIf { c.borradores > 0 },
            ),
            NxMetric(
                clave = METRICA_EMPLEADOS,
                etiqueta = "Empleados",
                valor = c.empleados.toString(),
                pista = "con registro",
            ),
            NxMetric(
                clave = METRICA_ANULADOS,
                etiqueta = "Anulados",
                valor = c.anulados.toString(),
                pista = if (c.anulados == 0) "ninguno" else "no suman",
            ),
        )
    }

    /** Qué filtro corresponde a cada celda de la tira, para que tocarla filtre. */
    fun filtroDeMetrica(clave: String): Filtro? = when (clave) {
        METRICA_PAGADO -> Filtro.PAGADOS
        METRICA_BORRADOR -> Filtro.BORRADORES
        METRICA_ANULADOS -> Filtro.ANULADOS
        else -> null
    }

    /** Y al revés: qué celda queda marcada con el filtro puesto. */
    fun metricaDeFiltro(filtro: Filtro): String? = when (filtro) {
        Filtro.PAGADOS -> METRICA_PAGADO
        Filtro.BORRADORES -> METRICA_BORRADOR
        Filtro.ANULADOS -> METRICA_ANULADOS
        Filtro.TODOS -> null
    }

    /**
     * El aviso de los importes ilegibles, en palabras.
     *
     * Se dice arriba y con color porque es lo único de esta pantalla que puede
     * hacer que una cifra esté mal. `null` cuando todo se pudo leer, que es lo
     * normal.
     */
    fun avisoImportesTexto(pagos: List<PagoEmpleadoDto>): String? {
        val sinImporte = cifras(pagos).sinImporte
        if (sinImporte <= 0) return null
        return if (sinImporte == 1) {
            "Un pago no trae un importe que se pueda leer: se enseña como «—» y no suma en las cifras de arriba."
        } else {
            "$sinImporte pagos no traen un importe que se pueda leer: se enseñan como «—» y no suman en las cifras de arriba."
        }
    }

    /** El título de la lista: qué se está viendo ahora mismo. */
    fun tituloLista(filtro: Filtro): String =
        if (filtro == Filtro.TODOS) "Todos los pagos" else filtro.etiqueta

    // ── Constantes ───────────────────────────────────────────────────────────

    /** Lo que se escribe cuando no hay cifra. Nunca un cero. */
    const val SIN_DATO = "—"

    /**
     * Los colores como ARGB, para no arrastrar Compose a las pruebas (mismo
     * criterio que `AttendanceUx`). Son los tokens de `.ai/DISENO-TOKENS.md`:
     * `--ui-success`, `--ui-warning` y `--ui-fg-3`.
     */
    const val VERDE = 0xFF16A34AL
    const val AMBAR = 0xFFD97706L
    const val GRIS = 0xFF94A3B8L

    /** Qué NO hace esta pantalla. Se dice al pie, sin botón que eche al navegador. */
    const val LIMITE =
        "Consulta. Registrar un pago, autorizarlo, marcarlo pagado o anularlo se hacen desde la computadora."

    private val ESPANOL = Locale.forLanguageTag("es-MX")
    private val FORMATO_CORTO = DateTimeFormatter.ofPattern("d MMM", ESPANOL)
    private val FORMATO_LARGO = DateTimeFormatter.ofPattern("d MMM yyyy", ESPANOL)
}
