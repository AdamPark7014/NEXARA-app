package mx.nexara.mobile.nativeapp.data.console

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.ApiClient
import mx.nexara.mobile.nativeapp.data.api.PagoDetalleDto
import mx.nexara.mobile.nativeapp.data.api.PagoSemanaDto
import mx.nexara.mobile.nativeapp.data.api.PagoSemanalApi
import mx.nexara.mobile.nativeapp.data.api.parteJpeg
import mx.nexara.mobile.nativeapp.data.api.textoMultipart
import mx.nexara.mobile.nativeapp.ui.common.GeoPhoto
import mx.nexara.mobile.nativeapp.ui.console.viaticos.Dinero

/** Nada se encola ni se enseña de la caché: un saldo viejo haría pagar dos veces. */
class PagoSemanalRepository(context: Context) {
    private val authRepo = AuthRepository(context)
    private val api: PagoSemanalApi = ApiClient.authed(
        tokenProvider = { authRepo.token() },
        companyIdProvider = { authRepo.companyId() },
        withOffline = false,
    ).create(PagoSemanalApi::class.java)

    suspend fun semana(lunes: String): PagoSemanaDto = withContext(Dispatchers.IO) { api.semana(lunes) }

    suspend fun detalle(lunes: String, userId: Long): PagoDetalleDto =
        withContext(Dispatchers.IO) { api.detalle(lunes, userId) }

    suspend fun registrar(lunes: String, userId: Long, centavos: Long, forma: String, fecha: String, comprobante: GeoPhoto?) =
        withContext(Dispatchers.IO) {
            api.registrar(
                semana = textoMultipart(lunes),
                userId = textoMultipart(userId.toString()),
                monto = textoMultipart(Dinero.formatear(centavos).replace(",", "")),
                forma = textoMultipart(forma),
                fecha = textoMultipart(fecha),
                comprobante = comprobante?.parteJpeg("comprobante", "comprobante-pago.jpg"),
            )
        }
}
