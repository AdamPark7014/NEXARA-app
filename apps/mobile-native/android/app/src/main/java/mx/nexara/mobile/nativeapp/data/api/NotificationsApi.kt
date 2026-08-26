package mx.nexara.mobile.nativeapp.data.api

import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.Path
import retrofit2.http.Query

data class NotificationRowDto(
    val id: Long,
    val title: String? = null,
    val message: String? = null,
    val category: String? = null,
    val isRead: Boolean? = null,
    val createdAt: String? = null,
    val entityType: String? = null,
    val relatedEntityId: Long? = null,
    val relatedUrl: String? = null,
    val priority: String? = null,
)

data class UnreadCountDto(
    val unreadCount: Int = 0,
)

interface NotificationsApi {
    @GET("notifications")
    suspend fun list(
        @Query("limit") limit: Int? = null,
        @Query("offset") offset: Int? = null,
        @Query("category") category: String? = null,
        @Query("isRead") isRead: String? = null,
    ): List<NotificationRowDto>

    @GET("notifications/count/unread")
    suspend fun unreadCount(): UnreadCountDto

    @PATCH("notifications/{id}/read")
    suspend fun markRead(@Path("id") id: Long): okhttp3.ResponseBody

    @PATCH("notifications/read/all")
    suspend fun markAllRead(): okhttp3.ResponseBody

    @DELETE("notifications/{id}")
    suspend fun delete(@Path("id") id: Long): okhttp3.ResponseBody
}

