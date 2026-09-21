package mx.nexara.mobile.nativeapp.data.api

import retrofit2.http.GET

/**
 * Pagos a empleados en el teléfono — espejo de
 * `apps/api/src/employee-payments/employee-payments.controller.ts`:
 *
 * | Pantalla | Endpoint                  | Permiso              |
 * |----------|---------------------------|----------------------|
 * | Lista    | `GET employee-payments`   | `CONTABILIDAD_VIEW`  |
 *
 * **Un solo endpoint, y sin parámetros**, igual que la web
 * (`app/(panels)/erp/finance/employee-payments/page.tsx` llama
 * `financeFetch("employee-payments")` a secas). El controlador acepta además
 * `from`, `to`, `userId` y `status`, pero la web no los usa: filtra en el
 * navegador sobre la lista completa. Aquí se hace lo mismo en
 * `PagosRules`, por dos motivos:
 *
 * 1. **Alcance.** `userId` deja consultar a una persona concreta. El servidor
 *    ya decide a quién puede ver cada quien (`canViewAll`: con
 *    `CONTABILIDAD_MANAGE` o super admin ve toda la empresa; sin él, solo su
 *    propio departamento). Mandar filtros que la web no manda sería ampliar por
 *    la puerta de atrás lo que se consulta de la nómina ajena.
 * 2. **Una sola verdad.** Si el teléfono acotara el periodo y la web no, la
 *    misma persona vería dos totales distintos del mismo mes y ninguno de los
 *    dos estaría mal. En nómina eso termina en una junta.
 *
 * Sin `limit`, el servicio devuelve el arreglo entero (no el sobre paginado):
 * `findAll` solo pagina cuando `query.limit` viene, y la web nunca lo manda.
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
