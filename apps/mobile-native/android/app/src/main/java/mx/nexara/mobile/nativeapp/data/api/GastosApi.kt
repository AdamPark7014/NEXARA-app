package mx.nexara.mobile.nativeapp.data.api

import okhttp3.MultipartBody
import okhttp3.RequestBody
import okhttp3.ResponseBody
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Part
import retrofit2.http.Path

/**
 * Gastos administrativos de Core — espejo de `apps/api/src/expenses/expenses.controller.ts`:
 *
 * | Qué                  | Endpoint                        | Permiso              |
 * |----------------------|---------------------------------|----------------------|
 * | Lista                | `GET expenses`                  | `contabilidad.view`  |
 * | Registrar con ticket | `POST expenses` (multipart)     | `contabilidad.view`  |
 * | Autorizar / rechazar | `PATCH expenses/:id/approve`    | `contabilidad.manage`|
 * | Marcar pagado        | `PATCH expenses/:id/pagado`     | `contabilidad.manage`|
 *
 * Registrar pide **el mismo permiso que ver**, no el de administrar: quien
 * captura el gasto es quien lo pagó de su bolsa, y quien lo autoriza es otro.
 * Por eso la pantalla enseña «Registrar» a todos y las decisiones solo cuando
 * el servidor las acepta: el 403 del API es la única autoridad sobre eso.
 *
 * El servidor filtra por sí solo: quien administra contabilidad ve toda la
 * empresa y el resto ve únicamente su departamento (`findByDepartment`). La app
 * no decide quién ve qué; pinta lo que llega.
 *
 * No se declaran aquí `GET expenses/analytics`, `GET expenses/report.pdf`,
 * `PATCH expenses/:id` ni `DELETE expenses/:id`: son trabajo de escritorio
 * (rangos de fechas, reportes y correcciones) y un método que ninguna pantalla
 * llama es código que se pudre sin que nadie lo note.
 *
 * **Todo importe se declara `String?`.** `montoSolicitado` es un `Decimal` de
 * Prisma y el controlador devuelve la fila tal cual, así que llega unas veces
 * como número JSON y otras como texto; Moshi sabe leer un número como texto,
 * nunca al revés. Quien necesita el número llama a `GastosRules.centavos`.
 *
 * Y todo campo anulable con valor por omisión, como en el resto del árbol: un
 * registro viejo al que le falte el concepto deja la fila incompleta, nunca
 * tumba la pantalla.
 */
interface GastosApi {

    /**
     * `GET expenses` — sin `limit`, el controlador devuelve el arreglo completo.
     *
     * Con `limit` contestaría `{ data, meta }` y toparía en 100 filas
     * (`PaginationQueryDto`), que es justo el fallo que dejó siete pantallas de
     * la web sin cargar. Aquí se pide entero y se filtra en el teléfono.
     */
    @GET("expenses")
    suspend fun lista(): List<GastoDto>

    /**
     * `POST expenses` — alta con la foto del ticket.
     *
     * El servidor exige comprobante (`createAdministrative` contesta 400
     * «Debes adjuntar el comprobante del gasto»), así que la parte del archivo
     * no es opcional.
     *
     * `fecha` viaja como `YYYY-MM-DD` y el servidor la lee a mediodía
     * (`new Date(\`${fecha}T12:00:00\`)`), no a medianoche: así el día que se
     * captura es el día que se guarda, sin que el huso lo corra uno atrás.
     */
    @Multipart
    @POST("expenses")
    suspend fun crear(
        @Part("concepto") concepto: RequestBody,
        @Part("monto") monto: RequestBody,
        @Part("categoria") categoria: RequestBody?,
        @Part("esRecurrente") esRecurrente: RequestBody,
        @Part("fecha") fecha: RequestBody,
        @Part ticketEvidencia: MultipartBody.Part,
    ): ResponseBody

    /** `PATCH expenses/:id/approve` — autoriza o rechaza; solo sobre pendientes. */
    @PATCH("expenses/{id}/approve")
    suspend fun resolver(
        @Path("id") id: Long,
        @Body body: ResolverGastoBody,
    ): ResponseBody

    /**
     * `PATCH expenses/:id/pagado` — marca el pago y levanta la póliza contable.
     *
     * Sin cuerpo: el controlador no lee ninguno.
     */
    @PATCH("expenses/{id}/pagado")
    suspend fun marcarPagado(@Path("id") id: Long): ResponseBody
}

/**
 * Cuerpo de `PATCH expenses/:id/approve`.
 *
 * A diferencia de los viáticos, aquí **no se puede recortar la cifra**: el
 * controlador solo lee `action` y `note`. Un gasto ya se pagó de una bolsa
 * concreta, así que o se reconoce entero o se rechaza.
 */
data class ResolverGastoBody(
    /** `approve` | `reject`; cualquier otra cosa el servidor la trata como `approve`. */
    val action: String,
    val note: String? = null,
)

/** Quien capturó o quien pagó el gasto. El nombre puede faltar en filas viejas. */
data class GastoPersonaDto(
    val id: Long? = null,
    val nombre: String? = null,
    val puesto: String? = null,
)

/** La OT a la que se cargó. Los administrativos cuelgan de `SYS-ADMIN-GASTOS`. */
data class GastoActividadDto(
    val id: Long? = null,
    val anNumber: String? = null,
    val titulo: String? = null,
)

/**
 * Una fila de `GET expenses` — el modelo `Expense` de Prisma tal cual, con
 * `usuario`, `actividad` y `createdBy` incluidos.
 *
 * `concepto` es el campo de los gastos administrativos y `razonGasto` el texto
 * libre heredado; se leen en ese orden, igual que hace la web (`mapExpenseRow`).
 *
 * Las fechas llegan como instantes ISO en UTC. `fechaGasto` se guardó a
 * mediodía a propósito, pero `fechaSolicitud` es un `now()` real, así que
 * ninguna se convierte a hora local para enseñarla: se lee el día que dice el
 * texto (ver `GastosRules.fecha`).
 */
data class GastoDto(
    val id: Long? = null,
    val concepto: String? = null,
    val razonGasto: String? = null,
    val categoria: String? = null,
    /** `Decimal(10,2)` de Prisma: número o texto según por dónde salga. */
    val montoSolicitado: String? = null,
    /** `Pendiente` · `Aprobado` · `Pagado` · `Rechazado`. */
    val estatusPago: String? = null,
    val fechaGasto: String? = null,
    val fechaSolicitud: String? = null,
    val esRecurrente: Boolean? = null,
    val isAdministrative: Boolean? = null,
    val ticketEvidenciaUrl: String? = null,
    /** Folio de la póliza; el API lo escribe al autorizar o al pagar. */
    val contabilidadRef: String? = null,
    val usuarioId: Long? = null,
    /** De quién es el gasto (a quien se le repone). */
    val usuario: GastoPersonaDto? = null,
    /** Quién lo capturó, si no fue el mismo. */
    val createdBy: GastoPersonaDto? = null,
    val actividad: GastoActividadDto? = null,
)
