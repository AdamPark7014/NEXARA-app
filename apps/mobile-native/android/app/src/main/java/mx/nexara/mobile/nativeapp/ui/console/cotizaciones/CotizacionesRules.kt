package mx.nexara.mobile.nativeapp.ui.console.cotizaciones

import java.math.BigDecimal
import java.math.RoundingMode
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale
import mx.nexara.mobile.nativeapp.data.api.CotizacionDetalleDto
import mx.nexara.mobile.nativeapp.data.api.CotizacionGrupoDto
import mx.nexara.mobile.nativeapp.data.api.CotizacionPartidaDto
import mx.nexara.mobile.nativeapp.data.api.CotizacionResumenDto
import mx.nexara.mobile.nativeapp.ui.console.viaticos.Dinero

/**
 * Cotizaciones en el teléfono: qué se enseña de cada una y en qué orden.
 *
 * La web tiene una tabla de nueve columnas (folio, cliente, proyecto, segmento,
 * estado, monto, emisión, vigencia y las siglas de quienes intervinieron). En
 * 375 px eso no se lee, así que cada cotización es una tarjeta con la jerarquía
 * que pide el teléfono: **folio y cliente arriba, el monto grande, el estado al
 * lado**, y debajo la única alerta que obliga a hacer algo hoy — que una
 * enviada esté a punto de vencer.
 *
 * El orden es el del servidor (la más reciente primero) y aquí se hace
 * explícito: inventar un orden distinto del de la web dejaría a la misma
 * persona viendo dos listas que no coinciden.
 *
 * Los importes son `Decimal` de Prisma y viajan como número (`listaCore` hace
 * `Number(...)`) o como texto (`detalleCore` reexpone la fila tal cual); todo
 * pasa por [centavos], que se traga las dos formas y devuelve `null` si no
 * entiende — nunca un cero fingido, que en dinero es una mentira cara.
 *
 * Sin Android: se prueba en la JVM (`CotizacionesRulesTest`).
 */
object CotizacionesRules {

    // ── Estado ───────────────────────────────────────────────────────────────

    /** `EstadoCotizacion` del servidor (`apps/api/src/cotizaciones/estado-cotizacion.ts`). */
    enum class Estado(val clave: String, val etiqueta: String) {
        BORRADOR("BORRADOR", "Borrador"),
        ENVIADA("ENVIADA", "Enviada"),
        APROBADA("APROBADA", "Aprobada"),
        RECHAZADA("RECHAZADA", "Rechazada"),
        VENCIDA("VENCIDA", "Vencida"),
        DESCONOCIDO("", "Sin estado"),
    }

    /**
     * Estado a partir de lo que mande el servidor.
     *
     * Acepta también el enum en inglés de la base (`DRAFT`, `SENT`…): las rutas
     * de Core ya traducen, pero una cotización que llegue por otra vía no puede
     * quedarse sin estado por eso.
     */
    fun estado(valor: String?): Estado {
        val clave = valor?.trim()?.uppercase().orEmpty()
        Estado.entries.firstOrNull { it.clave == clave && it != Estado.DESCONOCIDO }?.let { return it }
        return when (clave) {
            "DRAFT" -> Estado.BORRADOR
            "SENT" -> Estado.ENVIADA
            "APPROVED" -> Estado.APROBADA
            "REJECTED" -> Estado.RECHAZADA
            "EXPIRED" -> Estado.VENCIDA
            else -> Estado.DESCONOCIDO
        }
    }

    fun estadoDe(row: CotizacionResumenDto): Estado = estado(row.estado)

    /** La etiqueta del servidor si viene; si no, la nuestra. */
    fun etiquetaEstado(row: CotizacionResumenDto): String =
        row.estadoEtiqueta?.trim()?.ifEmpty { null } ?: estadoDe(row).etiqueta

    fun etiquetaEstado(detalle: CotizacionDetalleDto): String =
        detalle.estadoEtiqueta?.trim()?.ifEmpty { null } ?: estado(detalle.estado).etiqueta

    /** Etiqueta del segmento; el servidor la manda en español (`ETIQUETA_SEGMENTO`). */
    fun etiquetaSegmento(row: CotizacionResumenDto): String? =
        row.segmentoEtiqueta?.trim()?.ifEmpty { null }
            ?: row.segmento?.trim()?.lowercase(ESPANOL)?.replaceFirstChar { it.uppercase() }?.ifEmpty { null }

    // ── Filtros ──────────────────────────────────────────────────────────────

    /**
     * Los filtros de arriba, pensados por lo que se hace con cada grupo y no
     * por el nombre del estado:
     *
     * - **Por cerrar**: enviadas. Es el dinero que está en la mesa esperando al
     *   cliente, y lo primero que pregunta dirección.
     * - **Borradores**: lo que falta terminar; solo se termina en la web.
     * - **Aprobadas**: lo que ya se ganó.
     * - **Perdidas**: rechazadas y vencidas juntas, porque para quien las mira
     *   son lo mismo: no se cobró.
     */
    enum class Filtro(val etiqueta: String) {
        TODAS("Todas"),
        POR_CERRAR("Por cerrar"),
        BORRADORES("Borradores"),
        APROBADAS("Aprobadas"),
        PERDIDAS("Perdidas"),
    }

    fun cumple(row: CotizacionResumenDto, filtro: Filtro): Boolean = when (filtro) {
        Filtro.TODAS -> true
        Filtro.POR_CERRAR -> estadoDe(row) == Estado.ENVIADA
        Filtro.BORRADORES -> estadoDe(row) == Estado.BORRADOR
        Filtro.APROBADAS -> estadoDe(row) == Estado.APROBADA
        Filtro.PERDIDAS -> estadoDe(row) == Estado.RECHAZADA || estadoDe(row) == Estado.VENCIDA
    }

    /**
     * Lo que la búsqueda mira: lo mismo que la web (folio, cliente, empresa,
     * proyecto, quien la hizo y quienes intervinieron con nombre y siglas).
     * Buscar «JA» tiene que encontrar la que revisó Juan Aguilar.
     */
    private fun camposBuscables(row: CotizacionResumenDto): List<String> = buildList {
        listOfNotNull(
            row.folio,
            row.clienteNombre,
            row.clienteEmpresa,
            row.projectName,
            row.elaboro?.nombre,
            row.elaboro?.siglas,
        ).forEach { add(it) }
        row.intervinieron.orEmpty().forEach { p ->
            p.nombre?.let { add(it) }
            p.siglas?.let { add(it) }
        }
    }

    fun coincide(row: CotizacionResumenDto, consulta: String): Boolean {
        val q = consulta.trim().lowercase(ESPANOL)
        if (q.isEmpty()) return true
        return camposBuscables(row).any { it.lowercase(ESPANOL).contains(q) }
    }

    /**
     * El orden de la web: la más reciente primero.
     *
     * `createdAt` es ISO y se compara como texto, que para ese formato ordena
     * igual que como fecha. Las que no traen fecha caen al final por `id`
     * descendente, que es el mismo criterio con otro nombre.
     */
    fun ordenar(cotizaciones: List<CotizacionResumenDto>): List<CotizacionResumenDto> =
        cotizaciones.sortedWith(
            compareByDescending<CotizacionResumenDto> { it.createdAt.orEmpty() }
                .thenByDescending { it.id ?: 0L },
        )

    /** Filtro + búsqueda, ya ordenado: lo que se pinta. */
    fun aplicar(
        cotizaciones: List<CotizacionResumenDto>,
        filtro: Filtro,
        consulta: String,
    ): List<CotizacionResumenDto> =
        ordenar(cotizaciones.filter { cumple(it, filtro) && coincide(it, consulta) })

    /** Cuántas hay en cada filtro, para el número de la pastilla. */
    fun conteos(cotizaciones: List<CotizacionResumenDto>): Map<Filtro, Int> =
        Filtro.entries.associateWith { filtro -> cotizaciones.count { cumple(it, filtro) } }

    // ── Dinero ───────────────────────────────────────────────────────────────

    /**
     * Importe del API → centavos. `null` si no es un número.
     *
     * Se redondea a centavo con `HALF_UP`, la misma regla que el servidor
     * (`Math.round(n * 100)`), para que los dos lados digan la misma cifra.
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
     * Importe listo para leer: `"$1,234.56"`, o `"—"` si no hay cifra.
     *
     * Usa [Dinero], el mismo formateador de pesos que Viáticos: dos maneras de
     * escribir un peso en la misma app son dos maneras de dudar de la cifra.
     */
    fun pesos(valor: String?): String = centavos(valor)?.let { Dinero.pesos(it) } ?: "—"

    /** Monto de la cotización, con la moneda cuando no es el peso mexicano. */
    fun montoTexto(row: CotizacionResumenDto): String {
        val monto = pesos(row.total)
        val moneda = row.currency?.trim()?.uppercase(ESPANOL)
        return if (monto != "—" && !moneda.isNullOrEmpty() && moneda != "MXN") "$monto $moneda" else monto
    }

    /**
     * Las dos cifras de arriba: lo que está en la mesa y lo que ya se ganó.
     *
     * Es la primera pregunta de quien abre esta pantalla, y la web la contesta
     * con una tira de cuatro números. En el teléfono caben dos, así que van las
     * dos que mueven a hacer algo: llamar al cliente que no ha contestado, y
     * saber cuánto se cerró. Las cotizaciones sin importe legible no suman —
     * antes una cifra corta que una inflada con ceros fingidos.
     */
    data class Cifras(
        val porCerrarCentavos: Long,
        val porCerrar: Int,
        val aprobadoCentavos: Long,
        val aprobadas: Int,
    )

    fun cifras(cotizaciones: List<CotizacionResumenDto>): Cifras {
        val enviadas = cotizaciones.filter { estadoDe(it) == Estado.ENVIADA }
        val aprobadas = cotizaciones.filter { estadoDe(it) == Estado.APROBADA }
        return Cifras(
            porCerrarCentavos = enviadas.sumOf { centavos(it.total) ?: 0L },
            porCerrar = enviadas.size,
            aprobadoCentavos = aprobadas.sumOf { centavos(it.total) ?: 0L },
            aprobadas = aprobadas.size,
        )
    }

    // ── Textos de la tarjeta ─────────────────────────────────────────────────

    /**
     * A quién se le cotizó. La empresa manda sobre el contacto: en una lista se
     * busca «Bachoco», no «Ing. Pérez».
     */
    fun clienteTexto(row: CotizacionResumenDto): String {
        val empresa = row.clienteEmpresa?.trim()?.ifEmpty { null }
        val persona = row.clienteNombre?.trim()?.ifEmpty { null }
        return when {
            empresa != null && persona != null && !empresa.equals(persona, ignoreCase = true) ->
                "$empresa · $persona"
            empresa != null -> empresa
            persona != null -> persona
            else -> "Sin cliente"
        }
    }

    /** Proyecto y segmento en una línea; ninguno es obligatorio. */
    fun contextoTexto(row: CotizacionResumenDto): String? {
        val partes = listOfNotNull(
            row.projectName?.trim()?.ifEmpty { null },
            etiquetaSegmento(row),
        )
        return partes.joinToString(" · ").ifEmpty { null }
    }

    /**
     * Siglas de quienes intervinieron, sin repetir y en orden.
     *
     * Si nadie quedó registrado se enseñan las de quien la hizo: el folio ya
     * lleva su nomenclatura, así que decir «nadie» sería falso.
     */
    fun siglas(row: CotizacionResumenDto): List<String> {
        val registradas = row.intervinieron.orEmpty()
            .mapNotNull { it.siglas?.trim()?.ifEmpty { null } }
            .distinct()
        if (registradas.isNotEmpty()) return registradas
        return listOfNotNull(row.elaboro?.siglas?.trim()?.ifEmpty { null })
    }

    /** «Elaboró Ana López · revisión 2» — el folio en palabras, corto. */
    fun autoriaTexto(row: CotizacionResumenDto): String? {
        val quien = row.elaboro?.nombre?.trim()?.ifEmpty { null }
        val revision = row.revision ?: 1
        val partes = listOfNotNull(
            quien?.let { "Elaboró $it" },
            if (revision > 1) "revisión $revision" else null,
        )
        return partes.joinToString(" · ").ifEmpty { null }
    }

    // ── Vigencia ─────────────────────────────────────────────────────────────

    /** Días que faltan para que venza; negativo si ya pasó. `null` sin fecha. */
    fun diasParaVencer(validUntil: String?, hoy: LocalDate = LocalDate.now()): Long? {
        val fecha = fecha(validUntil) ?: return null
        return java.time.temporal.ChronoUnit.DAYS.between(hoy, fecha)
    }

    /**
     * La única alerta de la lista: una **enviada** a punto de vencer, o ya
     * vencida sin que nadie la haya marcado.
     *
     * Solo se avisa de las enviadas: la vigencia de un borrador no significa
     * nada (no ha salido), y la de una aprobada tampoco (ya se cerró).
     */
    fun vigenciaTexto(row: CotizacionResumenDto, hoy: LocalDate = LocalDate.now()): String? {
        if (estadoDe(row) != Estado.ENVIADA) return null
        val dias = diasParaVencer(row.validUntil, hoy) ?: return null
        return when {
            dias < -1L -> "Venció hace ${-dias} días"
            dias == -1L -> "Venció ayer"
            dias == 0L -> "Vence hoy"
            dias == 1L -> "Vence mañana"
            dias <= AVISO_VIGENCIA_DIAS -> "Vence en $dias días"
            else -> null
        }
    }

    /** ¿Ese aviso de vigencia es ya un problema (venció o vence hoy)? */
    fun vigenciaVencida(row: CotizacionResumenDto, hoy: LocalDate = LocalDate.now()): Boolean {
        if (estadoDe(row) != Estado.ENVIADA) return false
        val dias = diasParaVencer(row.validUntil, hoy) ?: return false
        return dias <= 0L
    }

    /** A partir de cuántos días antes se avisa de una vigencia que se acaba. */
    const val AVISO_VIGENCIA_DIAS = 7L

    // ── Fechas ───────────────────────────────────────────────────────────────

    /**
     * Fecha del API (`2026-09-25` o con hora) como `LocalDate`.
     *
     * Se corta a los diez primeros caracteres a propósito: emisión y vigencia
     * se guardan a medianoche UTC y convertirlas a la hora de México las
     * retrasaba un día — «2026-09-18» se leía 17 de septiembre.
     */
    fun fecha(iso: String?): LocalDate? {
        val texto = iso?.trim()?.takeIf { it.length >= 10 } ?: return null
        return runCatching {
            LocalDate.parse(texto.substring(0, 10), DateTimeFormatter.ISO_LOCAL_DATE)
        }.getOrNull()
    }

    /** «25 sep» · `null` si no se puede leer: antes ninguna fecha que una inventada. */
    fun fechaCorta(iso: String?): String? = fecha(iso)?.format(FORMATO_CORTO)

    /** «25 sep 2026» — para el detalle, donde el año sí importa. */
    fun fechaLarga(iso: String?): String? = fecha(iso)?.format(FORMATO_LARGO)

    /**
     * La fecha que corresponde al estado: cuándo salió si ya se envió, cuándo
     * se creó si sigue en borrador. Enseñar «creada» en una enviada esconde el
     * dato que importa, que es desde cuándo el cliente la tiene.
     */
    fun fechaTexto(row: CotizacionResumenDto): String? =
        if (estadoDe(row) == Estado.BORRADOR) {
            fechaCorta(row.createdAt)?.let { "Creada $it" }
        } else {
            fechaCorta(row.sentAt)?.let { "Enviada $it" }
                ?: fechaCorta(row.createdAt)?.let { "Creada $it" }
        }

    // ── Detalle ──────────────────────────────────────────────────────────────

    /** Etiqueta del grupo; el servidor ya la manda en español (`ETIQUETA_GRUPO`). */
    fun etiquetaGrupo(grupo: CotizacionGrupoDto): String =
        grupo.etiqueta?.trim()?.ifEmpty { null } ?: when (grupo.grupo?.trim()?.uppercase()) {
            "EQUIPOS" -> "Equipos"
            "MATERIALES" -> "Materiales"
            "MANO_DE_OBRA" -> "Mano de obra"
            else -> "Otros conceptos"
        }

    /**
     * Grupos con partidas, en el orden en que llegan.
     *
     * El servidor ya los manda ordenados (Equipos → Materiales → Mano de obra)
     * y sin los vacíos; aquí solo se descartan los que llegaran sin partidas,
     * para no pintar una cabecera que no abre nada.
     */
    fun gruposConPartidas(detalle: CotizacionDetalleDto): List<CotizacionGrupoDto> =
        detalle.grupos.orEmpty().filter { !it.partidas.isNullOrEmpty() }

    fun totalPartidas(detalle: CotizacionDetalleDto): Int =
        gruposConPartidas(detalle).sumOf { it.partidas.orEmpty().size }

    /** Nombre de la partida; si no hay, la categoría, y si tampoco, algo honesto. */
    fun partidaTitulo(partida: CotizacionPartidaDto): String =
        partida.name?.trim()?.ifEmpty { null }
            ?: partida.category?.trim()?.ifEmpty { null }
            ?: "Concepto sin nombre"

    /**
     * «3 pza × $1,200.00» — cantidad, unidad y precio unitario en una línea.
     *
     * Si falta el precio se enseña solo la cantidad; si falta todo, `null`: una
     * línea vacía ocupa el mismo sitio que una que dice algo.
     */
    fun partidaCantidadTexto(partida: CotizacionPartidaDto): String? {
        val cantidad = numeroTexto(partida.qty)
        val unidad = partida.unit?.trim()?.ifEmpty { null }
        val precio = centavos(partida.unitPrice)?.let { Dinero.pesos(it) }
        val izquierda = listOfNotNull(cantidad, unidad).joinToString(" ").ifEmpty { null }
        return when {
            izquierda != null && precio != null -> "$izquierda × $precio"
            izquierda != null -> izquierda
            precio != null -> precio
            else -> null
        }
    }

    /** Importe de la partida, o `"—"` cuando el servidor no lo mandó. */
    fun partidaImporteTexto(partida: CotizacionPartidaDto): String = pesos(partida.lineTotal)

    /**
     * Un número del API sin decimales de adorno: `"3"`, `"2.5"`, `null`.
     *
     * Se conserva el punto solo cuando aporta: «3.00 pza» se lee peor que
     * «3 pza», y en una lista de veinte partidas ese ruido es la diferencia
     * entre barrerla de un vistazo y no barrerla.
     */
    fun numeroTexto(valor: String?): String? {
        val texto = valor?.trim()?.takeIf { it.isNotEmpty() && it != "null" } ?: return null
        val decimal = runCatching { BigDecimal(texto) }.getOrNull()
            ?: texto.toDoubleOrNull()?.let { BigDecimal.valueOf(it) }
            ?: return null
        val limpio = decimal.stripTrailingZeros()
        return if (limpio.scale() <= 0) limpio.toBigInteger().toString() else limpio.toPlainString()
    }

    /** A quién se le pasó por dentro y con qué nota; `null` si no se pasó a nadie. */
    fun asignacionTexto(detalle: CotizacionDetalleDto): String? {
        val quien = detalle.asignadoA?.nombre?.trim()?.ifEmpty { null } ?: return null
        val dePor = detalle.asignadoPor?.nombre?.trim()?.ifEmpty { null }
        return if (dePor != null) "En manos de $quien · se la pasó $dePor" else "En manos de $quien"
    }

    /** Por qué se rechazó y quién lo dijo; `null` si no está rechazada. */
    fun rechazoTexto(detalle: CotizacionDetalleDto): String? {
        if (estado(detalle.estado) != Estado.RECHAZADA) return null
        val motivo = detalle.rejectedReason?.trim()?.ifEmpty { null }
        val quien = detalle.rejectedByName?.trim()?.ifEmpty { null }
        return when {
            motivo != null && quien != null -> "$quien la rechazó: $motivo"
            motivo != null -> "Motivo: $motivo"
            quien != null -> "$quien la rechazó, sin motivo registrado."
            else -> "Rechazada sin motivo registrado."
        }
    }

    /** Nombre del archivo con el que se guarda el PDF en el teléfono. */
    fun nombreArchivoPdf(id: Long, folio: String?): String {
        val base = folio?.trim()?.ifEmpty { null } ?: "cotizacion-$id"
        return base.replace(Regex("[^A-Za-z0-9._-]"), "-").trim('-').ifEmpty { "cotizacion-$id" } + ".pdf"
    }

    /** Qué no hace esta pantalla. */
    const val LIMITE =
        "Consulta. Crear y editar una cotización, mandarla al cliente y decidirla se hacen desde la computadora."

    private val ESPANOL = Locale.forLanguageTag("es-MX")
    private val FORMATO_CORTO = DateTimeFormatter.ofPattern("d MMM", ESPANOL)
    private val FORMATO_LARGO = DateTimeFormatter.ofPattern("d MMM yyyy", ESPANOL)
}
