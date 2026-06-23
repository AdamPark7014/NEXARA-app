package mx.nexara.mobile.nativeapp.data.notifications

import android.content.Context
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.ApiClient
import mx.nexara.mobile.nativeapp.data.api.NotificationsApi

class NotificationsRepository(context: Context) {
    private val authRepo = AuthRepository(context)
    private val api: NotificationsApi = ApiClient.authed { authRepo.token() }.create(NotificationsApi::class.java)

    suspend fun list(limit: Int = 50, offset: Int = 0) = api.list(limit = limit, offset = offset)

    suspend fun unreadCount() = api.unreadCount()

    suspend fun markRead(id: Long) { api.markRead(id) }

    suspend fun markAllRead() { api.markAllRead() }

    suspend fun delete(id: Long) { api.delete(id) }
}

