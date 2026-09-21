package mx.nexara.mobile.nativeapp.data.console

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.ApiClient
import mx.nexara.mobile.nativeapp.data.api.EmployeePaymentsApi
import mx.nexara.mobile.nativeapp.data.api.PagoEmpleadoDto

/**
 * Lectura de Pagos a empleados (`/erp/finance/employee-payments`).
 *
 * **Solo lectura, y a propósito.** El controlador sí expone crear, editar,
 * marcar pagado y anular, pero los cuatro piden `CONTABILIDAD_MANAGE` y los
 * cuatro mueven contabilidad de verdad: marcar pagado asienta una póliza
 * (`postOperationalDisbursement`) que después hay que cancelar a mano si se
 * hizo de más. Autorizar nómina con el teléfono en la mano, en la calle y sin
 * ver el comprobante completo, es una decisión del dueño, no de esta pantalla.
 * Mientras no la tome, aquí solo se consulta.
 */
class PagosEmpleadosRepository(context: Context) {
    private val authRepo = AuthRepository(context)
    private val api: EmployeePaymentsApi = ApiClient.authed(
        tokenProvider = { authRepo.token() },
        companyIdProvider = { authRepo.companyId() },
    ).create(EmployeePaymentsApi::class.java)

    /**
     * La lista completa, sin filtros de servidor.
     *
     * El periodo, el estado y la búsqueda se resuelven en el teléfono
     * (`PagosRules`): la lista ya viene acotada a la empresa y al alcance del
     * rol, cabe de sobra en memoria, y filtrar sin red es instantáneo. Pedir al
     * servidor a cada letra, en campo y con media raya de señal, es una pantalla
     * parpadeando.
     */
    suspend fun lista(): List<PagoEmpleadoDto> =
        withContext(Dispatchers.IO) { api.lista() }
}
