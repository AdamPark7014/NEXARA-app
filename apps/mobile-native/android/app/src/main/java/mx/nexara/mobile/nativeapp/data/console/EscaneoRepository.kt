package mx.nexara.mobile.nativeapp.data.console

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.AltaPorCodigoRequest
import mx.nexara.mobile.nativeapp.data.api.ApiClient
import mx.nexara.mobile.nativeapp.data.api.ConsultaUpcDto
import mx.nexara.mobile.nativeapp.data.api.EntregarHerramientaRequest
import mx.nexara.mobile.nativeapp.data.api.EscaneoApi
import mx.nexara.mobile.nativeapp.data.api.HerramientaPorCodigoDto
import mx.nexara.mobile.nativeapp.data.api.MovimientoPorCodigoDto
import mx.nexara.mobile.nativeapp.data.api.MovimientoPorCodigoRequest
import mx.nexara.mobile.nativeapp.data.api.PrestamoHerramientaDto
import mx.nexara.mobile.nativeapp.data.api.ProductoCodigoDto
import mx.nexara.mobile.nativeapp.data.api.ProductoPorCodigoDto
import mx.nexara.mobile.nativeapp.data.api.RecibirHerramientaRequest
import mx.nexara.mobile.nativeapp.data.api.StockAlmacenDto

/** Escáner de Almacén y Herramientas: buscar por código, dar de alta y mover. */
class EscaneoRepository(context: Context) {
    private val authRepo = AuthRepository(context)
    private val api: EscaneoApi = ApiClient.authed(
        tokenProvider = { authRepo.token() },
        companyIdProvider = { authRepo.companyId() },
    ).create(EscaneoApi::class.java)

    suspend fun productoPorCodigo(codigo: String): ProductoPorCodigoDto =
        withContext(Dispatchers.IO) { api.productoPorCodigo(codigo) }

    suspend fun consultaUpc(codigo: String): ConsultaUpcDto =
        withContext(Dispatchers.IO) { api.consultaUpc(codigo) }

    suspend fun altaPorCodigo(body: AltaPorCodigoRequest): ProductoCodigoDto =
        withContext(Dispatchers.IO) { api.altaPorCodigo(body) }

    suspend fun movimientoPorCodigo(body: MovimientoPorCodigoRequest): MovimientoPorCodigoDto =
        withContext(Dispatchers.IO) { api.movimientoPorCodigo(body) }

    suspend fun almacenes(): List<StockAlmacenDto> =
        withContext(Dispatchers.IO) { api.almacenes() }

    suspend fun herramientaPorCodigo(codigo: String): HerramientaPorCodigoDto =
        withContext(Dispatchers.IO) { api.herramientaPorCodigo(codigo) }

    suspend fun entregarHerramienta(prestamoId: Long, pickupCode: String?): PrestamoHerramientaDto =
        withContext(Dispatchers.IO) {
            api.entregarHerramienta(
                prestamoId,
                EntregarHerramientaRequest(pickupCode?.trim()?.uppercase()?.takeIf { it.isNotEmpty() }),
            )
        }

    suspend fun recibirHerramienta(prestamoId: Long, danio: String?): PrestamoHerramientaDto =
        withContext(Dispatchers.IO) {
            api.recibirHerramienta(
                prestamoId,
                RecibirHerramientaRequest(danio?.trim()?.takeIf { it.isNotEmpty() }),
            )
        }
}
