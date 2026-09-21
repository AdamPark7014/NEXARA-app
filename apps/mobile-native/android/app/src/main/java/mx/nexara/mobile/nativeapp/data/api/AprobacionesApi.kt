package mx.nexara.mobile.nativeapp.data.api

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

/**
 * Aprobaciones (workflow) en el teléfono — espejo de
 * `apps/api/src/workflow/workflow.controller.ts`:
 *
 * | Pantalla        | Endpoint                                  |
 * |-----------------|-------------------------------------------|
 * | Bandeja         | `GET workflow/my-pending`                 |
 * | Decidir         | `POST workflow/approvals/{id}/decide`      |
 *
 * **Permisos.** Los dos piden `workflow.view`, `workflow.manage` o
 * `console.admin` (`VIEW` y `DECIDE` del controlador son la misma lista). El
 * `decide` además comprueba en el servicio que quien firma sea el aprobador de
 * **ese** paso —por usuario o por rol—, salvo `super_admin` o un rol con
 * `accesoConsoleAdmin`. Un 403 aquí es una respuesta legítima y se enseña tal
 * cual: quien manda es el servidor.
 *
 * **No es idempotente.** `decide` exige que la aprobación siga en `PENDING`; si
 * no, contesta 400 «Esta aprobación ya fue decidida». Pasa de verdad: dos
 * directores con el mismo rol ven la misma fila y uno llega primero. Por eso la
 * pantalla no borra nada hasta que el servidor confirma.
 *
 * **Qué hace cada decisión.** `REJECTED` cancela la instancia entera
 * (`isComplete` e `isCancelled`) y notifica al solicitante con el motivo;
 * `APPROVED` crea la aprobación del paso siguiente, o cierra el flujo si era el
 * último. La respuesta dice cuál de las tres ocurrió.
 *
 * Reglas de los DTO, iguales que en el resto del árbol: **todo anulable con
 * valor por omisión**, para que un campo que el servidor deje de mandar no
 * tumbe la pantalla. Y **todo importe como `String?`**: el adaptador de Moshi
 * sabe leer un número JSON como texto, y nunca al revés, así que declararlo
 * `Double` revienta en cuanto un `Decimal` de Prisma viaje serializado como
 * cadena. Quien necesita el número llama a `AprobacionesRules`.
 */
interface AprobacionesApi {

    /** Lo que espera tu firma, con la cadena completa de cada solicitud. */
    @GET("workflow/my-pending")
    suspend fun pendientes(): List<AprobacionPendienteDto>

    /** Aprobar o rechazar un paso. `comments` es opcional para el servidor. */
    @POST("workflow/approvals/{id}/decide")
    suspend fun decidir(
        @Path("id") aprobacionId: Long,
        @Body cuerpo: DecisionRequestDto,
    ): DecisionRespuestaDto
}

/**
 * Cuerpo del `decide`.
 *
 * `decision` solo admite `APPROVED` o `REJECTED`: cualquier otra cosa la
 * rechaza el controlador con un 403 «Decisión inválida». Se manda el literal y
 * no un enum para que el contrato quede a la vista de quien lea este archivo.
 */
data class DecisionRequestDto(
    val decision: String,
    val comments: String? = null,
)

/**
 * Respuesta del `decide`. El servidor devuelve tres formas distintas y hay que
 * distinguirlas, porque no significan lo mismo para quien acaba de firmar:
 *
 *  · rechazo               → `{ decided, complete: true, cancelled: true }`
 *  · aprobado, quedan pasos → `{ decided, complete: false, nextStep: N }`
 *  · aprobado y cerrado     → `{ decided, complete: true }`
 */
data class DecisionRespuestaDto(
    val decided: Boolean = false,
    val complete: Boolean = false,
    val cancelled: Boolean = false,
    val nextStep: Int? = null,
)

/** Persona del flujo. El servidor usa `nombre`, no `name`. */
data class WfPersonaDto(
    val id: Long? = null,
    val nombre: String? = null,
    val role: WfRolDto? = null,
)

data class WfRolDto(
    val nombre: String? = null,
)

/**
 * Un paso de la definición del flujo.
 *
 * El aprobador es **o** un usuario concreto (`approverUser`) **o** un rol
 * (`approverRole`); nunca los dos, y el servicio comprueba el que haya.
 */
data class WfPasoDto(
    val id: Long? = null,
    val stepNumber: Int? = null,
    val name: String? = null,
    val description: String? = null,
    val approverRoleId: Long? = null,
    val approverUserId: Long? = null,
    val approverRole: WfRolDto? = null,
    val approverUser: WfPersonaDto? = null,
)

/** La definición del flujo, con su cadena de pasos ya ordenada por el servidor. */
data class WfDefinicionDto(
    val name: String? = null,
    val entityType: String? = null,
    val steps: List<WfPasoDto>? = null,
)

/** Una aprobación ya registrada en la instancia: sirve para dibujar la cadena. */
data class WfAprobacionDto(
    val id: Long = 0L,
    val stepId: Long? = null,
    val status: String? = null,
    val comments: String? = null,
    val decidedAt: String? = null,
    val createdAt: String? = null,
    val step: WfPasoDto? = null,
    val decidedBy: WfPersonaDto? = null,
)

/**
 * La solicitud concreta sobre una entidad (el gasto #482, la cotización #77).
 *
 * `amount` y `total` **no los manda hoy** `my-pending`: `WorkflowInstance` de
 * Prisma no guarda importe y el controlador no lo enriquece. El servicio sí
 * sabe calcularlo (`buildEntityContext`), pero solo lo usa para la
 * auto-aprobación. Se declaran aquí, opcionales, porque es el sitio donde
 * entrarían el día que el backend los incluya —cambiar el DTO entonces no
 * obliga a tocar nada más—. Mientras tanto llegan nulos y la ficha dice «—»,
 * que es la verdad: ni «$0.00», que sería una cifra inventada.
 */
data class WfInstanciaDto(
    val id: Long = 0L,
    val entityId: Long? = null,
    val entityType: String? = null,
    val currentStep: Int? = null,
    val isComplete: Boolean = false,
    val isCancelled: Boolean = false,
    val startedAt: String? = null,
    val completedAt: String? = null,
    val workflow: WfDefinicionDto? = null,
    val startedBy: WfPersonaDto? = null,
    val approvals: List<WfAprobacionDto>? = null,
    val amount: String? = null,
    val total: String? = null,
)

/** Una fila de `GET workflow/my-pending`: tu paso pendiente y su instancia. */
data class AprobacionPendienteDto(
    val id: Long = 0L,
    val stepId: Long? = null,
    val status: String? = null,
    val comments: String? = null,
    val createdAt: String? = null,
    val step: WfPasoDto? = null,
    val instance: WfInstanciaDto? = null,
)
