package mx.nexara.mobile.nativeapp.data.console

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.ApiClient
import mx.nexara.mobile.nativeapp.data.api.CotizacionDetalleDto
import mx.nexara.mobile.nativeapp.data.api.CotizacionResumenDto
import mx.nexara.mobile.nativeapp.data.api.CotizacionesApi
import mx.nexara.mobile.nativeapp.data.api.MarcarEnviadaBody

/**
 * Cotizaciones de Core.
 *
 * La propuesta se arma en la computadora —objetivo, alcance, partidas y planos— y el teléfono es para
 * consultarla, enseñarla, mandar el PDF, decir que ya salió y, a dirección, aprobarla. Lo que la app
 * no hace lo dice la pantalla; no hay ningún botón que eche al navegador.
 */
class CotizacionesRepository(context: Context) {
    private val authRepo = AuthRepository(context)
    private val api: CotizacionesApi = ApiClient.authed(
        tokenProvider = { authRepo.token() },
        companyIdProvider = { authRepo.companyId() },
    ).create(CotizacionesApi::class.java)

    /** Sin cola: el servidor decide según el estado de ese momento, y encolado daría por hecho algo que puede rechazar. */
    private val apiSinCola: CotizacionesApi = ApiClient.authed(
        tokenProvider = { authRepo.token() },
        companyIdProvider = { authRepo.companyId() },
        withOffline = false,
    ).create(CotizacionesApi::class.java)

    /**
     * La lista completa, sin `search`.
     *
     * El filtro y la búsqueda se hacen en el teléfono (`CotizacionesRules`): la
     * lista de Core cabe de sobra en memoria y filtrar sin red es instantáneo,
     * mientras que teclear contra el servidor obliga a esperar a cada letra —
     * y en campo, con media raya, eso es una pantalla parpadeando.
     */
    suspend fun lista(): List<CotizacionResumenDto> =
        withContext(Dispatchers.IO) { api.lista() }

    suspend fun detalle(id: Long): CotizacionDetalleDto =
        withContext(Dispatchers.IO) { api.detalle(id) }

    /**
     * El PDF de la propuesta, en bytes.
     *
     * Se lee entero aquí (y no se devuelve el cuerpo abierto) para cerrar la
     * conexión en el hilo de IO: quien lo llama solo tiene que escribirlo y
     * abrirlo.
     */
    suspend fun pdf(id: Long): ByteArray =
        withContext(Dispatchers.IO) { api.pdf(id).use { it.bytes() } }

    suspend fun pdfInterno(id: Long): ByteArray =
        withContext(Dispatchers.IO) { api.pdfInterno(id).use { it.bytes() } }

    suspend fun marcarEnviada(id: Long, medio: String) = withContext(Dispatchers.IO) {
        apiSinCola.marcarEnviada(id, MarcarEnviadaBody(medio)).close()
    }

    suspend fun aprobar(id: Long) = withContext(Dispatchers.IO) {
        apiSinCola.aprobar(id).close()
    }
}
