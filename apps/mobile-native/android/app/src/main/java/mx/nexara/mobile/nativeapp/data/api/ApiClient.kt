package mx.nexara.mobile.nativeapp.data.api

import android.os.Build
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import mx.nexara.mobile.nativeapp.BuildConfig
import mx.nexara.mobile.nativeapp.data.offline.NexaraOffline
import mx.nexara.mobile.nativeapp.data.session.SessionEvents
import okhttp3.OkHttpClient
import okhttp3.Request
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
    ): OkHttpClient {
        val logging = HttpLoggingInterceptor()
        logging.level = if (BuildConfig.DEBUG) HttpLoggingInterceptor.Level.BODY else HttpLoggingInterceptor.Level.NONE

        return OkHttpClient.Builder()
            .connectTimeout(18, TimeUnit.SECONDS)
            .readTimeout(22, TimeUnit.SECONDS)
            .writeTimeout(22, TimeUnit.SECONDS)
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

                val token = tokenProvider?.invoke()
                if (token.isNullOrBlank()) {
                    return@addInterceptor chain.proceed(builder.build())
                }
                builder.header("Authorization", "Bearer $token")
                val companyId = companyIdProvider?.invoke()
                if (companyId != null && companyId > 0L) {
                    builder.header("X-Company-Id", companyId.toString())
                }
                val response = chain.proceed(builder.build())
                if (response.code == 401) {
                    SessionEvents.notifyExpired()
                }
                response
            }
            .apply {
                NexaraOffline.httpInterceptor()?.let { addInterceptor(it) }
            }
            .addInterceptor(logging)
            .build()
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

    fun healthApi(tokenProvider: () -> String?): HealthApi = authed(tokenProvider).create(HealthApi::class.java)
}
