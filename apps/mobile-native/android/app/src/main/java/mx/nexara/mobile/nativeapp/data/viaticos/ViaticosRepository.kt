package mx.nexara.mobile.nativeapp.data.viaticos

import android.content.Context
import android.util.Base64
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.ApiClient
import mx.nexara.mobile.nativeapp.data.api.ResolverViaticoBody
import mx.nexara.mobile.nativeapp.data.api.SetRepartoBody
import mx.nexara.mobile.nativeapp.data.api.ViaticoDto
import mx.nexara.mobile.nativeapp.data.api.ViaticoParteBody
import mx.nexara.mobile.nativeapp.data.api.ViaticosApi
import mx.nexara.mobile.nativeapp.ui.common.GeoPhoto
import mx.nexara.mobile.nativeapp.ui.console.viaticos.Dinero
import mx.nexara.mobile.nativeapp.ui.console.viaticos.ParteReparto
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.ResponseBody

/**
 * Viáticos de Core: lo mío, lo de mi gente, y el circuito completo del anticipo
 * (pedir con ticket → autorizar → repartir entre actividades → comprobar → pagar).
 *
 * Los importes entran y salen de la pantalla en **centavos enteros** y solo se
 * vuelven decimales aquí, al armar la petición. Así el cuadre del reparto que
 * la app enseña es exactamente el que el servidor comprueba.
 *
 * La foto del ticket llega de [GeoPhoto] —la misma cámara en vivo de las
 * evidencias— y viaja como parte `ticketEvidencia` del multipart.
 *
 * Cada mutación devuelve `true` cuando se quedó en la cola sin conexión, para
 * que la pantalla lo diga con esas palabras en vez de fingir que se envió.
 */
class ViaticosRepository(context: Context) {
    private val authRepo = AuthRepository(context)
    private val api: ViaticosApi = ApiClient.authed(
        tokenProvider = { authRepo.token() },
        companyIdProvider = { authRepo.companyId() },
    ).create(ViaticosApi::class.java)

    private val textMedia = "text/plain".toMediaType()
    private val jpegMedia = "image/jpeg".toMediaType()

    /** Quién soy: para separar «mis viáticos» de los que me toca autorizar. */
    fun miUsuarioId(): Long? = authRepo.loadSession()?.id

    /** `viatics.manage` / super admin: quien puede autorizar, pagar y ver a su gente. */
    fun administraViaticos(): Boolean {
        val user = authRepo.loadSession() ?: return false
        if (user.isSuperAdmin) return true
        return user.permissions.any { it == "viatics.manage" || it == "CONSOLE_ADMIN" }
    }

    suspend fun lista(): List<ViaticoDto> = api.lista()

    suspend fun detalle(id: Long): ViaticoDto = api.detalle(id)

    /**
     * Pide un viático con la foto del ticket.
     *
     * El reparto no viaja aquí (un multipart no lleva listas anidadas): se
     * guarda después, desde el detalle, con [guardarReparto]. Por eso el alta
     * funciona igual sin conexión: se encola entera, foto incluida.
     */
    suspend fun crear(
        centavos: Long,
        motivo: String,
        categoria: String?,
        actividadId: Long?,
        ticket: GeoPhoto,
    ): Boolean = api.crear(
        montoSolicitado = texto(importe(centavos)),
        motivo = texto(motivo.trim()),
        categoria = categoria?.trim()?.takeIf { it.isNotEmpty() }?.let { texto(it) },
        actividadId = actividadId?.takeIf { it > 0L }?.let { texto(it.toString()) },
        projectId = null,
        vehicleId = null,
        ticketEvidencia = parteFoto(ticket, "ticket.jpg"),
    ).seEncolo()

    /**
     * Guarda el reparto completo. La suma tiene que dar el total exacto: el
     * servidor lo vuelve a comprobar en centavos y contesta 400 con el desglose
     * («faltan $12.30») si no cuadra.
     */
    suspend fun guardarReparto(id: Long, partes: List<ParteReparto>): Boolean =
        api.guardarReparto(
            id = id,
            body = SetRepartoBody(
                partes = partes.map { parte ->
                    ViaticoParteBody(
                        actividadId = parte.actividadId,
                        monto = Dinero.aApi(parte.centavos),
                        nota = parte.nota?.trim()?.takeIf { it.isNotEmpty() },
                    )
                },
            ),
        ).seEncolo()

    /** Comprueba el anticipo con tickets. La foto es opcional: puede ir solo la cifra. */
    suspend fun comprobar(
        id: Long,
        centavosComprobados: Long,
        nota: String?,
        ticket: GeoPhoto?,
    ): Boolean = api.comprobar(
        id = id,
        montoComprobado = texto(importe(centavosComprobados)),
        nota = nota?.trim()?.takeIf { it.isNotEmpty() }?.let { texto(it) },
        ticketEvidencia = ticket?.let { parteFoto(it, "comprobante.jpg") },
    ).seEncolo()

    /**
     * Autoriza el viático. [centavosAprobados] recorta la cifra («te doy 800, no
     * 1,200»); nulo autoriza lo solicitado. El servidor no admite subirla.
     *
     * Autorizar, rechazar y marcar pagado nunca se encolan (ver
     * `OfflineHttpInterceptor.SOLO_EN_LINEA`): son decisiones que el API todavía
     * puede rechazar, y encoladas darían por hecho algo que no pasó.
     */
    suspend fun aprobar(id: Long, centavosAprobados: Long?, nota: String?) {
        api.resolver(
            id = id,
            body = ResolverViaticoBody(
                action = "approve",
                note = nota?.trim()?.takeIf { it.isNotEmpty() },
                montoAprobado = centavosAprobados?.takeIf { it > 0L }?.let { Dinero.aApi(it) },
            ),
        ).close()
    }

    suspend fun rechazar(id: Long, nota: String?) {
        api.resolver(
            id = id,
            body = ResolverViaticoBody(
                action = "reject",
                note = nota?.trim()?.takeIf { it.isNotEmpty() },
            ),
        ).close()
    }

    /** Marca el pago: el servidor levanta la póliza y el viático deja de repartirse. */
    suspend fun marcarPagado(id: Long) {
        api.marcarPagado(id).close()
    }

    private fun texto(valor: String): RequestBody = valor.toRequestBody(textMedia)

    /**
     * Centavos → el texto del multipart, con dos decimales siempre.
     *
     * `class-transformer` lo convierte a número antes de validarlo, y así nunca
     * viaja una notación científica ni un `1.0E-4` que `@IsNumber` rechace.
     */
    private fun importe(centavos: Long): String = Dinero.formatear(centavos).replace(",", "")

    /** `data:image/jpeg;base64,…` → parte binaria del multipart. */
    private fun parteFoto(foto: GeoPhoto, nombre: String): MultipartBody.Part {
        val bytes = jpegBytes(foto.dataUrl) ?: ByteArray(0)
        return MultipartBody.Part.createFormData(
            "ticketEvidencia",
            nombre,
            bytes.toRequestBody(jpegMedia),
        )
    }

    /** El interceptor offline contesta `{"queued":true}` a las mutaciones sin red. */
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
