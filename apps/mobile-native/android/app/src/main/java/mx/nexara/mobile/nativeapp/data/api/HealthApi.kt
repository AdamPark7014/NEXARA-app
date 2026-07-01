package mx.nexara.mobile.nativeapp.data.api

import retrofit2.http.GET

interface HealthApi {
    @GET("health")
    suspend fun health(): String
}
