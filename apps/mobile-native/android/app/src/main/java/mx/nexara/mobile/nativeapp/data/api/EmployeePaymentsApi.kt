package mx.nexara.mobile.nativeapp.data.api

import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Part
import retrofit2.http.Path

/**
 * Pagos a empleados en el teléfono — espejo de
 * `apps/api/src/employee-payments/employee-payments.controller.ts`:
 *
 * | Acción        | Endpoint                             | Permiso               |
 * |---------------|--------------------------------------|-----------------------|
 * | Lista         | `GET employee-payments`              | `CONTABILIDAD_VIEW`   |
 * | Registrar     | `POST employee-payments` (multipart) | `CONTABILIDAD_MANAGE` |
 * | Marcar pagado | `PATCH employee-payments/:id/pagado` | `CONTABILIDAD_MANAGE` |
 *
 * La lista va **sin parámetros**, igual que la web: filtra en el navegador sobre la lista completa.
 * Aquí se hace lo mismo en `PagosRules`, porque si el teléfono acotara el periodo y la web no, la misma
 * persona vería dos totales distintos del mismo mes. Sin `limit`, el servicio devuelve el arreglo
 * entero (no el sobre paginado).
 *
 * Solo dirección abre este módulo (`CoreMenu`). Quien manda de verdad es el servidor.
 *
 * Reglas de los DTO, iguales que en el resto del árbol: **todo anulable con
 * valor por omisión**, para que un campo que el servidor deje de mandar no
 * tumbe la pantalla. Y **todo importe se declara `String?`**: `amount` es un
 * `Decimal(12,2)` de Prisma y viaja como texto (`Decimal.toJSON()`), pero el
 * adaptador de Moshi sabe leer también un número como texto — y nunca al revés.
 * Quien necesita el número llama a `PagosRules.centavos`, que devuelve `null`
 * cuando no entiende en vez de un cero que nadie cobró.
 */
interface EmployeePaymentsApi {

    /**
     * Todos los pagos que el rol puede ver, del más reciente al más viejo
     * (`orderBy: { createdAt: 'desc' }`), con el empleado y quien lo capturó.
     */
    @GET("employee-payments")
    suspend fun lista(): List<PagoEmpleadoDto>

    /**
     * Registra un pago. [status] se manda siempre: sin él, el servidor lo da por `Pagado` y levanta
     * la póliza en ese mismo momento. Los comprobantes van en el campo `files`.
     */
    @Multipart
    @POST("employee-payments")
    suspend fun registrar(
        @Part("userId") userId: RequestBody,
        @Part("amount") amount: RequestBody,
        @Part("concepto") concepto: RequestBody,
        @Part("periodFrom") periodFrom: RequestBody,
        @Part("periodTo") periodTo: RequestBody,
        @Part("status") status: RequestBody,
        @Part("note") note: RequestBody?,
        @Part files: MultipartBody.Part?,
    ): PagoEmpleadoDto

    /** Sin cuerpo: el controlador no lee ninguno. Levanta la póliza contable. */
    @PATCH("employee-payments/{id}/pagado")
    suspend fun marcarPagado(@Path("id") id: Long): PagoEmpleadoDto
}

/** El empleado del pago, o quien lo capturó. Es un `User` de Prisma recortado. */
data class PagoEmpleadoPersonaDto(
    val id: Long? = null,
    val nombre: String? = null,
    val email: String? = null,
    val avatarUrl: String? = null,
    val puesto: String? = null,
)

/**
 * Un pago a un empleado (`model EmployeePayment` de `schema.prisma`).
 *
 * Ojo con las dos clases de fecha, que no se leen igual:
 *
 * - [periodFrom] y [periodTo] son `@db.Date`: **días**, guardados a medianoche
 *   UTC. Llegan como `"2026-09-14T00:00:00.000Z"` y hay que quedarse con los
 *   diez primeros caracteres. Convertirlos a la hora de México los correría un
 *   día hacia atrás y el periodo quedaría mal por los dos extremos.
 * - [paidAt] y [createdAt] son instantes de verdad (`new Date()`). Ahí sí hay
 *   que pasar por la zona de México: un pago marcado a las 19:00 de un martes
 *   es `01:00Z` del miércoles, y cortar el texto diría que se pagó al día
 *   siguiente.
 *
 * `PagosRules` tiene una función distinta para cada caso, y las pruebas fijan
 * las dos.
 */
data class PagoEmpleadoDto(
    val id: Long? = null,
    val userId: Long? = null,
    /** Día de inicio del periodo (`@db.Date`, medianoche UTC). */
    val periodFrom: String? = null,
    /** Día de cierre del periodo (`@db.Date`, medianoche UTC). */
    val periodTo: String? = null,
    /** Minutos de asistencia que respaldan el pago; `0` = no se calculó por horas. */
    val totalMinutes: Int? = null,
    /** `Decimal(12,2)`. Texto a propósito: ver la nota de la interfaz. */
    val amount: String? = null,
    val concepto: String? = null,
    val note: String? = null,
    /** `Borrador` · `Pagado` · `Anulado`. */
    val status: String? = null,
    /** Instante en que se marcó pagado; `null` mientras siga en borrador. */
    val paidAt: String? = null,
    /** Folio de la póliza contable que generó el pago (`PAG-…`). */
    val contabilidadRef: String? = null,
    val journalEntryId: Long? = null,
    /** Comprobantes subidos al capturar (rutas `/uploads/employee-payments/…`). */
    val evidenceUrls: List<String>? = null,
    val createdAt: String? = null,
    val user: PagoEmpleadoPersonaDto? = null,
    val createdBy: PagoEmpleadoPersonaDto? = null,
)
