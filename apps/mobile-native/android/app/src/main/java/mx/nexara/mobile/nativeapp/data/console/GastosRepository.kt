package mx.nexara.mobile.nativeapp.data.console

import android.content.Context
import android.util.Base64
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.ApiClient
import mx.nexara.mobile.nativeapp.data.api.GastoDto
import mx.nexara.mobile.nativeapp.data.api.GastosApi
import mx.nexara.mobile.nativeapp.data.api.ResolverGastoBody
import mx.nexara.mobile.nativeapp.ui.common.GeoPhoto
import mx.nexara.mobile.nativeapp.ui.console.viaticos.Dinero
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.ResponseBody

/**
 * Gastos administrativos de Core: registrarlos con el ticket, autorizarlos y
 * marcarlos pagados.
 *
 * Los importes entran y salen de la pantalla en **centavos enteros** y solo se
 * vuelven decimales aquí, al armar la petición — igual que en Viáticos. Así la
 * cifra que la app enseña es exactamente la que el servidor guarda, sin que un
 * `Double` intermedio se coma un centavo por el camino.
 */
class GastosRepository(context: Context) {
    private val authRepo = AuthRepository(context)
    private val api: GastosApi = ApiClient.authed(
        tokenProvider = { authRepo.token() },
        companyIdProvider = { authRepo.companyId() },
    ).create(GastosApi::class.java)

    private val textMedia = "text/plain".toMediaType()
    private val jpegMedia = "image/jpeg".toMediaType()

    /** Quién soy: para separar «lo mío» de lo del resto del departamento. */
    fun miUsuarioId(): Long? = authRepo.loadSession()?.id

    /**
     * ¿Le enseñamos los botones de decidir?
     *
     * Es una pista para no ofrecer lo que casi seguro va a fallar, **no** la
     * autoridad: quien manda es `contabilidad.manage` del lado del servidor, y
     * su 403 se enseña tal cual si alguien llega aquí con un permiso que la
     * sesión guardada no refleja. Al revés también vale: si el rol cambió y la
     * sesión está vieja, el API aceptará la decisión aunque la app la escondiera.
     */
    fun administraGastos(): Boolean {
        val user = authRepo.loadSession() ?: return false
        if (user.isSuperAdmin) return true
        return user.permissions.any {
            it == "contabilidad.manage" || it == "console.admin" || it == "CONSOLE_ADMIN"
        }
    }

    suspend fun lista(): List<GastoDto> = api.lista()

    /**
     * Registra el gasto con la foto del ticket.
     *
     * Devuelve `true` cuando se quedó en la cola sin conexión, para que la
     * pantalla lo diga con esas palabras en vez de fingir que se envió. Un alta
     * sí se puede encolar: es del propio interesado y no mueve dinero por sí
     * sola, igual que pedir un viático.
     */
    suspend fun registrar(
        concepto: String,
        centavos: Long,
        categoria: String,
        esRecurrente: Boolean,
        /** `YYYY-MM-DD`; el servidor la lee a mediodía, no a medianoche. */
        fecha: String,
        ticket: GeoPhoto,
    ): Boolean = api.crear(
        concepto = texto(concepto.trim()),
        monto = texto(importe(centavos)),
        categoria = texto(categoria.trim()),
        esRecurrente = texto(if (esRecurrente) "true" else "false"),
        fecha = texto(fecha),
        ticketEvidencia = parteFoto(ticket),
    ).seEncolo()

    /**
     * Autoriza o rechaza. Devuelve `true` si se quedó en la cola.
     *
     * Ese `true` importa: a diferencia de las decisiones de viático, el
     * interceptor sin conexión **sí** encola esta ruta (`/expenses/` no está en
     * su lista de solo-en-línea), y el servidor todavía puede rechazarla
     * después —porque otro ya la cerró, o porque la póliza falla—. Decir
     * «autorizado» sobre un 202 sería dar por hecho un dinero que nadie
     * autorizó, así que la pantalla enseña que quedó pendiente de mandarse.
     */
    suspend fun resolver(id: Long, aprobar: Boolean, nota: String?): Boolean =
        api.resolver(
            id = id,
            body = ResolverGastoBody(
                action = if (aprobar) "approve" else "reject",
                note = nota?.trim()?.takeIf { it.isNotEmpty() },
            ),
        ).seEncolo()

    /** Marca el pago; el servidor levanta el asiento contable. Mismo aviso de cola. */
    suspend fun marcarPagado(id: Long): Boolean = api.marcarPagado(id).seEncolo()

    private fun texto(valor: String): RequestBody = valor.toRequestBody(textMedia)

    /**
     * Centavos → el texto del multipart, con dos decimales y sin comas.
     *
     * El controlador hace `Number(body.monto)`, y una coma de millares lo
     * convertiría en `NaN`, que acaba en «Monto inválido».
     */
    private fun importe(centavos: Long): String = Dinero.formatear(centavos).replace(",", "")

    /** `data:image/jpeg;base64,…` → la parte binaria que espera `FileInterceptor`. */
    private fun parteFoto(foto: GeoPhoto): MultipartBody.Part {
        val bytes = jpegBytes(foto.dataUrl) ?: ByteArray(0)
        return MultipartBody.Part.createFormData(
            "ticketEvidencia",
            "ticket-gasto.jpg",
            bytes.toRequestBody(jpegMedia),
        )
    }

    /** El interceptor offline contesta `{"queued":true}` con un 202 a las mutaciones sin red. */
    private fun ResponseBody.seEncolo(): Boolean = use { body ->
        body.string().contains("\"queued\":true")
    }

    private companion object {
        fun jpegBytes(dataUrl: String): ByteArray? {
            val coma = dataUrl.indexOf(',')
            if (coma < 0) return null
            return runCatching { Base64.decode(dataUrl.substring(coma + 1), Base64.NO_WRAP) }.getOrNull()
        }
    }
}
