package mx.nexara.mobile.nativeapp.data.chat

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class ChatFavoritesStore(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    private val _favorites = MutableStateFlow(loadFavorites())
    val favorites: StateFlow<Set<Long>> = _favorites.asStateFlow()

    fun isFavorite(channelId: Long): Boolean = channelId in _favorites.value

    fun toggle(channelId: Long) {
        val next = if (channelId in _favorites.value) {
            _favorites.value - channelId
        } else {
            _favorites.value + channelId
        }
        save(next)
        _favorites.value = next
    }

    private fun loadFavorites(): Set<Long> =
        prefs.getStringSet(KEY, emptySet())
            ?.mapNotNull { it.toLongOrNull() }
            ?.toSet()
            ?: emptySet()

    private fun save(ids: Set<Long>) {
        prefs.edit()
            .putStringSet(KEY, ids.map { it.toString() }.toSet())
            .apply()
    }

    companion object {
        private const val PREFS = "nexara_chat_favorites"
        private const val KEY = "channel_ids"
    }
}
