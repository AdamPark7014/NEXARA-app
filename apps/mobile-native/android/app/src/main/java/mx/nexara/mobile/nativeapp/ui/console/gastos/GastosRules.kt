package mx.nexara.mobile.nativeapp.ui.console.gastos

import java.math.BigDecimal
import java.math.RoundingMode
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale
import mx.nexara.mobile.nativeapp.data.api.GastoDto
import mx.nexara.mobile.nativeapp.ui.console.activities.CoreActivityRules
import mx.nexara.mobile.nativeapp.ui.console.viaticos.Dinero
import mx.nexara.mobile.nativeapp.ui.enterprise.NxMetric

/**
 * Gastos administrativos en el teléfono: qué se enseña de cada uno, en qué
 * orden y qué se puede hacer con él.
 *
 * La web tiene una tabla de seis columnas, dos pestañas y un reporte por
 * rango de fechas. En 375 px eso no se lee, así que cada gasto es una fila
 * densa que contesta lo que se pregunta con el teléfono en la mano: **qué se
 * compró y cuánto**, **en qué va** y **si falta el comprobante**, que es lo
 * único que bloquea el cierre contable.
 *
 * Los importes son `Decimal` de Prisma y viajan como número JSON o como texto
 * según por dónde salgan; todo pasa por [centavos], que se traga las dos formas
 * y devuelve `null` si no entiende — nunca un cero fingido, que en dinero es
 * una mentira cara.
 *
 * Sin Android: se prueba en la JVM (`GastosRulesTest`).
 */
object GastosRules {

    // ── Estado ───────────────────────────────────────────────────────────────

    /**
     * Los cuatro estados de `estatusPago` (`apps/api/src/expenses/expenses.service.ts`).
     *
     * El orden del flujo es Pendiente → Aprobado → Pagado, y Rechazado es la
     * salida. Un gasto borrado también queda «Rechazado» del lado del servidor
     * (`remove` pone `deletedAt` y ese estatus), pero entonces ya no vuelve en
     * la lista, así que aquí nunca se ve.
     */
    enum class Estado(val clave: String, val etiqueta: String) {
        PENDIENTE("Pendiente", "Por autorizar"),
        APROBADO("Aprobado", "Autorizado"),
        PAGADO("Pagado", "Pagado"),
        RECHAZADO("Rechazado", "Rechazado"),
        DESCONOCIDO("", "Sin estado"),
    }

    /**
     * Estado a partir de lo que mande el servidor.
     *
     * Repite las equivalencias de `normalizeStatus` —incluidas las mayúsculas
     * viejas de la interfaz y los sinónimos en inglés— porque la fila llega
     * cruda: `GET expenses` devuelve el registro tal cual y nadie lo traduce
     * por el camino. Un gasto que llegara con `PENDIENTE_APROBACION` no puede
     * quedarse sin estado por eso.
     */
    fun estado(valor: String?): Estado {
        val crudo = valor?.trim().orEmpty()
        if (crudo.isEmpty()) return Estado.DESCONOCIDO
        return when (crudo.lowercase(ESPANOL)) {
            "pagado", "paid", "aprobado_pagado" -> Estado.PAGADO
            "aprobado", "approved", "autorizado" -> Estado.APROBADO
            "rechazado", "rejected", "cancelado" -> Estado.RECHAZADO
            "pendiente", "borrador", "pendiente_aprobacion", "draft" -> Estado.PENDIENTE
            else -> Estado.DESCONOCIDO
        }
    }

    fun estadoDe(row: GastoDto): Estado = estado(row.estatusPago)

    fun etiquetaEstado(row: GastoDto): String = estadoDe(row).etiqueta

    /**
     * Color del punto de estado (regla 3 del contrato: un punto y una palabra,
     * y color **solo** cuando el renglón pide acción o algo salió mal).
     *
     * Se reutilizan las tintas de `CoreActivityRules`, que ya son las de la web
     * (`--ui-warning`, `--ui-success`, `--ui-danger`): declarar otro ámbar aquí
     * sería tener dos ámbares que con el tiempo dejan de ser el mismo.
     *
     * «Autorizado» va en gris a propósito aunque falte pagarlo: es el estado
     * normal del flujo, y pintarlo de color con veinte filas convierte la lista
     * en un semáforo donde ya no se distingue lo que urge.
     */
    fun colorEstado(estado: Estado): Long? = when (estado) {
        Estado.PENDIENTE -> CoreActivityRules.NARANJA
        Estado.PAGADO -> CoreActivityRules.VERDE
        Estado.RECHAZADO -> CoreActivityRules.ROJO
        Estado.APROBADO, Estado.DESCONOCIDO -> null
    }

    /**
     * Un gasto sin su ticket. Es lo que de verdad bloquea el cierre del mes:
     * sin comprobante el contador no puede deducirlo.
     *
     * Los rechazados no cuentan: ya no van a ninguna póliza, así que pedirles
     * comprobante es ruido. Es el mismo criterio de la web.
     */
    fun sinComprobante(row: GastoDto): Boolean =
        row.ticketEvidenciaUrl.isNullOrBlank() && estadoDe(row) != Estado.RECHAZADO

    /** Solo un pendiente se autoriza o se rechaza (`approveOrReject` lo exige). */
    fun puedeAutorizar(row: GastoDto): Boolean = estadoDe(row) == Estado.PENDIENTE

    /** Solo un autorizado se marca pagado (`markPagado` lo exige). */
    fun puedePagar(row: GastoDto): Boolean = estadoDe(row) == Estado.APROBADO

    // ── Filtros ──────────────────────────────────────────────────────────────

    /**
     * Los filtros, nombrados por lo que hay que hacer con cada grupo y no por
     * el nombre interno del estado:
     *
     * - **Por autorizar**: esperan el visto bueno de alguien. Lo primero que
     *   pregunta dirección.
     * - **Por pagar**: ya autorizados; es dinero que la empresa debe reponer.
     * - **Sin comprobante**: lo que bloquea el cierre contable. No es un estado
     *   del servidor, es la pregunta del contador, y por eso es un filtro
     *   propio y además una celda de la tira de cifras.
     * - **Pagados** y **Rechazados**: cerrados, para consultar.
     *
     * [clave] es la misma que la de la celda de la tira, para que tocar la cifra
     * filtre la lista sin que la pantalla tenga que traducir nada.
     */
    enum class Filtro(val clave: String, val etiqueta: String) {
        TODOS("todos", "Todos"),
        POR_AUTORIZAR("por_autorizar", "Por autorizar"),
        POR_PAGAR("por_pagar", "Por pagar"),
        SIN_COMPROBANTE("sin_comprobante", "Sin comprobante"),
        PAGADOS("pagados", "Pagados"),
        RECHAZADOS("rechazados", "Rechazados"),
        ;

        companion object {
            fun porClave(clave: String?): Filtro? =
                entries.firstOrNull { it.clave == clave?.trim()?.lowercase(ESPANOL) }
        }
    }

    fun cumple(row: GastoDto, filtro: Filtro): Boolean = when (filtro) {
        Filtro.TODOS -> true
        Filtro.POR_AUTORIZAR -> estadoDe(row) == Estado.PENDIENTE
        Filtro.POR_PAGAR -> estadoDe(row) == Estado.APROBADO
        Filtro.SIN_COMPROBANTE -> sinComprobante(row)
        Filtro.PAGADOS -> estadoDe(row) == Estado.PAGADO
        Filtro.RECHAZADOS -> estadoDe(row) == Estado.RECHAZADO
    }

    /**
     * Lo que mira la búsqueda: lo mismo que la web (concepto, quién lo pidió y
     * el folio contable) más la categoría, que en el teléfono es la forma
     * rápida de sacar «todas las suscripciones» sin abrir otro control.
     */
    private fun camposBuscables(row: GastoDto): List<String> = listOfNotNull(
        row.concepto,
        row.razonGasto,
        row.categoria,
        row.usuario?.nombre,
        row.createdBy?.nombre,
        row.contabilidadRef,
        row.actividad?.anNumber,
    )

    fun coincide(row: GastoDto, consulta: String): Boolean {
        val q = consulta.trim().lowercase(ESPANOL)
        if (q.isEmpty()) return true
        return camposBuscables(row).any { it.lowercase(ESPANOL).contains(q) }
    }

    /**
     * El orden del servidor: el más reciente primero.
     *
     * Se ordena por `fechaSolicitud`, que es la clave que usa
     * `findAllAdministrative`, y no por la fecha que se enseña: en un gasto
     * administrativo las dos son la misma (`createAdministrative` las escribe
     * juntas), y cuando no lo fueran, inventar aquí un orden distinto del de la
     * web dejaría a la misma persona viendo dos listas que no coinciden.
     *
     * Las fechas ISO se comparan como texto, que para ese formato ordena igual
     * que como fecha. Las que no traigan ninguna caen al final por `id`
     * descendente, que es el mismo criterio con otro nombre.
     */
    fun ordenar(gastos: List<GastoDto>): List<GastoDto> =
        gastos.sortedWith(
            compareByDescending<GastoDto> { it.fechaSolicitud ?: it.fechaGasto.orEmpty() }
                .thenByDescending { it.id ?: 0L },
        )

    /** Filtro + búsqueda, ya ordenado: lo que se pinta. */
    fun aplicar(gastos: List<GastoDto>, filtro: Filtro, consulta: String): List<GastoDto> =
        ordenar(gastos.filter { cumple(it, filtro) && coincide(it, consulta) })

    /** Cuántos hay en cada filtro, para el número de la pastilla. */
    fun conteos(gastos: List<GastoDto>): Map<Filtro, Int> =
        Filtro.entries.associateWith { filtro -> gastos.count { cumple(it, filtro) } }

    // ── Dinero ───────────────────────────────────────────────────────────────

    /**
     * Importe del API → centavos. `null` si no es un número.
     *
     * `HALF_UP` es la misma regla que el servidor (`Math.round(n * 100)`), para
     * que los dos lados digan la misma cifra. Se acepta texto y número porque
     * un `Decimal` de Prisma llega de las dos formas según el endpoint.
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

    /**
     * Importe listo para leer: `"$1,234.56"`, o `"—"` si no hay cifra legible.
     *
     * Usa [Dinero], el mismo formateador de pesos que Viáticos y Cotizaciones:
     * tres maneras de escribir un peso en la misma app son tres maneras de
     * dudar de la cifra.
     */
    fun pesos(valor: String?): String = centavos(valor)?.let { Dinero.pesos(it) } ?: "—"

    fun montoTexto(row: GastoDto): String = pesos(row.montoSolicitado)

    // ── La tira de cifras (reglas 1 y 7) ─────────────────────────────────────

    /**
     * Las cuatro cifras de arriba, las mismas que la web y en el mismo orden:
     * cuánto falta por autorizar, cuánto está autorizado esperando pago, cuánto
     * ya se pagó, y qué bloquea el cierre.
     *
     * **Se calculan sobre la lista completa, no sobre lo filtrado**: la tira es
     * el mando del filtro (cada celda lo activa), así que si además cambiara
     * con él, tocar una cifra la haría desaparecer.
     *
     * Regla 7: con la lista vacía devuelve **nada** y la tira no se dibuja —
     * cuatro celdas en `$0` encima de un «Sin gastos» ocupan el sitio de lo
     * único que ayuda ahí. La condición es el conteo real de filas, no que las
     * cifras den cero: un mes que de verdad cerró en cero sí se enseña, porque
     * eso es información.
     *
     * Los gastos con importe ilegible no suman: antes una cifra corta que una
     * inflada con ceros fingidos.
     */
    fun cifras(gastos: List<GastoDto>): List<NxMetric> {
        if (gastos.isEmpty()) return emptyList()

        val suma = { filas: List<GastoDto> -> filas.sumOf { centavos(it.montoSolicitado) ?: 0L } }
        val porAutorizar = gastos.filter { estadoDe(it) == Estado.PENDIENTE }
        val porPagar = gastos.filter { estadoDe(it) == Estado.APROBADO }
        val pagados = gastos.filter { estadoDe(it) == Estado.PAGADO }
        val sinTicket = gastos.filter { sinComprobante(it) }

        return listOf(
            NxMetric(
                clave = Filtro.POR_AUTORIZAR.clave,
                etiqueta = "Por autorizar",
                valor = Dinero.pesos(suma(porAutorizar)),
                pista = plural(porAutorizar.size, "gasto esperando", "gastos esperando"),
                // Color solo cuando hay algo que hacer (regla 6).
                color = CoreActivityRules.NARANJA.takeIf { porAutorizar.isNotEmpty() },
            ),
            NxMetric(
                clave = Filtro.POR_PAGAR.clave,
                etiqueta = "Por pagar",
                valor = Dinero.pesos(suma(porPagar)),
                pista = plural(porPagar.size, "autorizado sin pagar", "autorizados sin pagar"),
            ),
            NxMetric(
                clave = Filtro.PAGADOS.clave,
                etiqueta = "Pagado",
                valor = Dinero.pesos(suma(pagados)),
                pista = plural(pagados.size, "gasto liquidado", "gastos liquidados"),
            ),
            NxMetric(
                clave = Filtro.SIN_COMPROBANTE.clave,
                etiqueta = "Sin comprobante",
                // Aquí la cifra es un conteo, no dinero: lo que bloquea el
                // cierre son los papeles que faltan, no su importe.
                valor = sinTicket.size.toString(),
                pista = if (sinTicket.isEmpty()) "todo comprobado" else "bloquean el cierre",
                color = CoreActivityRules.ROJO.takeIf { sinTicket.isNotEmpty() },
            ),
        )
    }

    // ── Fechas ───────────────────────────────────────────────────────────────

    /**
     * Fecha del API como `LocalDate`, leyendo **el día, no el instante**.
     *
     * Se cortan los diez primeros caracteres a propósito. El API manda
     * instantes UTC y en México son seis horas menos: convertir
     * `2026-09-18T00:00:00.000Z` a hora local lo retrasaría al 17 de
     * septiembre, y un gasto registrado el día 18 aparecería capturado el 17.
     * `fechaGasto` se guarda a mediodía precisamente para esquivar eso, pero
     * `fechaSolicitud` es un `now()` real y sí puede caer de madrugada.
     */
    fun fecha(iso: String?): LocalDate? {
        val texto = iso?.trim()?.takeIf { it.length >= 10 } ?: return null
        return runCatching {
            LocalDate.parse(texto.substring(0, 10), DateTimeFormatter.ISO_LOCAL_DATE)
        }.getOrNull()
    }

    /** El día del gasto: el que se capturó, y si falta, el de la solicitud. */
    fun fechaDelGasto(row: GastoDto): LocalDate? = fecha(row.fechaGasto) ?: fecha(row.fechaSolicitud)

    /** «18 sep» · `null` si no se puede leer: antes ninguna fecha que una inventada. */
    fun fechaCorta(iso: String?): String? = fecha(iso)?.format(FORMATO_CORTO)

    /** «18 sep 2026» — para la ficha, donde el año sí importa. */
    fun fechaLarga(iso: String?): String? = fecha(iso)?.format(FORMATO_LARGO)

    /** La fecha de la fila, ya corta. `"—"` cuando no hay ninguna legible. */
    fun fechaTexto(row: GastoDto): String =
        fechaDelGasto(row)?.format(FORMATO_CORTO) ?: "—"

    /**
     * Los días que ofrece el alta, del más reciente al más viejo.
     *
     * Un ticket se fotografía casi siempre el mismo día o al siguiente, así que
     * cuatro botones resuelven lo que un calendario resolvería en tres toques.
     * Capturar un gasto de la semana pasada se hace en la computadora, y la
     * pantalla lo dice.
     */
    fun opcionesDeFecha(hoy: LocalDate = LocalDate.now()): List<OpcionFecha> =
        (0L until DIAS_DE_ALTA).map { atras ->
            val dia = hoy.minusDays(atras)
            OpcionFecha(
                fecha = dia,
                etiqueta = when (atras) {
                    0L -> "Hoy"
                    1L -> "Ayer"
                    else -> dia.format(FORMATO_CORTO)
                },
            )
        }

    /** Un día del alta: la etiqueta que se toca y el `YYYY-MM-DD` que se manda. */
    data class OpcionFecha(val fecha: LocalDate, val etiqueta: String) {
        /** Lo que espera el servidor; lo lee a mediodía, así que no se corre de día. */
        val valorApi: String get() = fecha.format(DateTimeFormatter.ISO_LOCAL_DATE)
    }

    /** Cuántos días atrás ofrece el alta, hoy incluido. */
    const val DIAS_DE_ALTA = 4L

    // ── Textos de la fila ────────────────────────────────────────────────────

    /**
     * Qué se compró. `concepto` es el campo de los gastos administrativos y
     * `razonGasto` el texto libre heredado; se leen en ese orden, igual que la
     * web (`mapExpenseRow`).
     */
    fun conceptoTexto(row: GastoDto): String =
        row.concepto?.trim()?.ifEmpty { null }
            ?: row.razonGasto?.trim()?.ifEmpty { null }
            ?: "Gasto sin concepto"

    /** De quién es el gasto; si no se sabe, quién lo capturó. */
    fun solicitanteTexto(row: GastoDto): String? =
        row.usuario?.nombre?.trim()?.ifEmpty { null }
            ?: row.createdBy?.nombre?.trim()?.ifEmpty { null }

    fun categoriaTexto(row: GastoDto): String =
        row.categoria?.trim()?.ifEmpty { null } ?: "Sin categoría"

    /**
     * El contexto secundario de la fila, en una línea de 11 px bajo el concepto
     * (regla 2: no se abren columnas nuevas que ensanchen la tabla).
     *
     * Orden: categoría, quién, y si se repite todos los meses. El folio
     * contable y el aviso de comprobante van aparte porque uno es dato de
     * archivo y el otro es una alarma; mezclarlos los volvería invisibles.
     */
    fun contextoTexto(row: GastoDto): String = listOfNotNull(
        categoriaTexto(row),
        solicitanteTexto(row),
        if (row.esRecurrente == true) "Recurrente" else null,
    ).joinToString(" · ")

    /** Folio de la póliza. `null` mientras el API no lo haya escrito: no se inventa. */
    fun referenciaTexto(row: GastoDto): String? =
        row.contabilidadRef?.trim()?.ifEmpty { null }?.let { "Ref. $it" }

    /** Nombre con el que se guarda el comprobante al abrirlo en el teléfono. */
    fun nombreArchivoComprobante(row: GastoDto): String {
        val extension = row.ticketEvidenciaUrl
            ?.substringAfterLast('.', "")
            ?.takeIf { it.isNotEmpty() && it.length <= 4 }
            ?: "jpg"
        val base = "comprobante-gasto-${row.id ?: 0L}"
        return "$base.$extension"
    }

    // ── Alta ─────────────────────────────────────────────────────────────────

    /**
     * Las categorías que acepta el servidor (`EXPENSE_CATEGORIES`).
     *
     * Se repiten aquí en el mismo orden porque `normalizeCategory` convierte en
     * «Otro» todo lo que no reconozca: mandar una categoría inventada no falla,
     * se traga el dato en silencio, que es peor.
     */
    val CATEGORIAS = listOf(
        "Renta",
        "Servicios",
        "Suscripciones",
        "Material",
        "Publicidad",
        "Equipo",
        "Nómina",
        "Impuestos",
        "Otro",
    )

    /** Con la que abre el alta: es la más frecuente en la operación. */
    const val CATEGORIA_POR_OMISION = "Servicios"

    /**
     * Qué le falta al alta para poder mandarse, en el orden en que se lee el
     * formulario. `null` = está completo.
     *
     * Es una función pura para que la regla se pruebe una vez y no se vuelva a
     * escribir en cada `if` de la pantalla. Las tres condiciones son las mismas
     * que comprueba `createAdministrative` antes de contestar 400.
     */
    fun faltaParaRegistrar(concepto: String, importe: String, tieneTicket: Boolean): String? {
        val montoCentavos = Dinero.parsearCentavos(importe)
        return when {
            importe.isBlank() -> "Captura cuánto se gastó"
            montoCentavos == null -> "Ese importe no se entiende"
            montoCentavos <= 0L -> "El importe tiene que ser mayor que cero"
            concepto.isBlank() -> "Di en qué se gastó"
            !tieneTicket -> "Falta la foto del comprobante"
            else -> null
        }
    }

    /** Qué no hace esta pantalla, al pie y sin botón que eche al navegador. */
    const val LIMITE =
        "Registrar, autorizar y pagar. Corregir un gasto ya capturado, borrarlo y " +
            "sacar el reporte por rango de fechas se hacen desde la computadora."

    // ── Utilidades ───────────────────────────────────────────────────────────

    /** «1 gasto esperando» / «3 gastos esperando». */
    private fun plural(n: Int, singular: String, plural: String): String =
        "$n ${if (n == 1) singular else plural}"

    private val ESPANOL = Locale.forLanguageTag("es-MX")
    private val FORMATO_CORTO = DateTimeFormatter.ofPattern("d MMM", ESPANOL)
    private val FORMATO_LARGO = DateTimeFormatter.ofPattern("d MMM yyyy", ESPANOL)
}
