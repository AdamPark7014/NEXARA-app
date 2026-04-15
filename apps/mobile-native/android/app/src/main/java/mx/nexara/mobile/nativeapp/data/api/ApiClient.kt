package mx.nexara.mobile.nativeapp.data.api

import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import mx.nexara.mobile.nativeapp.BuildConfig
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import java.util.concurrent.TimeUnit

object ApiClient {
    private val moshi: Moshi = Moshi.Builder()
        .add(KotlinJsonAdapterFactory())
        .build()

    private fun httpClient(tokenProvider: (() -> String?)? = null): OkHttpClient {
        val logging = HttpLoggingInterceptor()
        logging.level = if (BuildConfig.DEBUG) HttpLoggingInterceptor.Level.BODY else HttpLoggingInterceptor.Level.NONE

        return OkHttpClient.Builder()
            .connectTimeout(18, TimeUnit.SECONDS)
            .readTimeout(22, TimeUnit.SECONDS)
            .writeTimeout(22, TimeUnit.SECONDS)
            .addInterceptor { chain ->
                val original = chain.request()
                val token = tokenProvider?.invoke()
                if (token.isNullOrBlank()) {
                    return@addInterceptor chain.proceed(original)
                }
                val next: Request = original.newBuilder()
                    .header("Authorization", "Bearer $token")
                    .build()
                chain.proceed(next)
            }
            .addInterceptor(logging)
            .build()
    }

    private fun retrofit(client: OkHttpClient): Retrofit = Retrofit.Builder()
        .baseUrl(BuildConfig.API_BASE_URL.trimEnd('/') + "/")
        .client(client)
        .addConverterFactory(MoshiConverterFactory.create(moshi))
        .build()

    private val retrofitNoAuth: Retrofit = retrofit(httpClient(tokenProvider = null))

    fun authed(tokenProvider: () -> String?): Retrofit = retrofit(httpClient(tokenProvider))

    val auth: AuthApi = retrofitNoAuth.create(AuthApi::class.java)
}

