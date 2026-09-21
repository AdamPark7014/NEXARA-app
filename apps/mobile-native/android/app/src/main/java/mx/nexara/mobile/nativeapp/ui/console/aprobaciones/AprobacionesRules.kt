package mx.nexara.mobile.nativeapp.ui.console.aprobaciones

import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale
import mx.nexara.mobile.nativeapp.data.api.AprobacionPendienteDto
import mx.nexara.mobile.nativeapp.data.api.DecisionRespuestaDto
import mx.nexara.mobile.nativeapp.data.api.WfPasoDto
import mx.nexara.mobile.nativeapp.ui.console.viaticos.Dinero
import mx.nexara.mobile.nativeapp.ui.enterprise.NxMetric

/**
 * Aprobaciones en el teléfono: qué dice cada pendiente antes de pedir una
 * decisión, en qué orden salen y qué cifras van arriba.
 *
 * **La regla que manda:** una aprobación se presenta con **qué es, de quién y
 * cuánto** antes de enseñar los botones. Firmar a ciegas es peor que no firmar:
 * parece diligencia y es ruido, y aquí lo que se firma es dinero de la empresa
 * o la contratación de una persona.
 *
 * La segunda: lo que no se sabe se dice. Un importe que no se puede leer sale
 * como `"—"`, nunca como `$0.00`; una fecha que no se entiende no se inventa.
 * La bandeja de `GET workflow/my-pending` **hoy no trae importe** —el
 * `WorkflowInstance` no lo guarda—, así que casi todas las fichas dirán «—» en
 * esa celda. Es incómodo y es correcto: el día que el backend lo mande, la cifra
 * aparece sola.
 *
 * Sin Android ni Compose: se prueba entera en la JVM (`AprobacionesRulesTest`).
 */
object AprobacionesRules {

    /** La zona en la que trabaja la gente; con ella se decide qué día fue un instante. */
    val ZONA: ZoneId = ZoneId.of("America/Mexico_City")

    /** Lo que se escribe cuando el dato no se puede leer. Nunca un cero fingido. */
    const val SIN_DATO = "—"

    // ── Dinero ───────────────────────────────────────────────────────────────

    /**
     * Importe del API → centavos. `null` si no es un número.
     *
     * Gemela de `CotizacionesRules.centavos` y `PagosRules.centavos`, y con el
     * mismo redondeo `HALF_UP` que el `Math.round(n * 100)` del servidor, para
     * que los dos lados digan la misma cifra. Está repetida y no compartida por
     * el mismo motivo que allí: el día que alguien las junte, su casa es
     * [Dinero] —el formateador único de pesos de la app— y no las reglas de un
     * módulo; las pruebas de las tres fijan el mismo comportamiento, así que una
     * divergencia se cae en rojo y no en una autorización.
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

    /** El importe listo para leer: `"$12,345.67"`, o [SIN_DATO] si no hay cifra. */
    fun pesos(valor: String?): String = centavos(valor)?.let { Dinero.pesos(it) } ?: SIN_DATO

    /**
     * Cuánto vale la solicitud, en centavos. `null` cuando el API no lo manda,
     * que hoy es siempre.
     *
     * Se miran los dos nombres con los que el servidor nombra un importe en el
     * resto del módulo (`amount` en gastos y viáticos, `total` en cotizaciones);
     * el primero que se pueda leer gana.
     */
    fun centavosDe(dto: AprobacionPendienteDto): Long? {
        val instancia = dto.instance ?: return null
        return centavos(instancia.amount) ?: centavos(instancia.total)
    }

    // ── Tipo de entidad ──────────────────────────────────────────────────────

    /**
     * Qué se está autorizando, en español.
     *
     * Las claves son las mismas de `entityApprovalHref` en
     * `apps/web/lib/workflow-api.ts` más las que produce `buildEntityContext`
     * del servicio. Lo desconocido se capitaliza en vez de gritarse en
     * mayúsculas: `SOMETHING_NEW` se lee «Something_new», feo pero honesto, y
     * no «Solicitud», que escondería de qué se trata.
     */
    private val ETIQUETA_ENTIDAD = mapOf(
        "PURCHASE_ORDER" to "Orden de compra",
        "PURCHASE_REQUISITION" to "Requisición",
        "REQUISITION" to "Requisición",
        "EXPENSE" to "Gasto",
        "VIATIC" to "Viático",
        "VIATICS" to "Viático",
        "QUOTE" to "Cotización",
        "COTIZACION" to "Cotización",
        "DISCOUNT" to "Descuento",
        "HIRING" to "Contratación",
        "VACATION" to "Vacaciones",
        "CONTRACT" to "Contrato",
        "MAINTENANCE_CONTRACT" to "Contrato",
        "PROJECT" to "Proyecto",
        "SALES_PROJECT" to "Proyecto",
        "OPPORTUNITY" to "Oportunidad",
    )

    fun etiquetaTipo(tipo: String?): String {
        val crudo = tipo?.trim().orEmpty()
        if (crudo.isEmpty()) return "Solicitud"
        ETIQUETA_ENTIDAD[crudo.uppercase(ESPANOL)]?.let { return it }
        return crudo.lowercase(ESPANOL).replaceFirstChar { it.uppercase() }
    }

    /**
     * Nombre legible del aprobador de un paso: la persona si el paso nombra una,
     * y si no el rol. Los dos nunca vienen a la vez.
     */
    fun etiquetaAprobador(paso: WfPasoDto?): String {
        if (paso == null) return "Aprobador"
        paso.approverUser?.nombre?.trim()?.ifEmpty { null }?.let { return it }
        paso.approverRole?.nombre?.trim()?.ifEmpty { null }?.let { return it }
        return paso.name?.trim()?.ifEmpty { null } ?: "Aprobador"
    }

    // ── Fechas ───────────────────────────────────────────────────────────────

    /**
     * Un **instante** del API (`createdAt`) como el día que fue en México.
     *
     * Hay que pasar por la zona sí o sí: una solicitud hecha a las 19:00 de un
     * martes se guarda como `01:00Z` del miércoles, y quedarse con el texto
     * diría que llegó al día siguiente. Medianoche en Greenwich es el día
     * anterior aquí.
     */
    fun instante(iso: String?): Instant? {
        val texto = iso?.trim()?.takeIf { it.isNotEmpty() && it != "null" } ?: return null
        return runCatching { Instant.parse(texto) }.getOrNull()
            ?: runCatching { OffsetDateTime.parse(texto).toInstant() }.getOrNull()
    }

    /**
     * Cuándo llegó, en palabras: `"Hoy 18:30"`, `"Ayer 09:05"`, `"14 sep 09:15"`.
     *
     * La hora solo importa dentro de las últimas 48 h, que es cuando alguien
     * pregunta «¿esto llegó antes o después de la junta?». Más atrás sobra.
     */
    fun recibidaTexto(
        iso: String?,
        ahora: Instant = Instant.now(),
        zona: ZoneId = ZONA,
    ): String {
        val momento = instante(iso) ?: return SIN_DATO
        val cuando: ZonedDateTime = momento.atZone(zona)
        val hoy = ahora.atZone(zona).toLocalDate()
        val dia = cuando.toLocalDate()
        val hora = cuando.format(FORMATO_HORA)
        return when (dia) {
            hoy -> "Hoy $hora"
            hoy.minusDays(1) -> "Ayer $hora"
            else -> "${cuando.format(FORMATO_CORTO)} $hora"
        }
    }

    /** Horas completas que lleva parada la solicitud. `null` si no trae fecha. */
    fun horasEsperando(iso: String?, ahora: Instant = Instant.now()): Long? {
        val momento = instante(iso) ?: return null
        val horas = ChronoUnit.HOURS.between(momento, ahora)
        return if (horas < 0L) 0L else horas
    }

    /**
     * A partir de cuándo una pendiente se considera atrasada.
     *
     * Dos días. No sale de ninguna política escrita: sale de que el `timeout`
     * más corto que configura `workflow-seed.service.ts` es de 48 h, así que
     * pasado ese punto la solicitud ya está en riesgo de escalar sola.
     */
    const val HORAS_ATRASADA = 48L

    fun estaAtrasada(horas: Long?): Boolean = horas != null && horas >= HORAS_ATRASADA

    /** «Llegó hace un momento» · «Lleva 5 h parada» · «Lleva 3 días parada». */
    fun esperaTexto(horas: Long?): String = when {
        horas == null -> "Sin fecha de solicitud"
        horas < 1L -> "Llegó hace un momento"
        horas == 1L -> "Lleva 1 h parada"
        horas < 24L -> "Lleva $horas h parada"
        horas < 48L -> "Lleva 1 día parada"
        else -> "Lleva ${horas / 24L} días parada"
    }

    // ── La cadena de pasos ───────────────────────────────────────────────────

    enum class EstadoPaso { APROBADO, RECHAZADO, PENDIENTE, EN_ESPERA }

    data class PasoCadena(
        val numero: Int,
        val nombre: String,
        val aprobador: String,
        val estado: EstadoPaso,
        /** El paso que te toca a ti. Solo puede haber uno. */
        val esElTuyo: Boolean,
        /** Quién lo decidió, cuando ya está decidido. */
        val decidioNombre: String? = null,
    )

    /**
     * Quién ya firmó, dónde estás tú y quién falta.
     *
     * Sin esto, «Paso 2 de 3» no dice si el de arriba revisó de verdad o si la
     * solicitud se saltó un eslabón. Un paso sin aprobación creada todavía está
     * [EstadoPaso.EN_ESPERA]: el servidor las crea de una en una según avanza.
     */
    fun cadena(dto: AprobacionPendienteDto): List<PasoCadena> {
        val instancia = dto.instance ?: return emptyList()
        val pasos = instancia.workflow?.steps.orEmpty().sortedBy { it.stepNumber ?: 0 }
        if (pasos.isEmpty()) return emptyList()

        val porPaso = instancia.approvals.orEmpty().associateBy { it.stepId }
        return pasos.mapIndexed { indice, paso ->
            val aprobacion = porPaso[paso.id]
            PasoCadena(
                numero = paso.stepNumber ?: (indice + 1),
                nombre = paso.name?.trim()?.ifEmpty { null } ?: "Paso ${indice + 1}",
                aprobador = etiquetaAprobador(paso),
                estado = when (aprobacion?.status?.trim()?.uppercase(ESPANOL)) {
                    "APPROVED" -> EstadoPaso.APROBADO
                    "REJECTED" -> EstadoPaso.RECHAZADO
                    "PENDING" -> EstadoPaso.PENDIENTE
                    else -> EstadoPaso.EN_ESPERA
                },
                esElTuyo = aprobacion != null && aprobacion.id == dto.id,
                decidioNombre = aprobacion?.decidedBy?.nombre?.trim()?.ifEmpty { null },
            )
        }
    }

    // ── La fila que se pinta ─────────────────────────────────────────────────

    data class Pendiente(
        val aprobacionId: Long,
        val instanciaId: Long,
        /** QUÉ: «Gasto», «Viático», «Orden de compra». */
        val tipo: String,
        /** Titular: «Gasto #482». */
        val titulo: String,
        /** El flujo configurado: «Autorización de gastos». */
        val flujo: String,
        /** «Paso 2 de 3 · Autorización Dirección». */
        val paso: String,
        /** Al firmar tú se cierra el flujo: no queda nadie después. */
        val cierraElFlujo: Boolean,
        /** DE QUIÉN. */
        val solicita: String,
        val solicitaRol: String,
        /** CUÁNTO, ya formateado. [SIN_DATO] cuando el API no manda importe. */
        val importe: String,
        val importeCentavos: Long?,
        val recibida: String,
        val horasEsperando: Long?,
        val atrasada: Boolean,
        val esperaTexto: String,
        val cadena: List<PasoCadena>,
    ) {
        /** Clave estable de lista: la aprobación es única por paso e instancia. */
        val clave: String get() = "aprobacion-$aprobacionId"
    }

    fun aPendiente(
        dto: AprobacionPendienteDto,
        ahora: Instant = Instant.now(),
        zona: ZoneId = ZONA,
    ): Pendiente {
        val instancia = dto.instance
        val tipo = etiquetaTipo(instancia?.entityType ?: instancia?.workflow?.entityType)
        val cadena = cadena(dto)

        val miPaso = dto.step?.stepNumber ?: instancia?.currentStep
        val total = cadena.size.takeIf { it > 0 } ?: instancia?.workflow?.steps?.size ?: 0
        val nombrePaso = dto.step?.name?.trim()?.ifEmpty { null } ?: etiquetaAprobador(dto.step)
        val horas = horasEsperando(dto.createdAt, ahora)

        return Pendiente(
            aprobacionId = dto.id,
            instanciaId = instancia?.id ?: 0L,
            tipo = tipo,
            titulo = instancia?.entityId?.let { "$tipo #$it" } ?: tipo,
            flujo = instancia?.workflow?.name?.trim()?.ifEmpty { null } ?: tipo,
            paso = when {
                miPaso != null && total > 0 -> "Paso $miPaso de $total · $nombrePaso"
                miPaso != null -> "Paso $miPaso · $nombrePaso"
                else -> nombrePaso
            },
            // Sin saber cuántos pasos hay no se puede afirmar que cierras el
            // flujo, y prometerlo de más sería el error caro.
            cierraElFlujo = total > 0 && miPaso != null && miPaso >= total,
            solicita = instancia?.startedBy?.nombre?.trim()?.ifEmpty { null } ?: "Sin solicitante",
            solicitaRol = instancia?.startedBy?.role?.nombre?.trim()?.ifEmpty { null } ?: SIN_DATO,
            importe = centavosDe(dto)?.let { Dinero.pesos(it) } ?: SIN_DATO,
            importeCentavos = centavosDe(dto),
            recibida = recibidaTexto(dto.createdAt, ahora, zona),
            horasEsperando = horas,
            atrasada = estaAtrasada(horas),
            esperaTexto = esperaTexto(horas),
            cadena = cadena,
        )
    }

    /**
     * Lo que lleva más tiempo parado, primero.
     *
     * El servidor ya ordena por `createdAt` ascendente, y aquí se hace
     * explícito porque la bandeja se reconstruye tras cada decisión: si alguna
     * vez cambiara el orden del API, la lista no se reordenaría bajo el dedo de
     * quien está firmando. Lo que no trae fecha se va al final, no al principio:
     * sin fecha no se puede afirmar que es lo más urgente.
     */
    fun ordenadas(
        dtos: List<AprobacionPendienteDto>,
        ahora: Instant = Instant.now(),
        zona: ZoneId = ZONA,
    ): List<Pendiente> = dtos
        .map { aPendiente(it, ahora, zona) }
        .sortedWith(
            compareByDescending<Pendiente> { it.horasEsperando ?: -1L }
                .thenBy { it.aprobacionId },
        )

    // ── Filtros ──────────────────────────────────────────────────────────────

    /**
     * Los filtros, por lo que se hace con cada grupo y no por un estado:
     *
     * - **Atrasadas**: llevan más de dos días paradas. Es lo primero que hay que
     *   destrabar y lo que alguien ya vino a preguntar.
     * - **Cierran contigo**: tu firma acaba el flujo. Pesan más que las demás,
     *   porque después de ti no queda nadie que lo revise.
     */
    enum class Filtro(val etiqueta: String) {
        TODAS("Todas"),
        ATRASADAS("Atrasadas"),
        CIERRAN("Cierran contigo"),
    }

    fun cumple(fila: Pendiente, filtro: Filtro): Boolean = when (filtro) {
        Filtro.TODAS -> true
        Filtro.ATRASADAS -> fila.atrasada
        Filtro.CIERRAN -> fila.cierraElFlujo
    }

    fun aplicar(filas: List<Pendiente>, filtro: Filtro): List<Pendiente> =
        filas.filter { cumple(it, filtro) }

    fun conteos(filas: List<Pendiente>): Map<Filtro, Int> =
        Filtro.entries.associateWith { filtro -> filas.count { cumple(it, filtro) } }

    fun colorDeFiltro(filtro: Filtro): Long? = when (filtro) {
        Filtro.ATRASADAS -> ROJO
        Filtro.CIERRAN -> AMBAR
        Filtro.TODAS -> null
    }

    // ── Tira de cifras ───────────────────────────────────────────────────────

    data class Cifras(
        val pendientes: Int,
        val cierranContigo: Int,
        val atrasadas: Int,
        /** Suma de lo que SÍ trae importe. */
        val importeCentavos: Long,
        val conImporte: Int,
    )

    fun cifras(filas: List<Pendiente>): Cifras {
        val importes = filas.mapNotNull { it.importeCentavos }
        return Cifras(
            pendientes = filas.size,
            cierranContigo = filas.count { it.cierraElFlujo },
            atrasadas = filas.count { it.atrasada },
            importeCentavos = importes.sum(),
            conImporte = importes.size,
        )
    }

    /**
     * Las celdas de arriba. Lista vacía = **no se pinta la tira** (regla 7).
     *
     * La condición es el **conteo real de filas**, no que las cifras den cero:
     * una bandeja con tres pendientes y ninguna atrasada SÍ enseña la tira —«0
     * atrasadas» es información y es justo lo que alguien quiere confirmar—,
     * mientras que una bandeja vacía no, porque cuatro ceros encima de un «no
     * hay nada esperándote» ocupan el sitio de la única frase que ayuda ahí.
     *
     * La celda de importe solo aparece si alguna fila trae cifra. Hoy el API no
     * manda importes en `my-pending`, así que normalmente no saldrá: una celda
     * que siempre dice «—» no es un dato, es un hueco.
     */
    fun metricas(filas: List<Pendiente>): List<NxMetric> {
        if (filas.isEmpty()) return emptyList()
        val c = cifras(filas)
        return buildList {
            add(
                NxMetric(
                    clave = METRICA_PENDIENTES,
                    etiqueta = "Pendientes",
                    valor = c.pendientes.toString(),
                    pista = if (c.pendientes == 1) "espera tu firma" else "esperan tu firma",
                ),
            )
            add(
                NxMetric(
                    clave = METRICA_CIERRAN,
                    etiqueta = "Cierran contigo",
                    valor = c.cierranContigo.toString(),
                    pista = if (c.cierranContigo == 0) "ninguna es la última" else "último paso del flujo",
                    // Color solo donde pide acción (regla 6).
                    color = AMBAR.takeIf { c.cierranContigo > 0 },
                ),
            )
            add(
                NxMetric(
                    clave = METRICA_ATRASADAS,
                    etiqueta = "Atrasadas",
                    valor = c.atrasadas.toString(),
                    pista = if (c.atrasadas == 0) "nada parado" else "más de 2 días",
                    color = ROJO.takeIf { c.atrasadas > 0 },
                ),
            )
            if (c.conImporte > 0) {
                add(
                    NxMetric(
                        clave = METRICA_IMPORTE,
                        etiqueta = "Importe",
                        valor = Dinero.pesos(c.importeCentavos),
                        pista = if (c.conImporte == c.pendientes) {
                            "suma de todas"
                        } else {
                            "solo ${c.conImporte} traen cifra"
                        },
                    ),
                )
            }
        }
    }

    /** Qué filtro pone cada celda de la tira, para que tocarla filtre en el sitio. */
    fun filtroDeMetrica(clave: String): Filtro? = when (clave) {
        METRICA_ATRASADAS -> Filtro.ATRASADAS
        METRICA_CIERRAN -> Filtro.CIERRAN
        else -> null
    }

    /** Y al revés: qué celda queda marcada con el filtro puesto. */
    fun metricaDeFiltro(filtro: Filtro): String? = when (filtro) {
        Filtro.ATRASADAS -> METRICA_ATRASADAS
        Filtro.CIERRAN -> METRICA_CIERRAN
        Filtro.TODAS -> null
    }

    // ── Decidir ──────────────────────────────────────────────────────────────

    /** Lo mínimo que se acepta como motivo de rechazo, en caracteres. */
    const val MINIMO_MOTIVO = 4

    /**
     * Rechazar **cancela la instancia entera** y le llega una notificación al
     * solicitante con el motivo. Un «no» sin explicación obliga a esa persona a
     * ir a preguntar, así que el motivo es obligatorio. Aprobar no lo pide: es
     * la acción que la persona vino a hacer.
     */
    fun motivoValido(motivo: String?): Boolean =
        (motivo?.trim()?.length ?: 0) >= MINIMO_MOTIVO

    /**
     * Qué se le dice a quien acaba de decidir.
     *
     * No basta con «listo»: el servidor hace tres cosas distintas y quien firma
     * tiene derecho a saber cuál ocurrió. Se cree a la respuesta antes que a la
     * intención —si se pidió aprobar y el servidor contesta `cancelled`, mandó
     * el servidor—, porque es él quien acaba de escribir en la base.
     */
    fun mensajeDeDecision(aprobado: Boolean, respuesta: DecisionRespuestaDto): String = when {
        !aprobado || respuesta.cancelled ->
            "Rechazada. La solicitud queda cancelada y el solicitante ya fue avisado."
        respuesta.nextStep != null -> "Aprobada. Pasa al paso ${respuesta.nextStep}."
        respuesta.complete -> "Aprobada. El flujo queda cerrado."
        else -> "Aprobada."
    }

    // ── Constantes ───────────────────────────────────────────────────────────

    const val METRICA_PENDIENTES = "pendientes"
    const val METRICA_CIERRAN = "cierran"
    const val METRICA_ATRASADAS = "atrasadas"
    const val METRICA_IMPORTE = "importe"

    /** ARGB, igual que en `PagosRules`: el color no entra en las pruebas de la JVM. */
    const val AMBAR = 0xFFD97706L
    const val ROJO = 0xFFDC2626L
    const val VERDE = 0xFF16A34AL
    const val GRIS = 0xFF94A3B8L

    private val ESPANOL: Locale = Locale.forLanguageTag("es-MX")
    private val FORMATO_CORTO = DateTimeFormatter.ofPattern("d MMM", ESPANOL)
    private val FORMATO_HORA = DateTimeFormatter.ofPattern("HH:mm", ESPANOL)
}
