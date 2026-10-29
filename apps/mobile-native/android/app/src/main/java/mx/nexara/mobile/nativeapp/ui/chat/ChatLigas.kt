package mx.nexara.mobile.nativeapp.ui.chat

import mx.nexara.mobile.nativeapp.access.CoreKeys
import mx.nexara.mobile.nativeapp.access.DeepLinkDestination
import mx.nexara.mobile.nativeapp.access.DeepLinkParser
import mx.nexara.mobile.nativeapp.access.PanelId
import mx.nexara.mobile.nativeapp.access.WebPanelUrl
import java.net.URLDecoder
import java.nio.charset.StandardCharsets
import java.text.Normalizer

/**
 * Ligas del chat: qué se puede ligar en un mensaje, cómo se reconoce y a dónde lleva al tocarla.
 *
 * Espejo de `apps/web/lib/ligas.ts`, `apps/web/components/chat/folios.ts` y de la tabla de rutas de
 * `apps/api/src/chat/ligas/ligas.ts`: si cambia una ruta allá, cambia aquí.
 *
 *   actividad    /erp/actividades/20
 *   evidencia    /erp/actividades/20/evidencias            (?evidencia=7 si es una en concreto)
 *   cotización   /erp/cotizaciones/12
 *   cliente      /erp/clientes/5
 *   proyecto     /erp/proyectos/3
 *   asistencia   /erp/asistencias/indicadores/7?desde=2026-10-29&hasta=2026-10-29   (persona y día)
 *   viático      /erp/finance/viatics?highlight=44
 *   factura      /erp/invoicing/9
 *
 * Los folios escritos sueltos (`AN-0031`, `NEX-…`, `NXR-…`) se piden como `folio:AN-0031`.
 * La tarjeta la arma el API (`POST chat/ligas`) con los permisos de quien la ve.
 */
enum class TipoLiga(val clave: String, val etiqueta: String) {
    ACTIVIDAD("actividad", "Actividad"),
    EVIDENCIA("evidencia", "Evidencia"),
    COTIZACION("cotizacion", "Cotización"),
    CLIENTE("cliente", "Cliente"),
    PROYECTO("proyecto", "Proyecto"),
    ASISTENCIA("asistencia", "Asistencia"),
    VIATICO("viatico", "Viático"),
    FACTURA("factura", "Factura"),
    ;

    /** Comercial y dinero en verde de marca; operación en azul (igual que la web). */
    val esDeMarca: Boolean get() = this == COTIZACION || this == CLIENTE || this == VIATICO || this == FACTURA

    companion object {
        fun deClave(clave: String?): TipoLiga? = entries.firstOrNull { it.clave == clave?.trim()?.lowercase() }
    }
}

/** Ruta guardada en el token, ya leída. */
data class LigaParseada(
    val tipo: TipoLiga,
    val id: Long,
    /** Asistencia: día AAAA-MM-DD. */
    val fecha: String? = null,
    /** Evidencia concreta dentro de la actividad. */
    val evidenciaId: Long? = null,
)

/** Lo que se pide al API (la ruta de la liga o `folio:AN-0031`) y lo que se pinta mientras carga. */
data class RefLiga(
    val ref: String,
    val tipo: TipoLiga,
    /** Folio que ya se lee en el mensaje. */
    val folio: String?,
)

/** Folio suelto encontrado en el texto. */
data class FolioDetectado(
    val tipo: TipoLiga,
    val folio: String,
    /** Id de la actividad cuando el mensaje trae la pastilla con su ruta. */
    val id: Long? = null,
)

/** Pestaña del selector «Ligar» (`GET chat/mentions?kind=`). */
data class PestanaLigar(val kind: String, val etiqueta: String, val buscar: String)

/** Tono del chip de estado de una tarjeta. */
enum class TonoEstado { PROCESO, VALIDACION, FINALIZADA, ALERTA, NEUTRO }

/** A dónde lleva una liga: una pantalla de la app o, si la app no la tiene, la web del panel. */
sealed class DestinoLiga {
    data class EnApp(val destino: DeepLinkDestination) : DestinoLiga()
    data class EnWeb(val url: String) : DestinoLiga()
}

object ChatLigas {

    /** Tope de tarjetas por mensaje: un mensaje con diez folios no debe volverse un tablero. */
    const val MAX_TARJETAS = 3

    /** Tope de refs por petición (`MAX_REFS` de `ligas.service.ts`). */
    const val MAX_REFS_POR_PETICION = 40

    const val SIN_ACCESO = "Sin acceso"
    const val NO_SE_PUDO_CARGAR = "No se pudo cargar"

    /** Orden del selector «Ligar»: el mismo de la web, lo que más se liga primero. */
    val PESTANAS_LIGAR = listOf(
        PestanaLigar("ACTIVITY", "Actividades", "Buscar por AN, título o estado…"),
        PestanaLigar("USER", "Personas", "Buscar por nombre o correo…"),
        PestanaLigar("QUOTE", "Cotizaciones", "Folio, cliente o proyecto…"),
        PestanaLigar("ATTENDANCE", "Asistencia", "¿De quién? (hoy)"),
        PestanaLigar("CLIENT", "Clientes", "Nombre o razón social…"),
        PestanaLigar("PROJECT", "Proyectos", "Proyecto o cliente…"),
        PestanaLigar("EVIDENCE", "Evidencias", "Evidencia, actividad o comentario…"),
        PestanaLigar("VIATIC", "Viáticos", "Motivo, categoría o persona…"),
        PestanaLigar("INVOICE", "Facturas", "Folio o cliente…"),
    )

    /** Tipo de liga de una pestaña del selector (`USER` no es liga: es mencionar a alguien). */
    fun tipoDeKind(kind: String?): TipoLiga? = when (kind?.uppercase()) {
        "ACTIVITY" -> TipoLiga.ACTIVIDAD
        "EVIDENCE" -> TipoLiga.EVIDENCIA
        "QUOTE" -> TipoLiga.COTIZACION
        "CLIENT" -> TipoLiga.CLIENTE
        "PROJECT" -> TipoLiga.PROYECTO
        "ATTENDANCE" -> TipoLiga.ASISTENCIA
        "VIATIC" -> TipoLiga.VIATICO
        "INVOICE" -> TipoLiga.FACTURA
        else -> null
    }

    private val FECHA = Regex("""^\d{4}-\d{2}-\d{2}$""")
    private val RE_EVIDENCIAS = Regex("""^/erp/actividades/(\d+)/evidencias$""")
    private val RE_ACTIVIDAD = Regex("""^/erp/actividades/(\d+)$""")
    private val RE_COTIZACION = Regex("""^/erp/cotizaciones/(\d+)$""")
    private val RE_CLIENTE = Regex("""^/erp/clientes/(\d+)$""")
    private val RE_PROYECTO = Regex("""^/erp/proyectos/(\d+)$""")
    private val RE_ASISTENCIA = Regex("""^/erp/asistencias/indicadores/(\d+)$""")
    private val RE_FACTURA = Regex("""^/erp/invoicing/(\d+)$""")

    private fun entero(v: String?): Long? = v?.toLongOrNull()?.takeIf { it > 0L }

    private fun parametros(query: String): Map<String, String> =
        query.split('&').mapNotNull { par ->
            val i = par.indexOf('=')
            if (i <= 0) return@mapNotNull null
            val nombre = runCatching { URLDecoder.decode(par.substring(0, i), StandardCharsets.UTF_8) }.getOrNull()
            val valor = runCatching { URLDecoder.decode(par.substring(i + 1), StandardCharsets.UTF_8) }.getOrNull()
            if (nombre == null || valor == null) null else nombre to valor
        }.toMap()

    /** Ruta guardada en el token → tipo e id. `null` si no es una liga conocida (`parsearLiga` del API). */
    fun parsearLiga(href: String?): LigaParseada? {
        val limpio = href?.trim().orEmpty()
        if (!limpio.startsWith("/erp/")) return null
        val corte = limpio.indexOf('?')
        val ruta = (if (corte >= 0) limpio.substring(0, corte) else limpio).trimEnd('/')
        val params = if (corte >= 0) parametros(limpio.substring(corte + 1)) else emptyMap()

        RE_EVIDENCIAS.matchEntire(ruta)?.let { m ->
            val id = entero(m.groupValues[1]) ?: return null
            return LigaParseada(TipoLiga.EVIDENCIA, id, evidenciaId = entero(params["evidencia"]))
        }
        RE_ACTIVIDAD.matchEntire(ruta)?.let { m ->
            return entero(m.groupValues[1])?.let { LigaParseada(TipoLiga.ACTIVIDAD, it) }
        }
        RE_COTIZACION.matchEntire(ruta)?.let { m ->
            return entero(m.groupValues[1])?.let { LigaParseada(TipoLiga.COTIZACION, it) }
        }
        RE_CLIENTE.matchEntire(ruta)?.let { m ->
            return entero(m.groupValues[1])?.let { LigaParseada(TipoLiga.CLIENTE, it) }
        }
        RE_PROYECTO.matchEntire(ruta)?.let { m ->
            return entero(m.groupValues[1])?.let { LigaParseada(TipoLiga.PROYECTO, it) }
        }
        RE_ASISTENCIA.matchEntire(ruta)?.let { m ->
            val id = entero(m.groupValues[1]) ?: return null
            val fecha = params["desde"].orEmpty()
            return if (FECHA.matches(fecha)) LigaParseada(TipoLiga.ASISTENCIA, id, fecha = fecha) else null
        }
        if (ruta == "/erp/finance/viatics") {
            return entero(params["highlight"])?.let { LigaParseada(TipoLiga.VIATICO, it) }
        }
        RE_FACTURA.matchEntire(ruta)?.let { m ->
            return entero(m.groupValues[1])?.let { LigaParseada(TipoLiga.FACTURA, it) }
        }
        return null
    }

    // ── Folios sueltos (folios.ts) ───────────────────────────────────────────

    // Mismas expresiones que folios.ts: el folio se escribe en mayúsculas (`AN-0031`).
    private val PASTILLA_ACTIVIDAD = Regex("""\[(AN-\d{3,})[^\]\n]*\]\(/erp/actividades/(\d+)\)""")
    private val FOLIO_ACTIVIDAD = Regex("""(?<![A-Za-z0-9-])AN-\d{3,}(?![\dA-Za-z])""")
    private val FOLIO_COTIZACION = Regex(
        """(?<![A-Za-z0-9-])(?:NEX-[A-Z]{2}\d{8}-\d{4,}(?:-[A-Z]{2}(?:\.[A-Z]{2})*)?(?:-R\d+)?|NXR-\d{4}-\d{3,})(?![\dA-Za-z])""",
    )

    /**
     * Folios del mensaje en orden de aparición y sin repetir. Una pastilla de actividad gana sobre el
     * mismo folio escrito suelto porque trae el id.
     */
    fun detectarFolios(body: String?, max: Int = MAX_TARJETAS): List<FolioDetectado> {
        val texto = body.orEmpty()
        val idPorFolio = mutableMapOf<String, Long>()
        PASTILLA_ACTIVIDAD.findAll(texto).forEach { m ->
            val folio = m.groupValues[1].uppercase()
            val id = entero(m.groupValues[2])
            if (id != null && folio !in idPorFolio) idPorFolio[folio] = id
        }
        val hallados = buildList {
            FOLIO_ACTIVIDAD.findAll(texto).forEach { add(Triple(TipoLiga.ACTIVIDAD, it.value.uppercase(), it.range.first)) }
            FOLIO_COTIZACION.findAll(texto).forEach { add(Triple(TipoLiga.COTIZACION, it.value.uppercase(), it.range.first)) }
        }.sortedBy { it.third }

        val vistos = mutableSetOf<String>()
        val out = mutableListOf<FolioDetectado>()
        for ((tipo, folio, _) in hallados) {
            if (!vistos.add("${tipo.clave}:$folio")) continue
            val id = if (tipo == TipoLiga.ACTIVIDAD) idPorFolio[folio] else null
            out += FolioDetectado(tipo, folio, id)
            if (out.size >= max) break
        }
        return out
    }

    /** Token de liga a una ruta interna (no `user:`), como lo busca la web. */
    private val TOKEN_RUTA = Regex("""\[([^\]\n]+)\]\((/[^)\s]*)\)""")
    private val FOLIO_AL_INICIO = Regex("""^(AN-\d{3,})""", RegexOption.IGNORE_CASE)
    private val FOLIO_COT_AL_INICIO = Regex("""^(NEX-\S+|NXR-\S+)""", RegexOption.IGNORE_CASE)

    /**
     * Ligas del mensaje en orden, sin repetir y con tope: primero las pastillas (traen la ruta exacta)
     * y luego los folios escritos sueltos que no venían ya en una pastilla (`refsDelMensaje` de la web).
     */
    fun refsDelMensaje(body: String?, max: Int = MAX_TARJETAS): List<RefLiga> {
        val texto = body.orEmpty()
        val out = mutableListOf<RefLiga>()
        val vistos = mutableSetOf<String>()
        val foliosCubiertos = mutableSetOf<String>()

        TOKEN_RUTA.findAll(texto).forEach { m ->
            val etiqueta = m.groupValues[1].trim()
            val href = m.groupValues[2]
            val tipo = parsearLiga(href)?.tipo ?: return@forEach
            if (!vistos.add(href)) return@forEach
            val folio = FOLIO_AL_INICIO.find(etiqueta)?.groupValues?.get(1)?.uppercase()
            val folioCot = FOLIO_COT_AL_INICIO.find(etiqueta)?.groupValues?.get(1)?.uppercase()
            folio?.let(foliosCubiertos::add)
            folioCot?.let(foliosCubiertos::add)
            out += RefLiga(href, tipo, folio ?: folioCot)
        }
        for (f in detectarFolios(texto, 10)) {
            if (f.id != null || f.folio in foliosCubiertos) continue
            val ref = "folio:${f.folio}"
            if (!vistos.add(ref)) continue
            out += RefLiga(ref, f.tipo, f.folio)
        }
        return out.take(max)
    }

    /** Todas las refs distintas de varios mensajes, en orden (para pedirlas en una sola llamada). */
    fun refsDeMensajes(bodies: Iterable<String>): List<String> {
        val vistas = LinkedHashSet<String>()
        bodies.forEach { body -> refsDelMensaje(body).forEach { vistas += it.ref } }
        return vistas.toList()
    }

    /** Título mientras carga o si no se pudo pedir: tipo y folio («Actividad AN-0031»). */
    fun tituloGenerico(tipo: TipoLiga, folio: String?): String =
        if (folio.isNullOrBlank()) tipo.etiqueta else "${tipo.etiqueta} $folio"

    /** Tono del chip según el texto que manda el API (`tonoDeEstado` de la web). */
    fun tonoDeEstado(estado: String?): TonoEstado {
        val e = Normalizer.normalize(estado.orEmpty(), Normalizer.Form.NFD)
            .replace(Regex("""\p{Mn}+"""), "")
            .lowercase()
        if (e.isBlank()) return TonoEstado.NEUTRO
        if (Regex("cancel|rechaz|vencid|perdid|no cumplid|incumplid").containsMatchIn(e)) return TonoEstado.ALERTA
        if (Regex("finaliz|complet|cerrad|aprob|firmad|ganad|aceptad").containsMatchIn(e)) return TonoEstado.FINALIZADA
        if (Regex("valid|revis|pendiente de|espera").containsMatchIn(e)) return TonoEstado.VALIDACION
        if (Regex("proceso|curso|enviad|asignad|progreso").containsMatchIn(e)) return TonoEstado.PROCESO
        return TonoEstado.NEUTRO
    }

    /** «$12,500.00» con la moneda del API (MXN por omisión). */
    fun formatoMonto(total: Double, moneda: String?): String {
        val codigo = moneda?.trim()?.uppercase()?.takeIf { it.length == 3 } ?: "MXN"
        return runCatching {
            val f = java.text.NumberFormat.getCurrencyInstance(java.util.Locale.forLanguageTag("es-MX"))
            f.currency = java.util.Currency.getInstance(codigo)
            // En es-MX el MXN se escribe «$»; otra moneda lleva su símbolo o su código.
            f.format(total)
        }.getOrElse { "$" + String.format(java.util.Locale.US, "%,.2f", total) }
    }

    // ── A dónde lleva una liga ───────────────────────────────────────────────

    /** Rutas que de verdad son la casa de Core (no «no la encontré»). */
    private val RUTAS_CASA = setOf("erp", "erp/actividades", "erp/activities", "erp/pizarra", "core")

    /**
     * Destino de una ruta interna (`/erp/…`) dentro de la app, o la web cuando la app no tiene esa
     * pantalla. Nunca deja a nadie en Inicio sin explicación:
     *
     * - actividad, evidencia, cotización, cliente y viático abren su ficha;
     * - proyecto abre Proyectos (la app no tiene ficha de proyecto);
     * - asistencia propia abre Asistencias; la de otra persona y las facturas, que la app no tiene,
     *   se abren en la web del panel con la misma ruta;
     * - cualquier otra ruta que la app no conoce también va a la web.
     *
     * `null` si no es una ruta interna (persona `user:`, URL externa).
     */
    fun destino(href: String?, usuarioActualId: Long): DestinoLiga? {
        val limpio = href?.trim().orEmpty()
        if (!limpio.startsWith("/")) return null
        val web = { WebPanelUrl.forPath(limpio)?.let { DestinoLiga.EnWeb(it) } }
        val liga = parsearLiga(limpio)
        when (liga?.tipo) {
            TipoLiga.ASISTENCIA -> {
                return if (usuarioActualId > 0L && liga.id == usuarioActualId) {
                    DestinoLiga.EnApp(DeepLinkDestination.Module(PanelId.ERP, CoreKeys.ATTENDANCE))
                } else {
                    web() ?: DestinoLiga.EnApp(DeepLinkDestination.Module(PanelId.ERP, CoreKeys.ATTENDANCE))
                }
            }
            TipoLiga.FACTURA -> return web()
            else -> Unit
        }
        val destino = DeepLinkParser.parseWebPath(limpio) ?: return web()
        if (destino == DeepLinkParser.CORE_HOME) {
            val ruta = limpio.substringBefore('?').trim('/').lowercase()
            if (ruta !in RUTAS_CASA) return web() ?: DestinoLiga.EnApp(destino)
        }
        return DestinoLiga.EnApp(destino)
    }
}
