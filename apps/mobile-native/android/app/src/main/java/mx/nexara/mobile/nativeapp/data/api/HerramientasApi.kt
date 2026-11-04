package mx.nexara.mobile.nativeapp.data.api

import okhttp3.MultipartBody
import okhttp3.RequestBody
import okhttp3.ResponseBody
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Herramientas de Core — espejo de `apps/api/src/tool-requests/tool-requests.controller.ts`.
 *
 * Cada quien llama lo suyo (`HerramientasRules.Perfil`):
 * - **Personal** (`tools.view` / `tools.request`): mi kit, mis préstamos, más plazo, reportar daño y
 *   pedir préstamo. El servidor solo le niega pedir a dirección (`assertCanCreateToolLoan`).
 * - **Iván y dirección** (`tools.manage`): préstamos e inventario de toda la empresa. Aprobar,
 *   rechazar, entregar y recibir exigen además estar en la lista de correos de `tools-access.ts`.
 *
 * Los préstamos de la empresa se leen por estado (`status/:status`) y no con `GET tool-requests`:
 * ése recorta al departamento de quien pregunta si no es super admin, y a Iván se le perderían
 * préstamos por aprobar sin que nada lo dijera.
 *
 * `GET tool-requests/my-stats` no está: cuenta por estado exactamente la misma lista que ya devuelve
 * `my-requests`, y traerla otra vez sería una petición más en cada refresco para un número que la
 * app puede sumar sola.
 *
 * Entregar y recibir viven en `EscaneoApi`: son lo mismo se escanee la etiqueta o se toque en la lista.
 *
 * Todo campo llega anulable con valor por omisión: un registro raro deja la tarjeta incompleta,
 * nunca tumba la pantalla.
 */

/**
 * Una pieza física del inventario: la de una asignación de kit, una fila de `GET
 * tool-requests/inventory` o un resultado de `inventory/search`.
 */
data class KitPiezaDto(
    val id: Long? = null,
    val toolName: String? = null,
    val model: String? = null,
    val serialNumber: String? = null,
    /** Nomenclatura interna de NEXARA (p. ej. `MUL-12345`), la que va en la etiqueta. */
    val codigoInterno: String? = null,
    val barcode: String? = null,
    /** `AVAILABLE` | `ASSIGNED` | `IN_REPAIR` | `RETIRED`. */
    val status: String? = null,
)

/**
 * Un parte de daño o incidencia sobre una herramienta del kit.
 *
 * [resolution] es `PENDING` mientras nadie ha dictaminado si fue mal uso
 * (`USER_MISUSE`, que puede acabar en multa) o falla del equipo
 * (`EQUIPMENT_FAILURE`).
 */
data class KitEventoDto(
    val id: Long? = null,
    val description: String? = null,
    val resolution: String? = null,
    val reportedAt: String? = null,
    val resolvedAt: String? = null,
)

/**
 * Una herramienta asignada a mí de forma permanente (`GET tool-requests/kits/my`).
 *
 * No es un préstamo: el kit es lo que la persona trae siempre encima y de lo que
 * responde. Por eso lo que importa en la tarjeta es la identificación de la
 * pieza y si tiene una revisión vencida o un daño sin cerrar.
 */
data class KitAsignacionDto(
    val id: Long,
    val inventoryItemId: Long? = null,
    /** `KIT` (permanente) | `LOAN`. */
    val assignmentType: String? = null,
    val assignedAt: String? = null,
    val dueReturnDate: String? = null,
    val returnedAt: String? = null,
    val isActive: Boolean? = null,
    val replacementCount: Int? = null,
    val notes: String? = null,
    /** Cada cuántos días toca revisión. `null` = sin revisión periódica. */
    val inspeccionCadaDias: Int? = null,
    val proximaInspeccion: String? = null,
    val inventoryItem: KitPiezaDto? = null,
    /** Las 20 últimas incidencias, de la más reciente a la más vieja. */
    val events: List<KitEventoDto>? = null,
    /** De quién es el kit. Solo llega en `kits/users`: en `kits/my` es de quien pregunta. */
    val user: HerramientaPersonaDto? = null,
)

/** Quién autorizó el préstamo. Aparte de [SimpleUserDto] porque aquí todo puede venir nulo. */
data class HerramientaAprobadorDto(
    val id: Long? = null,
    val nombre: String? = null,
    val email: String? = null,
)

/**
 * Un préstamo de herramienta (`GET tool-requests/my-requests`).
 *
 * [status] es `ToolRequestStatus`: `PENDING` | `APPROVED` | `IN_USE` |
 * `RETURNED` | `DAMAGED` | `REJECTED`.
 *
 * [pickupCode] es el código que el almacén teclea al entregar y que caduca en
 * [pickupExpiresAt]. Es el dato por el que un técnico abre esta pantalla parado
 * en la ventanilla, así que la tarjeta lo enseña grande mientras sirva.
 */
data class PrestamoHerramientaDto(
    val id: Long,
    val usuarioId: Long? = null,
    val toolName: String? = null,
    val model: String? = null,
    val serialNumber: String? = null,
    val reason: String? = null,
    val status: String? = null,
    val startDate: String? = null,
    val expectedReturnDate: String? = null,
    val requestDate: String? = null,
    val approvalDate: String? = null,
    val deliveryDate: String? = null,
    val returnDate: String? = null,
    val damageDescription: String? = null,
    val adminNotes: String? = null,
    val renewalCount: Int? = null,
    /** OT para la que se pidió. `null` = préstamo suelto. */
    val activityId: Long? = null,
    /** La pieza del inventario prestada: con ella se sabe quién trae cada herramienta. */
    val inventoryItemId: Long? = null,
    /** Quien la pidió. Solo llega en las listas de la empresa. */
    val usuario: HerramientaPersonaDto? = null,
    val pickupCode: String? = null,
    val pickupExpiresAt: String? = null,
    val pickedUpAt: String? = null,
    val approver: HerramientaAprobadorDto? = null,
)

/**
 * `POST tool-requests/:id/renewal-request` — pedir más plazo.
 *
 * [newReturnDate] viaja como texto ISO porque el controlador hace
 * `new Date(data.newReturnDate)` y guarda la fecha tal cual.
 */
data class PedirRenovacionBody(
    val newReturnDate: String,
    val renewalReason: String? = null,
)

/** `POST tool-requests` — pedir prestada una pieza del inventario. `usuarioId` es el propio. */
data class PedirPrestamoBody(
    val usuarioId: Long,
    val inventoryItemId: Long,
    val reason: String,
    val startDate: String,
    val expectedReturnDate: String,
    val activityId: Long? = null,
)

/** Una petición de más plazo esperando decisión (`GET tool-requests/renewals/pending`). */
data class RenovacionPendienteDto(
    val id: Long? = null,
    val toolRequestId: Long? = null,
    val previousReturnDate: String? = null,
    val newReturnDate: String? = null,
    val renewalReason: String? = null,
    val requestDate: String? = null,
    val toolRequest: PrestamoHerramientaDto? = null,
)

data class ReportarDanioBody(val description: String)

data class RechazarPrestamoBody(val adminNotes: String)

data class RechazarRenovacionBody(val reason: String)

interface HerramientasApi {

    /** `GET tool-requests/kits/my` — lo que traigo asignado de forma permanente. */
    @GET("tool-requests/kits/my")
    suspend fun miKit(): List<KitAsignacionDto>

    /** `GET tool-requests/my-requests` — mis préstamos, del más reciente al más viejo. */
    @GET("tool-requests/my-requests")
    suspend fun misPrestamos(): List<PrestamoHerramientaDto>

    /**
     * `POST tool-requests/:id/renewal-request` — la única mutación que el
     * servidor deja hacer con `tools.view`, y solo sobre préstamos propios
     * (`requestRenewal` compara `usuarioId` contra la sesión).
     *
     * Devuelve [ResponseBody] crudo, no la renovación: sin red el interceptor
     * offline contesta `{"queued":true,"offline":true}` con un 202, y pedirle a
     * Moshi que lo decodifique como renovación reventaría con un error de
     * programador en vez de decir «quedó en la cola».
     */
    @POST("tool-requests/{id}/renewal-request")
    suspend fun pedirRenovacion(
        @Path("id") id: Long,
        @Body body: PedirRenovacionBody,
    ): ResponseBody

    /** `POST tool-requests/kits/:id/report` (`tools.view`): reportar daño de una pieza de mi kit. */
    @POST("tool-requests/kits/{id}/report")
    suspend fun reportarDanio(@Path("id") id: Long, @Body body: ReportarDanioBody): ResponseBody

    /** `GET tool-requests/inventory/search?q=`: solo lo disponible. Sin texto contesta vacío. */
    @GET("tool-requests/inventory/search")
    suspend fun buscarInventario(@Query("q") q: String): List<KitPiezaDto>

    /** `GET tool-requests/mis-actividades`: mis actividades abiertas, para ligar el préstamo. */
    @GET("tool-requests/mis-actividades")
    suspend fun misActividades(): List<HerramientaActividadDto>

    /** `POST tool-requests`: queda `PENDING` hasta que Iván la apruebe. */
    @POST("tool-requests")
    suspend fun pedirPrestamo(@Body body: PedirPrestamoBody): PrestamoHerramientaDto

    /** `GET tool-requests/status/:status` (`tools.manage`): de toda la empresa, con quién la pidió. */
    @GET("tool-requests/status/{status}")
    suspend fun prestamosPorEstado(@Path("status") status: String): List<PrestamoHerramientaDto>

    @GET("tool-requests/renewals/pending")
    suspend fun renovacionesPendientes(): List<RenovacionPendienteDto>

    /** `GET tool-requests/inventory` (`tools.manage`): no dice quién la trae. */
    @GET("tool-requests/inventory")
    suspend fun inventario(): List<KitPiezaDto>

    /** `GET tool-requests/kits/users` (`tools.manage`): kits, con su dueño, para decir quién trae qué. */
    @GET("tool-requests/kits/users")
    suspend fun kitsDeLaEmpresa(): List<KitAsignacionDto>

    /** Genera el código de recolección. Sobre una ya aprobada, genera otro: es como se renueva. */
    @POST("tool-requests/{id}/approve")
    suspend fun aprobarPrestamo(@Path("id") id: Long): ResponseBody

    @POST("tool-requests/{id}/reject")
    suspend fun rechazarPrestamo(@Path("id") id: Long, @Body body: RechazarPrestamoBody): ResponseBody

    @POST("tool-requests/renewals/{id}/approve")
    suspend fun aprobarRenovacion(@Path("id") id: Long): ResponseBody

    @POST("tool-requests/renewals/{id}/reject")
    suspend fun rechazarRenovacion(@Path("id") id: Long, @Body body: RechazarRenovacionBody): ResponseBody

    /** `POST tool-requests/inventory` (`tools.manage`): las dos fotos son obligatorias. */
    @Multipart
    @POST("tool-requests/inventory")
    suspend fun nuevaHerramienta(
        @Part("toolName") toolName: RequestBody,
        @Part("model") model: RequestBody,
        @Part("serialNumber") serialNumber: RequestBody,
        @Part panoramicPhoto: MultipartBody.Part,
        @Part serialPhoto: MultipartBody.Part,
    ): KitPiezaDto
}
