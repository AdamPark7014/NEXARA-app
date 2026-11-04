package mx.nexara.mobile.nativeapp.data.console

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.ApiClient
import mx.nexara.mobile.nativeapp.data.api.EmployeePaymentsApi
import mx.nexara.mobile.nativeapp.data.api.PagoEmpleadoDto
import mx.nexara.mobile.nativeapp.data.api.parteJpeg
import mx.nexara.mobile.nativeapp.data.api.textoMultipart
import mx.nexara.mobile.nativeapp.ui.common.GeoPhoto
import mx.nexara.mobile.nativeapp.ui.console.viaticos.Dinero

/**
 * Pagos a empleados (`/erp/finance/employee-payments`): la lista, registrar en borrador y marcar pagado.
 *
 * Adam (04-11-2026) decidió que dirección registra y marca pagado desde el teléfono. Marcar pagado
 * mueve dinero y asienta una póliza (`postOperationalDisbursement`), así que **nada se encola**: sin
 * señal falla a la vista, y la fila solo cambia cuando el servidor confirma.
 */
class PagosEmpleadosRepository(context: Context) {
    private val authRepo = AuthRepository(context)
    private val api: EmployeePaymentsApi = ApiClient.authed(
        tokenProvider = { authRepo.token() },
        companyIdProvider = { authRepo.companyId() },
    ).create(EmployeePaymentsApi::class.java)

    private val apiSinCola: EmployeePaymentsApi = ApiClient.authed(
        tokenProvider = { authRepo.token() },
        companyIdProvider = { authRepo.companyId() },
        withOffline = false,
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

    /** Siempre en borrador: el dinero sale hasta que alguien lo marca pagado. */
    suspend fun registrar(
        personaId: Long,
        centavos: Long,
        concepto: String,
        /** `YYYY-MM-DD`. */
        desde: String,
        hasta: String,
        nota: String?,
        comprobante: GeoPhoto?,
    ): PagoEmpleadoDto = withContext(Dispatchers.IO) {
        apiSinCola.registrar(
            userId = textoMultipart(personaId.toString()),
            // Sin comas: el servidor hace `Number(amount)`, y una de millares daría «Monto invalido».
            amount = textoMultipart(Dinero.formatear(centavos).replace(",", "")),
            concepto = textoMultipart(concepto.trim()),
            periodFrom = textoMultipart(desde),
            periodTo = textoMultipart(hasta),
            status = textoMultipart("Borrador"),
            note = nota?.trim()?.takeIf { it.isNotEmpty() }?.let(::textoMultipart),
            files = comprobante?.parteJpeg("files", "comprobante-pago.jpg"),
        )
    }

    suspend fun marcarPagado(id: Long): PagoEmpleadoDto =
        withContext(Dispatchers.IO) { apiSinCola.marcarPagado(id) }
}
