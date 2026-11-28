package mx.nexara.mobile.nativeapp.data.deshacer

import android.content.Context
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import mx.nexara.mobile.nativeapp.data.api.ApiClient
import mx.nexara.mobile.nativeapp.data.AuthRepository
import retrofit2.http.Body
import retrofit2.http.POST

/**
 * «Deshacer» estilo Instagram (Adam, 27-11-2026). Mismo contrato que la web (`components/AvisoDeshacer`).
 *
 * Tras asignar una actividad o pedir un viático, la pantalla llama a [ofrecer] y el aviso de abajo
 * (`ui/deshacer/AvisoDeshacerHost`) muestra «Deshacer» 5 s, aunque la pantalla ya haya cambiado. La API
 * decide de verdad: acepta a quien lo hizo en los primeros segundos o a un superior suyo cuando sea, y a
 * quien recibe no le llega aviso hasta que pasa el plazo.
 */
object Deshacer {
    const val PLAZO_MS = 5_000L

    const val TIPO_ACTIVIDAD = "actividad"
    const val TIPO_VIATICO = "viatico"

    data class Oferta(
        val clave: Long,
        val mensaje: String,
        val tipo: String,
        val ids: List<Long>,
        val detalle: String? = null,
    )

    private val _oferta = MutableStateFlow<Oferta?>(null)
    val oferta: StateFlow<Oferta?> = _oferta.asStateFlow()

    /** Sin ids (quedó en la cola sin conexión) no hay nada que deshacer: no se muestra. */
    fun ofrecer(mensaje: String, tipo: String, ids: List<Long>, detalle: String? = null) {
        val validos = ids.filter { it > 0L }.distinct()
        if (validos.isEmpty()) return
        _oferta.value = Oferta(System.nanoTime(), mensaje, tipo, validos, detalle)
    }

    fun descartar(clave: Long) {
        if (_oferta.value?.clave == clave) _oferta.value = null
    }

    private val _deshechos = MutableSharedFlow<Oferta>(extraBufferCapacity = 4)

    /** Lo que se acaba de deshacer: las listas abiertas lo escuchan para recargarse. */
    val deshechos: SharedFlow<Oferta> = _deshechos

    fun notificarDeshecho(oferta: Oferta) {
        _deshechos.tryEmit(oferta)
    }
}

data class DeshacerRequest(val tipo: String, val ids: List<Long>)

interface DeshacerApi {
    /** 410 = ya pasó el plazo; 409 = ya avanzó; 403 = no es suyo ni de su gente. */
    @POST("deshacer")
    suspend fun deshacer(@Body body: DeshacerRequest): okhttp3.ResponseBody
}

class DeshacerRepository(context: Context) {
    private val authRepo = AuthRepository(context)
    private val api: DeshacerApi = ApiClient.authed(
        tokenProvider = { authRepo.token() },
        companyIdProvider = { authRepo.companyId() },
    ).create(DeshacerApi::class.java)

    suspend fun deshacer(tipo: String, ids: List<Long>) {
        api.deshacer(DeshacerRequest(tipo, ids)).close()
    }
}
