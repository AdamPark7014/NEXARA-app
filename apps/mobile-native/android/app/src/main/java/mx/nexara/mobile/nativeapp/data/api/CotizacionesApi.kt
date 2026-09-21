package mx.nexara.mobile.nativeapp.data.api

import okhttp3.ResponseBody
import retrofit2.http.GET
import retrofit2.http.Path
import retrofit2.http.Query
import retrofit2.http.Streaming

/**
 * Cotizaciones de Core en el teléfono — espejo de `apps/api/src/cotizaciones`:
 *
 * | Pantalla            | Endpoint                          |
 * |---------------------|-----------------------------------|
 * | Lista               | `GET cotizaciones/core?search=`   |
 * | Detalle             | `GET cotizaciones/core/:id`       |
 * | PDF de la propuesta | `GET cotizaciones/:id/pdf`        |
 *
 * Se usan **las rutas de Core** (`/core`) y no `GET cotizaciones`, porque son
 * las que el servidor ya devuelve presentadas: estado y segmento en español,
 * partidas agrupadas en Equipos / Materiales / Mano de obra y la cadena de
 * quienes intervinieron. Traducir eso en el cliente sería tener dos verdades.
 *
 * Todas piden el permiso `cotizaciones.access` (el PDF admite además
 * `sales.view` y `panel.ventas`), así que un 403 es una respuesta legítima: se
 * enseña el mensaje del servidor, que es quien decide.
 *
 * Reglas de los DTO, iguales que en el resto del árbol: **todo anulable con
 * valor por omisión**, para que un campo que el servidor deje de mandar no
 * tumbe la pantalla. Los `Decimal` de Prisma viajan unas veces como número
 * (`listaCore` hace `Number(...)`) y otras como texto (`detalleCore` reexpone la
 * fila tal cual), así que **todo importe se declara `String?`**: el adaptador de
 * Moshi sabe leer un número como texto, y nunca al revés. Quien necesita el
 * número llama a `CotizacionesRules`.
 */
interface CotizacionesApi {

    /** Lista de Core: folio, cliente, monto, estado y quién intervino. */
    @GET("cotizaciones/core")
    suspend fun lista(@Query("search") search: String? = null): List<CotizacionResumenDto>

    /** Detalle de Core: el mismo que lee el editor de la web, ya presentado. */
    @GET("cotizaciones/core/{id}")
    suspend fun detalle(@Path("id") id: Long): CotizacionDetalleDto

    /**
     * PDF de la propuesta tal como lo recibe el cliente.
     *
     * `@Streaming` para no cargar el documento entero en memoria antes de
     * tiempo: quien lo pide lo escribe a un archivo de caché y lo abre con el
     * visor del teléfono.
     */
    @Streaming
    @GET("cotizaciones/{id}/pdf")
    suspend fun pdf(@Path("id") id: Long): ResponseBody
}

// ── Piezas compartidas por la lista y el detalle ─────────────────────────────

/** Quien elaboró la cotización, con la clave de RH congelada en el folio. */
data class CotizacionPersonaDto(
    val id: Long? = null,
    val nombre: String? = null,
    /** Nomenclatura con la que se emitió el folio. */
    val clave: String? = null,
    val siglas: String? = null,
    val puesto: String? = null,
)

/**
 * Quién intervino y con qué papel. `rol` es `ELABORO` · `LEVANTAMIENTO` ·
 * `REVISO` · `APROBO` · `ENVIO`; [rolEtiqueta] ya viene en español desde el
 * servidor (`ETIQUETA_ROL`) y es la que se enseña.
 */
data class CotizacionParticipanteDto(
    val userId: Long? = null,
    val nombre: String? = null,
    val puesto: String? = null,
    val avatarUrl: String? = null,
    val clave: String? = null,
    val siglas: String? = null,
    val rol: String? = null,
    val rolEtiqueta: String? = null,
    val at: String? = null,
)

/** Actividad comercial ligada a la cotización (`AN-####`). */
data class CotizacionActividadDto(
    val id: Long? = null,
    val anNumber: String? = null,
    val titulo: String? = null,
    val estatus: String? = null,
)

// ── Lista ────────────────────────────────────────────────────────────────────

/** Una fila de `GET cotizaciones/core` (`listaCore`). */
data class CotizacionResumenDto(
    val id: Long? = null,
    val folio: String? = null,
    /** El folio sigue la nomenclatura de RH (`NEX-LJ75100126-0007…`); los viejos no. */
    val conNomenclatura: Boolean? = null,
    /** Borrador viejo sin nomenclatura: en la web se le puede dar folio nuevo. */
    val necesitaRefolio: Boolean? = null,
    val folioNomenclatura: String? = null,
    val folioConsecutivo: Int? = null,
    val projectName: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
    val clienteNombre: String? = null,
    val clienteEmpresa: String? = null,
    /** `COMERCIAL` · `OBRA` · `LICITACION` · `SERVICIO`. */
    val segmento: String? = null,
    val segmentoEtiqueta: String? = null,
    /** `BORRADOR` · `ENVIADA` · `APROBADA` · `RECHAZADA` · `VENCIDA`. */
    val estado: String? = null,
    val estadoEtiqueta: String? = null,
    val total: String? = null,
    val currency: String? = null,
    val issueDate: String? = null,
    val validUntil: String? = null,
    val sentAt: String? = null,
    val revision: Int? = null,
    val elaboro: CotizacionPersonaDto? = null,
    val intervinieron: List<CotizacionParticipanteDto>? = null,
    val actividades: List<CotizacionActividadDto>? = null,
)

// ── Detalle ──────────────────────────────────────────────────────────────────

/** Una partida de la propuesta, ya dentro de su grupo. */
data class CotizacionPartidaDto(
    val id: Long? = null,
    /** `EQUIPOS` · `MATERIALES` · `MANO_DE_OBRA` cuando quien cotiza lo eligió. */
    val grupo: String? = null,
    val category: String? = null,
    val name: String? = null,
    val description: String? = null,
    val unit: String? = null,
    val qty: String? = null,
    val unitPrice: String? = null,
    val laborHours: String? = null,
    val laborRate: String? = null,
    val lineTotal: String? = null,
    val paqueteClave: String? = null,
    val paqueteCantidad: String? = null,
)

/**
 * Un grupo de la propuesta técnica con su subtotal. El servidor ya los manda en
 * orden Equipos → Materiales → Mano de obra y **sin los vacíos**
 * (`agruparPartidas`), así que la pantalla los pinta tal cual.
 */
data class CotizacionGrupoDto(
    val grupo: String? = null,
    val etiqueta: String? = null,
    val subtotal: String? = null,
    val partidas: List<CotizacionPartidaDto>? = null,
)

/** Subtotal de cada grupo, siempre los tres (`totalesPorGrupo`). */
data class CotizacionTotalesGrupoDto(
    @com.squareup.moshi.Json(name = "EQUIPOS") val equipos: String? = null,
    @com.squareup.moshi.Json(name = "MATERIALES") val materiales: String? = null,
    @com.squareup.moshi.Json(name = "MANO_DE_OBRA") val manoDeObra: String? = null,
)

/** Una condición de los términos, con su título ya en español. */
data class CotizacionTerminoParteDto(
    val clave: String? = null,
    val titulo: String? = null,
    val texto: String? = null,
    /** Lo reescribió quien cotiza; no es el texto por omisión del segmento. */
    val personalizado: Boolean? = null,
)

/** `terminos` del detalle: lo que el cliente lee al final de la propuesta. */
data class CotizacionTerminosDto(
    val modalidad: String? = null,
    val titulo: String? = null,
    val lineas: List<String>? = null,
    val partes: List<CotizacionTerminoParteDto>? = null,
)

/** A quién se le pasó la cotización por dentro (no sale en el PDF). */
data class CotizacionAsignacionDto(
    val id: Long? = null,
    val nombre: String? = null,
    val puesto: String? = null,
)

/**
 * `GET cotizaciones/core/:id` (`detalleCore` → `presentar`).
 *
 * Trae mucho más de lo que la app enseña (objetivo, bloques de alcance, planos,
 * personalización): esos campos se editan en la computadora y aquí ni se
 * declaran — un DTO que no pide lo que no pinta es un DTO que no se rompe
 * cuando el editor de la web cambia.
 */
data class CotizacionDetalleDto(
    val id: Long? = null,
    val folio: String? = null,
    val folioBase: String? = null,
    val quoteNumber: String? = null,
    val conNomenclatura: Boolean? = null,
    val necesitaRefolio: Boolean? = null,
    val revision: Int? = null,
    val cadenaParticipantes: String? = null,
    val estado: String? = null,
    val estadoEtiqueta: String? = null,
    /** Enviada o cerrada: en la web editarla crea una versión nueva. */
    val bloqueada: Boolean? = null,
    val segmento: String? = null,
    val segmentoEtiqueta: String? = null,
    val clientName: String? = null,
    val clientCompany: String? = null,
    val clientEmail: String? = null,
    val clientPhone: String? = null,
    val clientAddress: String? = null,
    val projectName: String? = null,
    /** Párrafo de entrada de «02 Alcance». */
    val scope: String? = null,
    val issueDate: String? = null,
    val validUntil: String? = null,
    val sentAt: String? = null,
    val sentToEmail: String? = null,
    val currency: String? = null,
    val subtotal: String? = null,
    val taxTotal: String? = null,
    val total: String? = null,
    val depositPercent: String? = null,
    val rejectedReason: String? = null,
    val rejectedByName: String? = null,
    val incluyeInstalacion: Boolean? = null,
    val elaboro: CotizacionPersonaDto? = null,
    val asignadoA: CotizacionAsignacionDto? = null,
    val asignadoPor: CotizacionAsignacionDto? = null,
    val asignadoNota: String? = null,
    val asignadoEn: String? = null,
    val grupos: List<CotizacionGrupoDto>? = null,
    val totalesPorGrupo: CotizacionTotalesGrupoDto? = null,
    val terminos: CotizacionTerminosDto? = null,
    val participantes: List<CotizacionParticipanteDto>? = null,
    val actividades: List<CotizacionActividadDto>? = null,
)
