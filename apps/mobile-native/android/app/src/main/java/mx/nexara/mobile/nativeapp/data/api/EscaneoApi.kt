package mx.nexara.mobile.nativeapp.data.api

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Lo que se hace al escanear con la cámara en Almacén y Herramientas. Espejo de
 * `apps/api/src/warehouse/stock.controller.ts` (búsqueda, alta y movimiento por
 * código) y de `tool-requests.controller.ts` (etiqueta de herramienta, entregar y
 * recibir).
 *
 * Aquí sí hay mutaciones que exigen `stock.manage` o `tools.manage`: la app no
 * esconde los botones por permiso (el rol puede cambiar sin cerrar sesión), los
 * enseña y traduce el 403 a un mensaje claro. Ninguna se encola sin conexión
 * (`OfflineHttpInterceptor`): el API decide si el código existe y si el préstamo
 * sigue en el estado que se vio.
 *
 * Las búsquedas usan la variante con `?code=` porque un código con «/» no cabe
 * en un segmento de ruta.
 */
interface EscaneoApi {

    /** `GET stock/barcode?code=` (`stock.view`): producto o caja, con existencias. 404 si no existe. */
    @GET("stock/barcode")
    suspend fun productoPorCodigo(@Query("code") code: String): ProductoPorCodigoDto

    /** `GET stock/upc-lookup/:code` (`stock.manage`): catálogo internacional. Siempre 200. */
    @GET("stock/upc-lookup/{code}")
    suspend fun consultaUpc(@Path("code") code: String): ConsultaUpcDto

    /** `POST stock/products/por-codigo` (`stock.manage`): alta con el código ya puesto. */
    @POST("stock/products/por-codigo")
    suspend fun altaPorCodigo(@Body body: AltaPorCodigoRequest): ProductoCodigoDto

    /** `POST stock/movements/por-codigo` (`stock.manage`): entrada o salida con solo el código. */
    @POST("stock/movements/por-codigo")
    suspend fun movimientoPorCodigo(@Body body: MovimientoPorCodigoRequest): MovimientoPorCodigoDto

    /** `GET warehouse` (`warehouse.view`): almacenes de la empresa, para elegir destino. */
    @GET("warehouse")
    suspend fun almacenes(): List<StockAlmacenDto>

    /** `GET tool-requests/inventory/por-codigo?code=`: herramienta de una etiqueta y quién la tiene. */
    @GET("tool-requests/inventory/por-codigo")
    suspend fun herramientaPorCodigo(@Query("code") code: String): HerramientaPorCodigoDto

    /** `POST tool-requests/:id/deliver` (`tools.manage`): salida de almacén de un préstamo aprobado. */
    @POST("tool-requests/{id}/deliver")
    suspend fun entregarHerramienta(@Path("id") prestamoId: Long, @Body body: EntregarHerramientaRequest): PrestamoHerramientaDto

    /** `POST tool-requests/:id/return` (`tools.manage`): entrada a almacén; con daño queda en reparación. */
    @POST("tool-requests/{id}/return")
    suspend fun recibirHerramienta(@Path("id") prestamoId: Long, @Body body: RecibirHerramientaRequest): PrestamoHerramientaDto
}

// ── Almacén ──────────────────────────────────────────────────────────────────

data class ProductoCodigoDto(
    val id: Long? = null,
    val sku: String? = null,
    val name: String? = null,
    val ean: String? = null,
    val upc: String? = null,
    val codigoBarras: String? = null,
    val unitName: String? = null,
    val imageUrl: String? = null,
)

/** Presentación (caja) cuyo código se escaneó: la cantidad del movimiento cuenta cajas. */
data class EmpaqueCodigoDto(
    val id: Long? = null,
    val nombre: String? = null,
    val piezasPorUnidad: Double? = null,
)

data class ExistenciaCodigoDto(
    val warehouseId: Long? = null,
    val almacen: String? = null,
    val cantidad: Double? = null,
    val reservado: Double? = null,
)

data class ProductoPorCodigoDto(
    /** `empaque` (se leyó una caja) | `producto`. */
    val match: String? = null,
    val codigoBarras: String? = null,
    /** UPC_A | EAN_13 | EAN_8 | GTIN_14 | INTERNO */
    val tipo: String? = null,
    val packaging: EmpaqueCodigoDto? = null,
    val product: ProductoCodigoDto? = null,
    val existencias: List<ExistenciaCodigoDto>? = null,
)

data class ProductoUpcDto(
    val codigo: String? = null,
    val nombre: String? = null,
    val marca: String? = null,
    val modelo: String? = null,
    val descripcion: String? = null,
    val imagenUrl: String? = null,
    val categoria: String? = null,
)

data class ConsultaUpcDto(
    val encontrado: Boolean? = null,
    val codigo: String? = null,
    val fuente: String? = null,
    val producto: ProductoUpcDto? = null,
    val motivo: String? = null,
    val mensaje: String? = null,
)

data class AltaPorCodigoRequest(
    val codigo: String,
    val name: String,
    val sku: String? = null,
    val marca: String? = null,
    val modelo: String? = null,
    val descripcion: String? = null,
    val imagenUrl: String? = null,
    val categoria: String? = null,
    val unidad: String? = null,
)

data class MovimientoPorCodigoRequest(
    val codigo: String,
    /** RECEIPT (entrada) | DISPATCH (salida). */
    val type: String,
    val quantity: Double,
    val fromWarehouseId: Long? = null,
    val toWarehouseId: Long? = null,
    val notes: String? = null,
)

data class MovimientoCreadoDto(
    val id: Long? = null,
    val type: String? = null,
    val quantity: Double? = null,
)

data class MovimientoPorCodigoDto(
    val match: String? = null,
    val codigoBarras: String? = null,
    val product: ProductoCodigoDto? = null,
    val packaging: EmpaqueCodigoDto? = null,
    val movement: MovimientoCreadoDto? = null,
)

// ── Herramientas ─────────────────────────────────────────────────────────────

data class HerramientaPersonaDto(
    val id: Long? = null,
    val nombre: String? = null,
    val email: String? = null,
)

data class HerramientaActividadDto(
    val id: Long? = null,
    val anNumber: String? = null,
    val titulo: String? = null,
)

data class HerramientaEscaneadaDto(
    val id: Long? = null,
    val toolName: String? = null,
    val model: String? = null,
    val serialNumber: String? = null,
    val codigoInterno: String? = null,
    val barcode: String? = null,
    /** AVAILABLE | ASSIGNED | IN_REPAIR | RETIRED */
    val status: String? = null,
    val panoramicPhotoUrl: String? = null,
    val serialPhotoUrl: String? = null,
)

data class PrestamoEscaneadoDto(
    val id: Long? = null,
    /** PENDING | APPROVED | IN_USE */
    val status: String? = null,
    val usuario: HerramientaPersonaDto? = null,
    val activity: HerramientaActividadDto? = null,
    val expectedReturnDate: String? = null,
    /** Solo llega a quien gestiona herramientas. */
    val pickupCode: String? = null,
    val pickupExpiresAt: String? = null,
    val vencido: Boolean? = null,
)

data class KitEscaneadoDto(
    val id: Long? = null,
    val assignmentType: String? = null,
    val assignedAt: String? = null,
    val user: HerramientaPersonaDto? = null,
)

data class HerramientaPorCodigoDto(
    val codigo: String? = null,
    val item: HerramientaEscaneadaDto? = null,
    val prestamo: PrestamoEscaneadoDto? = null,
    val kit: KitEscaneadoDto? = null,
    /** La tiene (o la pidió) quien escanea. */
    val esMia: Boolean? = null,
)

data class EntregarHerramientaRequest(
    /** El código de recolección que enseña quien la recoge; obligatorio si el préstamo lo tiene. */
    val pickupCode: String? = null,
)

data class RecibirHerramientaRequest(
    /** Con descripción de daño el préstamo queda `DAMAGED` y la herramienta en reparación. */
    val damageDescription: String? = null,
)
