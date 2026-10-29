package mx.nexara.mobile.nativeapp.ui.chat

import mx.nexara.mobile.nativeapp.access.CoreKeys
import mx.nexara.mobile.nativeapp.access.DeepLinkDestination
import mx.nexara.mobile.nativeapp.access.DeepLinkParser
import mx.nexara.mobile.nativeapp.data.api.ChatMentionDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Ligas del chat: mismas rutas y reglas que `apps/web/lib/ligas.ts` y `chat/ligas/ligas.ts` del API. */
class ChatLigasTest {

    // ── Rutas de cada tipo ──────────────────────────────────────────────────

    @Test
    fun `cada ruta de liga se lee con su tipo e id`() {
        assertEquals(LigaParseada(TipoLiga.ACTIVIDAD, 20), ChatLigas.parsearLiga("/erp/actividades/20"))
        assertEquals(
            LigaParseada(TipoLiga.EVIDENCIA, 20, evidenciaId = 7),
            ChatLigas.parsearLiga("/erp/actividades/20/evidencias?evidencia=7"),
        )
        assertEquals(LigaParseada(TipoLiga.EVIDENCIA, 20), ChatLigas.parsearLiga("/erp/actividades/20/evidencias"))
        assertEquals(LigaParseada(TipoLiga.COTIZACION, 12), ChatLigas.parsearLiga("/erp/cotizaciones/12"))
        assertEquals(LigaParseada(TipoLiga.CLIENTE, 5), ChatLigas.parsearLiga("/erp/clientes/5"))
        assertEquals(LigaParseada(TipoLiga.PROYECTO, 3), ChatLigas.parsearLiga("/erp/proyectos/3"))
        assertEquals(
            LigaParseada(TipoLiga.ASISTENCIA, 7, fecha = "2026-10-29"),
            ChatLigas.parsearLiga("/erp/asistencias/indicadores/7?desde=2026-10-29&hasta=2026-10-29"),
        )
        assertEquals(LigaParseada(TipoLiga.VIATICO, 44), ChatLigas.parsearLiga("/erp/finance/viatics?highlight=44"))
        assertEquals(LigaParseada(TipoLiga.FACTURA, 9), ChatLigas.parsearLiga("/erp/invoicing/9"))
    }

    @Test
    fun `lo que no es liga no se lee`() {
        assertNull(ChatLigas.parsearLiga("user:3"))
        assertNull(ChatLigas.parsearLiga("/ops/activities/3"))
        assertNull(ChatLigas.parsearLiga("/erp/actividades/0"))
        assertNull(ChatLigas.parsearLiga("/erp/cotizaciones"))
        // Asistencia sin día y viático sin id no son ligas (el API tampoco las reconoce).
        assertNull(ChatLigas.parsearLiga("/erp/asistencias/indicadores/7"))
        assertNull(ChatLigas.parsearLiga("/erp/finance/viatics"))
        assertNull(ChatLigas.parsearLiga("https://core.nexara.com.mx/erp/actividades/2"))
    }

    // ── Refs de un mensaje ──────────────────────────────────────────────────

    @Test
    fun `pastillas primero, luego folios sueltos, sin repetir`() {
        val body = "Mira [AN-0015 · Cámaras](/erp/actividades/20) y AN-0015 otra vez, también AN-0031 " +
            "y la [NEX-LJ75100126-0007](/erp/cotizaciones/12)"
        val refs = ChatLigas.refsDelMensaje(body, max = 10)
        assertEquals(
            listOf(
                RefLiga("/erp/actividades/20", TipoLiga.ACTIVIDAD, "AN-0015"),
                RefLiga("/erp/cotizaciones/12", TipoLiga.COTIZACION, "NEX-LJ75100126-0007"),
                RefLiga("folio:AN-0031", TipoLiga.ACTIVIDAD, "AN-0031"),
            ),
            refs,
        )
    }

    @Test
    fun `tope de tres tarjetas por mensaje`() {
        val body = "AN-0001 AN-0002 AN-0003 AN-0004 [Cliente · Acme](/erp/clientes/5)"
        val refs = ChatLigas.refsDelMensaje(body)
        assertEquals(3, refs.size)
        assertEquals("/erp/clientes/5", refs.first().ref)
    }

    @Test
    fun `folios de cotizacion sueltos y personas fuera`() {
        val refs = ChatLigas.refsDelMensaje("[@Raúl](user:7) revisa NXR-2026-763366 y an-0001")
        assertEquals(listOf(RefLiga("folio:NXR-2026-763366", TipoLiga.COTIZACION, "NXR-2026-763366")), refs)
    }

    @Test
    fun `las refs de varios mensajes se juntan una vez`() {
        val refs = ChatLigas.refsDeMensajes(
            listOf("[A](/erp/actividades/1)", "AN-0002 y [A](/erp/actividades/1)", "hola"),
        )
        assertEquals(listOf("/erp/actividades/1", "folio:AN-0002"), refs)
    }

    @Test
    fun `detectar folios respeta el orden de aparicion`() {
        val folios = ChatLigas.detectarFolios("NXR-2026-123 antes que AN-0009", max = 5)
        assertEquals(listOf("NXR-2026-123", "AN-0009"), folios.map { it.folio })
        val conId = ChatLigas.detectarFolios("[AN-0009 · X](/erp/actividades/44) AN-0009")
        assertEquals(44L, conId.single().id)
    }

    @Test
    fun `tono del chip segun el estado`() {
        assertEquals(TonoEstado.PROCESO, ChatLigas.tonoDeEstado("En Proceso"))
        assertEquals(TonoEstado.VALIDACION, ChatLigas.tonoDeEstado("Por Validar"))
        assertEquals(TonoEstado.FINALIZADA, ChatLigas.tonoDeEstado("Aprobada"))
        assertEquals(TonoEstado.ALERTA, ChatLigas.tonoDeEstado("No cumplida"))
        assertEquals(TonoEstado.NEUTRO, ChatLigas.tonoDeEstado("Borrador"))
        assertEquals(TonoEstado.NEUTRO, ChatLigas.tonoDeEstado(null))
    }

    @Test
    fun `monto con moneda`() {
        assertTrue(ChatLigas.formatoMonto(12500.0, "MXN").contains("12,500.00"))
        assertTrue(ChatLigas.formatoMonto(10.5, null).contains("10.50"))
    }

    // ── Selector «Ligar» ────────────────────────────────────────────────────

    @Test
    fun `el selector tiene las nueve pestanas de la web`() {
        assertEquals(
            listOf("ACTIVITY", "USER", "QUOTE", "ATTENDANCE", "CLIENT", "PROJECT", "EVIDENCE", "VIATIC", "INVOICE"),
            ChatLigas.PESTANAS_LIGAR.map { it.kind },
        )
        assertNull(ChatLigas.tipoDeKind("USER"))
        assertEquals(TipoLiga.FACTURA, ChatLigas.tipoDeKind("INVOICE"))
    }

    @Test
    fun `token de persona y de liga`() {
        assertEquals(
            "[@Raúl Pérez](user:7)",
            formatEntityMentionToken(ChatMentionDto(kind = "USER", id = 7, label = "Raúl  Pérez")),
        )
        assertEquals(
            "[NEX-LJ75100126-0007 · Torre A](/erp/cotizaciones/12)",
            formatEntityMentionToken(
                ChatMentionDto(kind = "QUOTE", id = 12, label = "NEX-LJ75100126-0007 · Torre (A)", href = "/erp/cotizaciones/12"),
            ),
        )
    }

    // ── A dónde lleva cada liga ─────────────────────────────────────────────

    private fun app(href: String, yo: Long = 3L) =
        (ChatLigas.destino(href, yo) as DestinoLiga.EnApp).destino as DeepLinkDestination.Module

    private fun web(href: String, yo: Long = 3L) = (ChatLigas.destino(href, yo) as DestinoLiga.EnWeb).url

    @Test
    fun `cada liga abre su ficha en la app cuando existe`() {
        app("/erp/actividades/20").let {
            assertEquals(CoreKeys.ACTIVITIES, it.key)
            assertEquals(20L, it.entityId)
        }
        app("/erp/actividades/20/evidencias?evidencia=7").let {
            assertEquals(20L, it.entityId)
            assertEquals("evidencias", it.params["tab"])
            assertEquals("7", it.params["evidencia"])
        }
        app("/erp/cotizaciones/12").let {
            assertEquals(CoreKeys.COTIZACIONES, it.key)
            assertEquals(12L, it.entityId)
        }
        app("/erp/clientes/5").let {
            assertEquals(CoreKeys.CLIENTS, it.key)
            assertEquals(5L, it.entityId)
        }
        app("/erp/finance/viatics?highlight=44").let {
            assertEquals(CoreKeys.VIATICOS, it.key)
            assertEquals(44L, it.entityId)
        }
        // Sin ficha de proyecto en la app: abre Proyectos (con el id, por si la pantalla lo usa).
        app("/erp/proyectos/3").let {
            assertEquals(CoreKeys.PROYECTOS, it.key)
            assertEquals(3L, it.entityId)
        }
    }

    @Test
    fun `asistencia propia en la app y la de otra persona en la web`() {
        val href = "/erp/asistencias/indicadores/7?desde=2026-10-29&hasta=2026-10-29"
        assertEquals(CoreKeys.ATTENDANCE, app(href, yo = 7L).key)
        assertEquals("https://core.nexara.com.mx$href", web(href, yo = 3L))
    }

    @Test
    fun `facturas y rutas que la app no tiene van a la web, nunca a Inicio`() {
        assertEquals("https://core.nexara.com.mx/erp/invoicing/9", web("/erp/invoicing/9"))
        assertEquals("https://core.nexara.com.mx/erp/dashboard", web("/erp/dashboard"))
        // La casa de Core de verdad sigue abriéndose en la app.
        assertEquals(DeepLinkParser.CORE_HOME, app("/erp/actividades"))
    }

    @Test
    fun `personas y urls externas no son destino`() {
        assertNull(ChatLigas.destino("user:3", 3L))
        assertNull(ChatLigas.destino("https://example.com", 3L))
    }
}
