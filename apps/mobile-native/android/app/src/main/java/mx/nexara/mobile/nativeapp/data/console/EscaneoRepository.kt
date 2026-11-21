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
import mx.nexara.mobile.nativeapp.data.api.ReceptorMaterialDto
import mx.nexara.mobile.nativeapp.data.api.HerramientaActividadDto
import mx.nexara.mobile.nativeapp.data.api.StockAlmacenDto
import mx.nexara.mobile.nativeapp.data.api.parteJpeg
import mx.nexara.mobile.nativeapp.data.api.textoMultipart
import mx.nexara.mobile.nativeapp.ui.common.GeoPhoto

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

    /** Entrega con las fotos de cómo sale. Sin fotos cae a la entrega de siempre. */
    suspend fun entregarHerramienta(prestamoId: Long, pickupCode: String?, fotos: List<GeoPhoto>): PrestamoHerramientaDto {
        if (fotos.isEmpty()) return entregarHerramienta(prestamoId, pickupCode)
        return withContext(Dispatchers.IO) {
            api.entregarHerramientaConFotos(
                prestamoId,
                pickupCode?.trim()?.uppercase()?.takeIf { it.isNotEmpty() }?.let(::textoMultipart),
                fotos.partesDeEvidencia("salida"),
            )
        }
    }

    /** Entrada diciendo cómo volvió ([condicion]), qué le pasó y las fotos de después. */
    suspend fun recibirHerramienta(
        prestamoId: Long,
        condicion: String,
        descripcion: String?,
        fotos: List<GeoPhoto>,
    ): PrestamoHerramientaDto = withContext(Dispatchers.IO) {
        api.recibirHerramientaConEvidencia(
            prestamoId,
            textoMultipart(condicion),
            descripcion?.trim()?.takeIf { it.isNotEmpty() }?.let(::textoMultipart),
            fotos.partesDeEvidencia("entrada"),
        )
    }

    suspend fun receptores(): List<ReceptorMaterialDto> =
        withContext(Dispatchers.IO) { api.receptores() }

    suspend fun actividadesDeReceptor(userId: Long): List<HerramientaActividadDto> =
        withContext(Dispatchers.IO) { api.actividadesDeReceptor(userId) }

    /** Fotos de lo que salió, sobre el movimiento ya registrado. */
    suspend fun evidenciaDeMovimiento(movimientoId: Long, fotos: List<GeoPhoto>) {
        if (fotos.isEmpty()) return
        withContext(Dispatchers.IO) {
            api.evidenciaDeMovimiento(movimientoId, fotos.partesDeEvidencia("material")).close()
        }
    }
}

/** Las fotos como partes `fotos` del multipart, con un nombre de archivo que diga qué son. */
private fun List<GeoPhoto>.partesDeEvidencia(prefijo: String) =
    mapIndexed { i, foto -> foto.parteJpeg("fotos", "$prefijo-${i + 1}.jpg") }
