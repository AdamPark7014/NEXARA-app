package mx.nexara.mobile.nativeapp.data.api

import okhttp3.ResponseBody
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

/**
 * Herramientas de Core — espejo de `apps/api/src/tool-requests/tool-requests.controller.ts`.
 *
 * Solo se declaran aquí los endpoints que **una persona de campo puede llamar**,
 * es decir los que el guard deja pasar con `tools.view`. Todo lo demás del
 * controlador (inventario, kits de otros, aprobar, entregar, recibir, etiquetas)
 * exige `tools.manage` y, en varios casos, estar además en la lista de correos
 * de `tools-access.ts` —Christian e Iván—; declararlo aquí solo serviría para
 * pintar botones que contestan 403 al tocarlos.
 *
 * `GET tool-requests/my-stats` tampoco está: cuenta por estado exactamente la
 * misma lista que ya devuelve `my-requests`, y traerla otra vez sería una
 * petición más en cada refresco para un número que la app puede sumar sola.
 *
 * Tampoco se declara `POST tool-requests` (pedir prestada una herramienta):
 * `assertCanCreateToolLoan` lo limita por correo a José Antonio y David, y el
 * alta exige elegir una pieza concreta del inventario —que es justo el endpoint
 * que esas dos personas tampoco pueden leer sin `tools.manage`—. Mientras el
 * servidor no abra esa puerta, la app no finge tenerla.
 *
 * Todo campo llega anulable con valor por omisión: un registro raro deja la
 * tarjeta incompleta, nunca tumba la pantalla.
 */

/** La pieza física del inventario detrás de una asignación de kit. */
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
}
