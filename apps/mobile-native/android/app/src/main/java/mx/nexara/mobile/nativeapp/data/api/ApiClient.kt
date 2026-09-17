package mx.nexara.mobile.nativeapp.data.api

import android.os.Build
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import mx.nexara.mobile.nativeapp.BuildConfig
import mx.nexara.mobile.nativeapp.data.offline.NexaraOffline
import mx.nexara.mobile.nativeapp.data.session.SessionEvents
import mx.nexara.mobile.nativeapp.data.session.SessionRefreshPolicy
import mx.nexara.mobile.nativeapp.data.session.SessionRefresher
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import retrofit2.converter.scalars.ScalarsConverterFactory
import java.util.concurrent.TimeUnit

object ApiClient {
    private val moshi: Moshi = Moshi.Builder()
        .add(KotlinJsonAdapterFactory())
        .build()

    /**
     * Identidad de la app en cada petición.
     *
     * OkHttp no fija `User-Agent`, así que el servidor recibía uno vacío y
     * `detectDeviceFromUserAgent` lo resolvía como "Escritorio · PC": todos los
     * fichajes hechos desde el teléfono quedaban registrados como si fueran de
     * una computadora, y no había forma de auditar de dónde salió cada uno.
     *
     * Formato: `NexaraApp/1.2.3 (Android 14; samsung SM-A536B) OkHttp`. Lleva
     * la palabra "Android" a propósito — es lo que el detector del servidor
     * busca para clasificar el registro como móvil.
     */
    private val userAgent: String by lazy {
        val version = BuildConfig.VERSION_NAME.ifBlank { "0" }
        val release = Build.VERSION.RELEASE ?: "?"
        "NexaraApp/$version (Android $release; $deviceModel) OkHttp"
    }

    /**
     * Nombre del teléfono como lo ve la persona (Ajustes → Acerca del teléfono), p. ej. «Galaxy S24
     * Ultra». Lo fija `NexaraApplication` al arrancar; sirve para avisos tipo «Iniciaste sesión desde…».
     * Viaja codificado en URL porque puede traer acentos y OkHttp solo admite ASCII en cabeceras.
     */
    @Volatile
    var deviceDisplayName: String? = null

    /** Modelo legible para la ficha de dispositivo del servidor. */
    private val deviceModel: String by lazy {
        listOf(Build.MANUFACTURER, Build.MODEL)
            .filter { !it.isNullOrBlank() }
            .joinToString(" ")
            .ifBlank { "Android" }
    }

    private fun httpClient(
        tokenProvider: (() -> String?)? = null,
        companyIdProvider: (() -> Long?)? = null,
        withOffline: Boolean = true,
    ): OkHttpClient {
        val logging = HttpLoggingInterceptor()
        logging.level = if (BuildConfig.DEBUG) HttpLoggingInterceptor.Level.BODY else HttpLoggingInterceptor.Level.NONE

        return OkHttpClient.Builder()
            .connectTimeout(18, TimeUnit.SECONDS)
            .readTimeout(22, TimeUnit.SECONDS)
            .writeTimeout(22, TimeUnit.SECONDS)
            .apply { ApiDebugHooks.interceptors.forEach { addInterceptor(it) } }
            .addInterceptor { chain ->
                val original = chain.request()
                // La identidad del dispositivo va en TODAS las peticiones,
                // también en las que no llevan token (login incluido): es ahí
                // donde el servidor registra `lastLoginDevice`.
                val builder = original.newBuilder()
                    .header("User-Agent", userAgent)
                    .header("X-Device-Model", deviceModel)
                    // El servidor usa esta cabecera como "navegador" al
                    // describir el registro; así un fichaje desde la app se lee
                    // "Móvil · Android · NEXARA App" y no se confunde con
                    // Chrome en el mismo teléfono. Exigirla en el servidor para
                    // los fichajes que digan venir del móvil queda pendiente de
                    // que la v2 esté desplegada: ver
                    // `.ai/auditoria-2026-09/14-integridad-datos-remediacion.md`.
                    .header("X-Device-Browser", "NEXARA App")
                    .header("X-Device-OS", "Android ${Build.VERSION.RELEASE ?: ""}".trim())
                deviceDisplayName?.takeIf { it.isNotBlank() }?.let {
                    builder.header("X-Device-Name", java.net.URLEncoder.encode(it, "UTF-8"))
                }

                val token = tokenProvider?.invoke()
                if (token.isNullOrBlank()) {
                    return@addInterceptor chain.proceed(builder.build())
                }
                builder.header("Authorization", "Bearer $token")
                val companyId = companyIdProvider?.invoke()
                if (companyId != null && companyId > 0L) {
                    builder.header("X-Company-Id", companyId.toString())
                }
                val authedRequest = builder.build()
                val response = chain.proceed(authedRequest)
                if (response.code != 401) return@addInterceptor response
                recoverFrom401(chain, authedRequest, response, sentToken = token)
            }
            .apply {
                if (withOffline) NexaraOffline.httpInterceptor()?.let { addInterceptor(it) }
            }
            .addInterceptor(logging)
            .build()
    }

    /** Marca (no viaja al servidor) de una petición ya reintentada tras renovar. */
    private object AuthRetryTag

    /**
     * Un 401 ya no cierra la sesión por sí solo.
     *
     * 1. Si el token guardado cambió desde que salió la petición → reintenta con él.
     * 2. Si no, renovación single-flight ([SessionRefresher]):
     *    - 200 → reintenta UNA vez con el token nuevo.
     *    - 401 → expiración confirmada → [SessionEvents.notifyExpired].
     *    - red/5xx → devuelve el 401 original SIN avisar; se reintenta luego.
     * Login, la propia renovación y logout nunca entran aquí (ver
     * [SessionRefreshPolicy.isExcludedPath]); lo reintentado tampoco (sin bucles).
     */
    private fun recoverFrom401(
        chain: Interceptor.Chain,
        request: Request,
        response: Response,
        sentToken: String,
    ): Response {
        val stored = SessionRefresher.storedSession()
        val decision = SessionRefreshPolicy.decideOn401(
            encodedPath = request.url.encodedPath,
            sentToken = sentToken,
            alreadyRetried = request.tag(AuthRetryTag::class.java) != null,
            storedToken = stored?.token,
            storedIsPortal = stored != null && (stored.isClient || stored.isBranchUser),
        )
        return when (decision) {
            SessionRefreshPolicy.On401.PassThrough -> response
            SessionRefreshPolicy.On401.NotifyExpired -> {
                SessionEvents.notifyExpired()
                response
            }
            is SessionRefreshPolicy.On401.RetryWith -> retryWith(chain, request, response, decision.token)
            SessionRefreshPolicy.On401.Refresh -> when (val r = SessionRefresher.refreshBlocking(sentToken)) {
                is SessionRefresher.Result.Refreshed -> retryWith(chain, request, response, r.token)
                SessionRefresher.Result.Revoked -> {
                    SessionEvents.notifyExpired()
                    response
                }
                SessionRefresher.Result.Transient,
                SessionRefresher.Result.NoSession,
                SessionRefresher.Result.NotSupported,
                -> response
            }
        }
    }

    private fun retryWith(
        chain: Interceptor.Chain,
        request: Request,
        response: Response,
        token: String,
    ): Response {
        // Un cuerpo de un solo uso no se puede reenviar: el 401 sube tal cual,
        // pero la sesión ya quedó renovada para la siguiente petición.
        if (request.body?.isOneShot() == true) return response
        response.close()
        val retried = request.newBuilder()
            .header("Authorization", "Bearer $token")
            .tag(AuthRetryTag::class.java, AuthRetryTag)
            .build()
        return chain.proceed(retried)
    }

    private fun retrofit(client: OkHttpClient): Retrofit = Retrofit.Builder()
        .baseUrl(BuildConfig.API_BASE_URL.trimEnd('/') + "/")
        .client(client)
        .addConverterFactory(ScalarsConverterFactory.create())
        .addConverterFactory(MoshiConverterFactory.create(moshi))
        .build()

    private val retrofitNoAuth: Retrofit = retrofit(httpClient(tokenProvider = null))

    fun authed(
        tokenProvider: () -> String?,
        companyIdProvider: (() -> Long?)? = null,
    ): Retrofit = retrofit(httpClient(tokenProvider, companyIdProvider))

    val auth: AuthApi = retrofitNoAuth.create(AuthApi::class.java)
    val portalAuth: PortalAuthApi = retrofitNoAuth.create(PortalAuthApi::class.java)
    val kbPublic: KbPublicApi = retrofitNoAuth.create(KbPublicApi::class.java)

    /**
     * Cliente de renovación de sesión: sin interceptor de token (el bearer va
     * explícito) y SIN cola offline — un POST a `auth/session/refresh` sin red
     * no debe encolarse ni contestarse con un 202 falso.
     */
    val sessionApi: AuthApi by lazy {
        retrofit(httpClient(tokenProvider = null, withOffline = false)).create(AuthApi::class.java)
    }

}
