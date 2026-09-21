package mx.nexara.mobile.nativeapp.ui.console.cotizaciones

import com.squareup.moshi.Moshi
import com.squareup.moshi.Types
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import java.time.LocalDate
import mx.nexara.mobile.nativeapp.data.api.CotizacionDetalleDto
import mx.nexara.mobile.nativeapp.data.api.CotizacionGrupoDto
import mx.nexara.mobile.nativeapp.data.api.CotizacionPartidaDto
import mx.nexara.mobile.nativeapp.data.api.CotizacionPersonaDto
import mx.nexara.mobile.nativeapp.data.api.CotizacionResumenDto
import mx.nexara.mobile.nativeapp.data.api.CotizacionParticipanteDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * En cotizaciones lo que no puede fallar es **el dinero** y **el estado**: de
 * ahí salen la cifra que se enseña, el filtro en el que cae cada una y el aviso
 * de la que está por vencer.
 *
 * La trampa que vigila la mitad de estas pruebas es la forma en que viaja un
 * `Decimal` de Prisma: `GET cotizaciones/core` lo manda como número JSON
 * (`Number(quote.total)`) y `GET cotizaciones/core/:id` lo reexpone como texto
 * (`"14500.5"`), porque `presentar` devuelve la fila tal cual. Un DTO que
 * declarara `Double?` reventaría con el segundo, y uno que redondeara con
 * `toDouble()` a secas perdería centavos.
 */
class CotizacionesRulesTest {

    private fun cotizacion(
        id: Long = 1L,
        folio: String? = "NEX-LJ75100126-0007",
        estado: String? = "ENVIADA",
        estadoEtiqueta: String? = null,
        total: String? = "14500.50",
        currency: String? = "MXN",
        clienteNombre: String? = "Ing. Pérez",
        clienteEmpresa: String? = "Bachoco",
        projectName: String? = "CCTV planta 2",
        segmentoEtiqueta: String? = "Comercial",
        createdAt: String? = "2026-09-10T12:00:00.000Z",
        sentAt: String? = "2026-09-11T12:00:00.000Z",
        validUntil: String? = null,
        revision: Int? = 1,
        elaboro: CotizacionPersonaDto? = CotizacionPersonaDto(id = 7L, nombre = "Ana López", siglas = "AL"),
        intervinieron: List<CotizacionParticipanteDto>? = null,
    ) = CotizacionResumenDto(
        id = id,
        folio = folio,
        estado = estado,
        estadoEtiqueta = estadoEtiqueta,
        total = total,
        currency = currency,
        clienteNombre = clienteNombre,
        clienteEmpresa = clienteEmpresa,
        projectName = projectName,
        segmentoEtiqueta = segmentoEtiqueta,
        createdAt = createdAt,
        sentAt = sentAt,
        validUntil = validUntil,
        revision = revision,
        elaboro = elaboro,
        intervinieron = intervinieron,
    )

    // ── Estado ───────────────────────────────────────────────────────────────

    @Test
    fun theStateIsReadInSpanishAndAlsoInTheDatabaseEnum() {
        assertEquals(CotizacionesRules.Estado.BORRADOR, CotizacionesRules.estado("BORRADOR"))
        assertEquals(CotizacionesRules.Estado.ENVIADA, CotizacionesRules.estado("enviada"))
        assertEquals(CotizacionesRules.Estado.APROBADA, CotizacionesRules.estado("APROBADA"))
        // El enum de Postgres, por si una cotización llega por otra ruta.
        assertEquals(CotizacionesRules.Estado.BORRADOR, CotizacionesRules.estado("DRAFT"))
        assertEquals(CotizacionesRules.Estado.ENVIADA, CotizacionesRules.estado("SENT"))
        assertEquals(CotizacionesRules.Estado.VENCIDA, CotizacionesRules.estado("EXPIRED"))
        // Lo que no se entiende no se inventa como «Borrador»: se marca aparte.
        assertEquals(CotizacionesRules.Estado.DESCONOCIDO, CotizacionesRules.estado("LO_QUE_SEA"))
        assertEquals(CotizacionesRules.Estado.DESCONOCIDO, CotizacionesRules.estado(null))
    }

    @Test
    fun theServerLabelWinsOverOurs() {
        assertEquals("Enviada", CotizacionesRules.etiquetaEstado(cotizacion()))
        assertEquals(
            "Enviada al cliente",
            CotizacionesRules.etiquetaEstado(cotizacion(estadoEtiqueta = "Enviada al cliente")),
        )
        // Una etiqueta en blanco no es una etiqueta.
        assertEquals("Enviada", CotizacionesRules.etiquetaEstado(cotizacion(estadoEtiqueta = "   ")))
    }

    // ── Dinero ───────────────────────────────────────────────────────────────

    @Test
    fun amountsAreReadAsCentsWhicheverWayTheyTravel() {
        // Como texto (detalleCore) y como número ya convertido a texto por Moshi
        // (listaCore): las dos formas tienen que dar los mismos centavos.
        assertEquals(1_450_050L, CotizacionesRules.centavos("14500.50"))
        assertEquals(1_450_050L, CotizacionesRules.centavos("14500.5"))
        assertEquals(1_450_000L, CotizacionesRules.centavos("14500"))
        // Notación científica: `Number.prototype.toString` la usa con cifras grandes.
        assertEquals(100_000_000_000L, CotizacionesRules.centavos("1e9"))
        // Medio centavo redondea hacia arriba, igual que `Math.round` del servidor.
        assertEquals(1_235L, CotizacionesRules.centavos("12.345"))
    }

    @Test
    fun anAmountThatIsNotThereIsNeverAZero() {
        assertNull(CotizacionesRules.centavos(null))
        assertNull(CotizacionesRules.centavos(""))
        assertNull(CotizacionesRules.centavos("   "))
        assertNull(CotizacionesRules.centavos("null"))
        assertNull(CotizacionesRules.centavos("catorce mil"))
        assertEquals("—", CotizacionesRules.pesos(null))
        assertEquals("—", CotizacionesRules.pesos("no es un número"))
    }

    @Test
    fun pesosUseTheSameFormatterAsTheRestOfTheApp() {
        assertEquals("$14,500.50", CotizacionesRules.pesos("14500.50"))
        assertEquals("$1,234,567.89", CotizacionesRules.pesos("1234567.89"))
        assertEquals("$0.00", CotizacionesRules.pesos("0"))
    }

    @Test
    fun theCurrencyOnlyShowsWhenItIsNotThePeso() {
        assertEquals("$14,500.50", CotizacionesRules.montoTexto(cotizacion()))
        assertEquals("$14,500.50", CotizacionesRules.montoTexto(cotizacion(currency = null)))
        assertEquals("$14,500.50 USD", CotizacionesRules.montoTexto(cotizacion(currency = "usd")))
        // Sin cifra no hay moneda que poner al lado.
        assertEquals("—", CotizacionesRules.montoTexto(cotizacion(total = null, currency = "USD")))
    }

    @Test
    fun theTwoFiguresOnTopCountOnlyWhatTheySay() {
        val lista = listOf(
            cotizacion(id = 1L, estado = "ENVIADA", total = "1000"),
            cotizacion(id = 2L, estado = "ENVIADA", total = "500.25"),
            cotizacion(id = 3L, estado = "APROBADA", total = "2000"),
            cotizacion(id = 4L, estado = "BORRADOR", total = "9999"),
            // Sin importe legible: no suma, pero tampoco desaparece de la cuenta.
            cotizacion(id = 5L, estado = "ENVIADA", total = null),
        )
        val cifras = CotizacionesRules.cifras(lista)
        assertEquals(150_025L, cifras.porCerrarCentavos)
        assertEquals(3, cifras.porCerrar)
        assertEquals(200_000L, cifras.aprobadoCentavos)
        assertEquals(1, cifras.aprobadas)
    }

    // ── Filtros y búsqueda ───────────────────────────────────────────────────

    @Test
    fun eachStateFallsInItsOwnFilterAndLostOnesGoTogether() {
        val borrador = cotizacion(estado = "BORRADOR")
        val enviada = cotizacion(estado = "ENVIADA")
        val aprobada = cotizacion(estado = "APROBADA")
        val rechazada = cotizacion(estado = "RECHAZADA")
        val vencida = cotizacion(estado = "VENCIDA")

        assertTrue(CotizacionesRules.cumple(enviada, CotizacionesRules.Filtro.POR_CERRAR))
        assertFalse(CotizacionesRules.cumple(borrador, CotizacionesRules.Filtro.POR_CERRAR))
        assertTrue(CotizacionesRules.cumple(borrador, CotizacionesRules.Filtro.BORRADORES))
        assertTrue(CotizacionesRules.cumple(aprobada, CotizacionesRules.Filtro.APROBADAS))
        // Rechazada y vencida son la misma noticia: no se cobró.
        assertTrue(CotizacionesRules.cumple(rechazada, CotizacionesRules.Filtro.PERDIDAS))
        assertTrue(CotizacionesRules.cumple(vencida, CotizacionesRules.Filtro.PERDIDAS))
        assertFalse(CotizacionesRules.cumple(aprobada, CotizacionesRules.Filtro.PERDIDAS))
        // «Todas» no filtra nada, ni siquiera lo que no se entiende.
        assertTrue(CotizacionesRules.cumple(cotizacion(estado = "?"), CotizacionesRules.Filtro.TODAS))
    }

    @Test
    fun theCountsOnThePillsAddUp() {
        val lista = listOf(
            cotizacion(id = 1L, estado = "ENVIADA"),
            cotizacion(id = 2L, estado = "ENVIADA"),
            cotizacion(id = 3L, estado = "BORRADOR"),
            cotizacion(id = 4L, estado = "RECHAZADA"),
            cotizacion(id = 5L, estado = "VENCIDA"),
        )
        val conteos = CotizacionesRules.conteos(lista)
        assertEquals(5, conteos[CotizacionesRules.Filtro.TODAS])
        assertEquals(2, conteos[CotizacionesRules.Filtro.POR_CERRAR])
        assertEquals(1, conteos[CotizacionesRules.Filtro.BORRADORES])
        assertEquals(0, conteos[CotizacionesRules.Filtro.APROBADAS])
        assertEquals(2, conteos[CotizacionesRules.Filtro.PERDIDAS])
    }

    @Test
    fun searchFindsByFolioClientAndTheInitialsOfWhoTookPart() {
        val row = cotizacion(
            intervinieron = listOf(
                CotizacionParticipanteDto(userId = 9L, nombre = "Juan Aguilar", siglas = "JA", rol = "REVISO"),
            ),
        )
        assertTrue(CotizacionesRules.coincide(row, ""))
        assertTrue(CotizacionesRules.coincide(row, "0007"))
        assertTrue(CotizacionesRules.coincide(row, "bachoco"))
        assertTrue(CotizacionesRules.coincide(row, "Pérez"))
        assertTrue(CotizacionesRules.coincide(row, "CCTV"))
        assertTrue(CotizacionesRules.coincide(row, "ana"))
        // Las siglas del folio son la forma corta de buscar a quien la revisó.
        assertTrue(CotizacionesRules.coincide(row, "ja"))
        assertTrue(CotizacionesRules.coincide(row, "Juan Aguilar"))
        assertFalse(CotizacionesRules.coincide(row, "Telmex"))
    }

    @Test
    fun theListKeepsTheServerOrderMostRecentFirst() {
        val vieja = cotizacion(id = 1L, createdAt = "2026-08-01T10:00:00.000Z")
        val nueva = cotizacion(id = 2L, createdAt = "2026-09-20T10:00:00.000Z")
        val sinFecha = cotizacion(id = 99L, createdAt = null)
        val ordenadas = CotizacionesRules.ordenar(listOf(vieja, sinFecha, nueva))
        assertEquals(listOf(2L, 1L, 99L), ordenadas.map { it.id })
    }

    @Test
    fun applyingFilterAndSearchTogetherLeavesOnlyWhatShouldShow() {
        val lista = listOf(
            cotizacion(id = 1L, estado = "ENVIADA", clienteEmpresa = "Bachoco"),
            cotizacion(id = 2L, estado = "ENVIADA", clienteEmpresa = "Telmex"),
            cotizacion(id = 3L, estado = "BORRADOR", clienteEmpresa = "Bachoco"),
        )
        val visibles = CotizacionesRules.aplicar(lista, CotizacionesRules.Filtro.POR_CERRAR, "bachoco")
        assertEquals(listOf(1L), visibles.map { it.id })
    }

    // ── Vigencia ─────────────────────────────────────────────────────────────

    @Test
    fun onlyASentQuoteWarnsAboutItsDeadline() {
        val hoy = LocalDate.of(2026, 9, 21)
        // Un borrador no ha salido: su vigencia no significa nada todavía.
        assertNull(
            CotizacionesRules.vigenciaTexto(
                cotizacion(estado = "BORRADOR", validUntil = "2026-09-22"),
                hoy,
            ),
        )
        // Una aprobada ya se cerró: avisar de que «vence» sería alarmar por nada.
        assertNull(
            CotizacionesRules.vigenciaTexto(
                cotizacion(estado = "APROBADA", validUntil = "2026-09-22"),
                hoy,
            ),
        )
        // Sin fecha de vigencia tampoco hay nada que decir.
        assertNull(CotizacionesRules.vigenciaTexto(cotizacion(validUntil = null), hoy))
    }

    @Test
    fun theDeadlineIsSaidInDaysAndOnlyWhenItIsClose() {
        val hoy = LocalDate.of(2026, 9, 21)
        fun texto(validUntil: String?) =
            CotizacionesRules.vigenciaTexto(cotizacion(validUntil = validUntil), hoy)

        assertEquals("Vence hoy", texto("2026-09-21"))
        assertEquals("Vence mañana", texto("2026-09-22"))
        assertEquals("Vence en 5 días", texto("2026-09-26"))
        assertEquals("Vence en 7 días", texto("2026-09-28"))
        // Más allá de una semana no urge, y un aviso permanente deja de leerse.
        assertNull(texto("2026-09-29"))
        assertEquals("Venció ayer", texto("2026-09-20"))
        assertEquals("Venció hace 3 días", texto("2026-09-18"))
    }

    @Test
    fun onlyAnExpiredOrTodayDeadlineIsAProblem() {
        val hoy = LocalDate.of(2026, 9, 21)
        assertTrue(CotizacionesRules.vigenciaVencida(cotizacion(validUntil = "2026-09-21"), hoy))
        assertTrue(CotizacionesRules.vigenciaVencida(cotizacion(validUntil = "2026-09-01"), hoy))
        assertFalse(CotizacionesRules.vigenciaVencida(cotizacion(validUntil = "2026-09-22"), hoy))
        assertFalse(CotizacionesRules.vigenciaVencida(cotizacion(validUntil = null), hoy))
        assertFalse(
            CotizacionesRules.vigenciaVencida(
                cotizacion(estado = "BORRADOR", validUntil = "2026-09-01"),
                hoy,
            ),
        )
    }

    // ── Fechas ───────────────────────────────────────────────────────────────

    @Test
    fun theDateNeverSlipsADayBecauseOfTheTimeZone() {
        // Emisión y vigencia se guardan a medianoche UTC; leerlas en hora de
        // México las retrasaba un día. Se corta el ISO, no se convierte.
        assertEquals(LocalDate.of(2026, 9, 18), CotizacionesRules.fecha("2026-09-18T00:00:00.000Z"))
        assertEquals(LocalDate.of(2026, 9, 18), CotizacionesRules.fecha("2026-09-18"))
        assertNull(CotizacionesRules.fecha(null))
        assertNull(CotizacionesRules.fecha("mañana"))
        assertNull(CotizacionesRules.fecha("2026-13-45"))
        assertTrue(CotizacionesRules.fechaCorta("2026-09-25")!!.contains("25"))
        assertTrue(CotizacionesRules.fechaLarga("2026-09-25")!!.contains("2026"))
    }

    @Test
    fun theDateShownIsTheOneThatMattersForTheState() {
        // En borrador importa cuándo se creó; en enviada, desde cuándo la tiene
        // el cliente.
        assertTrue(CotizacionesRules.fechaTexto(cotizacion(estado = "BORRADOR"))!!.startsWith("Creada"))
        assertTrue(CotizacionesRules.fechaTexto(cotizacion(estado = "ENVIADA"))!!.startsWith("Enviada"))
        // Enviada sin `sentAt` (datos viejos): se cae a la de creación en vez
        // de dejar el hueco.
        assertTrue(
            CotizacionesRules.fechaTexto(cotizacion(estado = "ENVIADA", sentAt = null))!!
                .startsWith("Creada"),
        )
        assertNull(CotizacionesRules.fechaTexto(cotizacion(sentAt = null, createdAt = null)))
    }

    // ── Textos de la tarjeta ─────────────────────────────────────────────────

    @Test
    fun theClientLineLeadsWithTheCompany() {
        assertEquals("Bachoco · Ing. Pérez", CotizacionesRules.clienteTexto(cotizacion()))
        assertEquals("Bachoco", CotizacionesRules.clienteTexto(cotizacion(clienteNombre = null)))
        assertEquals("Ing. Pérez", CotizacionesRules.clienteTexto(cotizacion(clienteEmpresa = null)))
        // Cuando empresa y contacto son la misma cadena no se repite.
        assertEquals(
            "Bachoco",
            CotizacionesRules.clienteTexto(cotizacion(clienteEmpresa = "Bachoco", clienteNombre = "bachoco")),
        )
        assertEquals(
            "Sin cliente",
            CotizacionesRules.clienteTexto(cotizacion(clienteEmpresa = null, clienteNombre = "  ")),
        )
    }

    @Test
    fun theInitialsFallBackToWhoMadeItButNeverToNobody() {
        // Nadie más intervino: se enseñan las de quien la hizo, que ya van en el folio.
        assertEquals(listOf("AL"), CotizacionesRules.siglas(cotizacion()))
        // Con participantes, sin repetir y en orden.
        val conParticipantes = cotizacion(
            intervinieron = listOf(
                CotizacionParticipanteDto(siglas = "AL", rol = "ELABORO"),
                CotizacionParticipanteDto(siglas = "JA", rol = "REVISO"),
                CotizacionParticipanteDto(siglas = "JA", rol = "ENVIO"),
            ),
        )
        assertEquals(listOf("AL", "JA"), CotizacionesRules.siglas(conParticipantes))
        // Ni autor ni participantes: lista vacía, no una sigla inventada.
        assertTrue(CotizacionesRules.siglas(cotizacion(elaboro = null)).isEmpty())
    }

    @Test
    fun theAuthorLineOnlyMentionsTheRevisionWhenThereIsOne() {
        assertEquals("Elaboró Ana López", CotizacionesRules.autoriaTexto(cotizacion()))
        assertEquals(
            "Elaboró Ana López · revisión 3",
            CotizacionesRules.autoriaTexto(cotizacion(revision = 3)),
        )
        assertNull(CotizacionesRules.autoriaTexto(cotizacion(elaboro = null, revision = 1)))
    }

    @Test
    fun theContextLineJoinsProjectAndSegment() {
        assertEquals("CCTV planta 2 · Comercial", CotizacionesRules.contextoTexto(cotizacion()))
        assertEquals("Comercial", CotizacionesRules.contextoTexto(cotizacion(projectName = null)))
        assertNull(
            CotizacionesRules.contextoTexto(cotizacion(projectName = null, segmentoEtiqueta = null)),
        )
    }

    // ── Detalle ──────────────────────────────────────────────────────────────

    @Test
    fun emptyGroupsNeverGetAHeader() {
        val detalle = CotizacionDetalleDto(
            grupos = listOf(
                CotizacionGrupoDto(grupo = "EQUIPOS", etiqueta = "Equipos", partidas = listOf(CotizacionPartidaDto())),
                CotizacionGrupoDto(grupo = "MATERIALES", etiqueta = "Materiales", partidas = emptyList()),
                CotizacionGrupoDto(grupo = "MANO_DE_OBRA", etiqueta = "Mano de obra", partidas = null),
            ),
        )
        assertEquals(listOf("EQUIPOS"), CotizacionesRules.gruposConPartidas(detalle).map { it.grupo })
        assertEquals(1, CotizacionesRules.totalPartidas(detalle))
        assertTrue(CotizacionesRules.gruposConPartidas(CotizacionDetalleDto()).isEmpty())
    }

    @Test
    fun theGroupLabelComesFromTheServerOrIsTranslatedHere() {
        assertEquals(
            "Mano de obra",
            CotizacionesRules.etiquetaGrupo(CotizacionGrupoDto(grupo = "MANO_DE_OBRA", etiqueta = "Mano de obra")),
        )
        assertEquals(
            "Mano de obra",
            CotizacionesRules.etiquetaGrupo(CotizacionGrupoDto(grupo = "MANO_DE_OBRA")),
        )
        assertEquals("Otros conceptos", CotizacionesRules.etiquetaGrupo(CotizacionGrupoDto()))
    }

    @Test
    fun aQuantityLosesItsDecorativeDecimals() {
        assertEquals("3", CotizacionesRules.numeroTexto("3.00"))
        assertEquals("3", CotizacionesRules.numeroTexto("3"))
        assertEquals("2.5", CotizacionesRules.numeroTexto("2.50"))
        assertEquals("0", CotizacionesRules.numeroTexto("0"))
        assertNull(CotizacionesRules.numeroTexto(null))
        assertNull(CotizacionesRules.numeroTexto("pieza"))
    }

    @Test
    fun theLineItemSaysHowManyTimesHowMuchOrSaysNothing() {
        assertEquals(
            "3 pza × $1,200.00",
            CotizacionesRules.partidaCantidadTexto(
                CotizacionPartidaDto(qty = "3", unit = "pza", unitPrice = "1200"),
            ),
        )
        assertEquals(
            "3 pza",
            CotizacionesRules.partidaCantidadTexto(CotizacionPartidaDto(qty = "3", unit = "pza")),
        )
        assertEquals(
            "$1,200.00",
            CotizacionesRules.partidaCantidadTexto(CotizacionPartidaDto(unitPrice = "1200")),
        )
        // Sin nada que decir, ninguna línea: un renglón vacío ocupa lo mismo que uno útil.
        assertNull(CotizacionesRules.partidaCantidadTexto(CotizacionPartidaDto()))
        assertEquals("—", CotizacionesRules.partidaImporteTexto(CotizacionPartidaDto()))
    }

    @Test
    fun theLineItemAlwaysHasSomethingToCallItself() {
        assertEquals(
            "Cámara bullet 4MP",
            CotizacionesRules.partidaTitulo(CotizacionPartidaDto(name = "Cámara bullet 4MP")),
        )
        assertEquals("CCTV", CotizacionesRules.partidaTitulo(CotizacionPartidaDto(name = " ", category = "CCTV")))
        assertEquals("Concepto sin nombre", CotizacionesRules.partidaTitulo(CotizacionPartidaDto()))
    }

    @Test
    fun aRejectionAlwaysExplainsItselfEvenWhenNobodyWroteWhy() {
        assertNull(CotizacionesRules.rechazoTexto(CotizacionDetalleDto(estado = "ENVIADA")))
        assertEquals(
            "Ing. Pérez la rechazó: precio fuera de presupuesto",
            CotizacionesRules.rechazoTexto(
                CotizacionDetalleDto(
                    estado = "RECHAZADA",
                    rejectedReason = "precio fuera de presupuesto",
                    rejectedByName = "Ing. Pérez",
                ),
            ),
        )
        assertEquals(
            "Rechazada sin motivo registrado.",
            CotizacionesRules.rechazoTexto(CotizacionDetalleDto(estado = "RECHAZADA")),
        )
    }

    @Test
    fun thePdfIsNamedAfterTheFolioSoItCanBeFoundLater() {
        assertEquals("NEX-LJ75100126-0007.pdf", CotizacionesRules.nombreArchivoPdf(482L, "NEX-LJ75100126-0007"))
        // Un folio con caracteres que no caben en un nombre de archivo se limpia.
        assertEquals("NEX-2026-7-R2.pdf", CotizacionesRules.nombreArchivoPdf(482L, "NEX/2026 7 R2"))
        assertEquals("cotizacion-482.pdf", CotizacionesRules.nombreArchivoPdf(482L, null))
        assertEquals("cotizacion-482.pdf", CotizacionesRules.nombreArchivoPdf(482L, "///"))
    }

    // ── El contrato con el servidor ──────────────────────────────────────────

    /** La misma configuración que `ApiClient`: Moshi reflexivo de Kotlin. */
    private val moshi: Moshi = Moshi.Builder().add(KotlinJsonAdapterFactory()).build()

    /**
     * `GET cotizaciones/core` tal como lo arma `listaCore`: los importes salen
     * de `Number(quote.total)`, así que viajan como **número JSON**.
     */
    private val listaCoreJson = """
        [
          {
            "id": 482,
            "folio": "NEX-LJ75100126-0007-JA.CE-R2",
            "conNomenclatura": true,
            "necesitaRefolio": false,
            "folioNomenclatura": "LJ75100126",
            "folioConsecutivo": 7,
            "projectName": "CCTV planta 2",
            "createdAt": "2026-09-10T18:22:11.000Z",
            "updatedAt": "2026-09-11T09:02:00.000Z",
            "clienteNombre": "Ing. Pérez",
            "clienteEmpresa": "Bachoco",
            "segmento": "COMERCIAL",
            "segmentoEtiqueta": "Comercial",
            "estado": "ENVIADA",
            "estadoEtiqueta": "Enviada",
            "total": 14500.5,
            "currency": "MXN",
            "issueDate": "2026-09-11T00:00:00.000Z",
            "validUntil": "2026-10-11T00:00:00.000Z",
            "sentAt": "2026-09-11T09:02:00.000Z",
            "revision": 2,
            "elaboro": { "id": 7, "nombre": "Ana López", "clave": "LJ75100126", "siglas": "AL" },
            "intervinieron": [
              { "userId": 9, "nombre": "Juan Aguilar", "siglas": "JA", "rol": "REVISO" }
            ],
            "actividades": [{ "id": 31, "anNumber": "AN-0031" }]
          }
        ]
    """.trimIndent()

    @Test
    fun theListParsesWithAmountsComingAsJsonNumbers() {
        val tipo = Types.newParameterizedType(List::class.java, CotizacionResumenDto::class.java)
        val filas: List<CotizacionResumenDto>? = moshi.adapter<List<CotizacionResumenDto>>(tipo).fromJson(listaCoreJson)
        val fila = filas?.singleOrNull()
        assertNotNull(fila)
        requireNotNull(fila)

        assertEquals(482L, fila.id)
        assertEquals("NEX-LJ75100126-0007-JA.CE-R2", fila.folio)
        // Lo que esta prueba defiende: el número JSON entra en un `String?` y
        // sale con los centavos exactos.
        assertEquals("14500.5", fila.total)
        assertEquals(1_450_050L, CotizacionesRules.centavos(fila.total))
        assertEquals("$14,500.50", CotizacionesRules.montoTexto(fila))
        assertEquals(CotizacionesRules.Estado.ENVIADA, CotizacionesRules.estadoDe(fila))
        assertEquals("Bachoco · Ing. Pérez", CotizacionesRules.clienteTexto(fila))
        assertEquals(listOf("JA"), CotizacionesRules.siglas(fila))
        assertEquals("Elaboró Ana López · revisión 2", CotizacionesRules.autoriaTexto(fila))
        assertEquals("AN-0031", fila.actividades?.firstOrNull()?.anNumber)
    }

    /**
     * `GET cotizaciones/core/:id` (`detalleCore` → `presentar`): reexpone la
     * fila de Prisma tal cual, así que `subtotal`, `taxTotal`, `total` y los
     * campos de las partidas llegan como **texto** (`Decimal.toJSON()`), y los
     * calculados (`grupos`, `totalesPorGrupo`) como número.
     */
    private val detalleCoreJson = """
        {
          "id": 482,
          "folio": "NEX-LJ75100126-0007-JA.CE-R2",
          "quoteNumber": "NEX-LJ75100126-0007-JA.CE-R2",
          "estado": "ENVIADA",
          "estadoEtiqueta": "Enviada",
          "bloqueada": true,
          "segmento": "COMERCIAL",
          "segmentoEtiqueta": "Comercial",
          "revision": 2,
          "cadenaParticipantes": "JA.CE",
          "clientName": "Ing. Pérez",
          "clientCompany": "Bachoco",
          "projectName": "CCTV planta 2",
          "issueDate": "2026-09-11T00:00:00.000Z",
          "validUntil": "2026-10-11T00:00:00.000Z",
          "sentAt": "2026-09-11T09:02:00.000Z",
          "currency": "MXN",
          "subtotal": "12500.43",
          "taxTotal": "2000.07",
          "total": "14500.50",
          "depositPercent": "50",
          "incluyeInstalacion": true,
          "elaboro": { "id": 7, "nombre": "Ana López", "clave": "LJ75100126", "siglas": "AL" },
          "grupos": [
            {
              "grupo": "EQUIPOS",
              "etiqueta": "Equipos",
              "subtotal": 9600,
              "partidas": [
                {
                  "id": 900,
                  "grupo": "EQUIPOS",
                  "name": "Cámara bullet 4MP",
                  "description": "Con IR de 30 m",
                  "unit": "pza",
                  "qty": 8,
                  "unitPrice": 1200,
                  "laborHours": 0,
                  "laborRate": 0,
                  "lineTotal": 9600,
                  "paqueteClave": null,
                  "paqueteCantidad": null
                }
              ]
            },
            {
              "grupo": "MANO_DE_OBRA",
              "etiqueta": "Mano de obra",
              "subtotal": 2900.43,
              "partidas": [
                {
                  "id": 901,
                  "grupo": "MANO_DE_OBRA",
                  "name": "Instalación y puesta a punto",
                  "unit": "servicio",
                  "qty": 1,
                  "unitPrice": 2900.43,
                  "lineTotal": 2900.43
                }
              ]
            }
          ],
          "totalesPorGrupo": { "EQUIPOS": 9600, "MATERIALES": 0, "MANO_DE_OBRA": 2900.43 },
          "terminos": {
            "modalidad": "SUMINISTRO_E_INSTALACION",
            "titulo": "Términos y condiciones",
            "lineas": ["Vigencia: 30 días naturales…"],
            "partes": [
              { "clave": "vigencia", "titulo": "Vigencia", "texto": "30 días naturales.", "personalizado": false }
            ]
          },
          "participantes": [
            {
              "userId": 9,
              "nombre": "Juan Aguilar",
              "puesto": "Ingeniero de proyectos",
              "clave": "JA88010190",
              "siglas": "JA",
              "rol": "REVISO",
              "rolEtiqueta": "Revisó",
              "at": "2026-09-11T08:40:00.000Z"
            }
          ],
          "actividades": [{ "id": 31, "anNumber": "AN-0031", "titulo": "Levantamiento" }]
        }
    """.trimIndent()

    @Test
    fun theDetailParsesWithAmountsComingAsStrings() {
        val detalle = moshi.adapter(CotizacionDetalleDto::class.java).fromJson(detalleCoreJson)
        assertNotNull(detalle)
        requireNotNull(detalle)

        assertEquals(482L, detalle.id)
        assertEquals(true, detalle.bloqueada)
        // Los `Decimal` que Prisma serializa como texto.
        assertEquals("$12,500.43", CotizacionesRules.pesos(detalle.subtotal))
        assertEquals("$2,000.07", CotizacionesRules.pesos(detalle.taxTotal))
        assertEquals("$14,500.50", CotizacionesRules.pesos(detalle.total))
        // Y los calculados, que llegan como número.
        assertEquals("$9,600.00", CotizacionesRules.pesos(detalle.totalesPorGrupo?.equipos))
        assertEquals("$0.00", CotizacionesRules.pesos(detalle.totalesPorGrupo?.materiales))
        assertEquals("$2,900.43", CotizacionesRules.pesos(detalle.totalesPorGrupo?.manoDeObra))

        val grupos = CotizacionesRules.gruposConPartidas(detalle)
        assertEquals(listOf("Equipos", "Mano de obra"), grupos.map { CotizacionesRules.etiquetaGrupo(it) })
        assertEquals(2, CotizacionesRules.totalPartidas(detalle))

        val camara = grupos.first().partidas!!.first()
        assertEquals("Cámara bullet 4MP", CotizacionesRules.partidaTitulo(camara))
        assertEquals("8 pza × $1,200.00", CotizacionesRules.partidaCantidadTexto(camara))
        assertEquals("$9,600.00", CotizacionesRules.partidaImporteTexto(camara))

        assertEquals("Vigencia", detalle.terminos?.partes?.firstOrNull()?.titulo)
        assertEquals("Revisó", detalle.participantes?.firstOrNull()?.rolEtiqueta)
        assertEquals("Levantamiento", detalle.actividades?.firstOrNull()?.titulo)
    }

    /**
     * Lo que de verdad pasa en campo: el servidor recorta la respuesta (una
     * cotización recién creada, un rol que no ve las partidas) y la pantalla
     * tiene que seguir de pie.
     */
    @Test
    fun anAlmostEmptyPayloadDoesNotBringDownTheScreen() {
        val detalle = moshi.adapter(CotizacionDetalleDto::class.java).fromJson("""{"id": 7}""")
        assertNotNull(detalle)
        requireNotNull(detalle)
        assertEquals("—", CotizacionesRules.pesos(detalle.total))
        assertEquals(CotizacionesRules.Estado.DESCONOCIDO, CotizacionesRules.estado(detalle.estado))
        assertEquals("Sin estado", CotizacionesRules.etiquetaEstado(detalle))
        assertTrue(CotizacionesRules.gruposConPartidas(detalle).isEmpty())
        assertNull(CotizacionesRules.asignacionTexto(detalle))
        assertNull(CotizacionesRules.rechazoTexto(detalle))

        val fila = moshi.adapter(CotizacionResumenDto::class.java).fromJson("""{"id": 7}""")
        requireNotNull(fila)
        assertEquals("Sin cliente", CotizacionesRules.clienteTexto(fila))
        assertEquals("—", CotizacionesRules.montoTexto(fila))
        assertTrue(CotizacionesRules.siglas(fila).isEmpty())
        assertNull(CotizacionesRules.fechaTexto(fila))
        assertNull(CotizacionesRules.vigenciaTexto(fila))
    }
}
