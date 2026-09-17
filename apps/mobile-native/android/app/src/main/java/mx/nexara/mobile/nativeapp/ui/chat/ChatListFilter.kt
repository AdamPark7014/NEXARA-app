package mx.nexara.mobile.nativeapp.ui.chat

import mx.nexara.mobile.nativeapp.data.api.ChatChannelDto

/**
 * Filtros locales de la lista de conversaciones. No piden nada al servidor:
 * acotan los canales que ya se cargaron (la búsqueda en mensajes sigue siendo
 * `chat/search`).
 */
enum class ChatListFilter(val label: String) {
    TODOS("Todos"),
    NO_LEIDOS("No leídos"),
    FAVORITOS("Favoritos"),
    DIRECTOS("Directos"),
}

internal object ChatListFiltering {

    /** Nombre, tema o descripción; sin distinguir mayúsculas ni acentos. */
    fun matchesQuery(channel: ChatChannelDto, query: String): Boolean {
        val q = normalize(query)
        if (q.isEmpty()) return true
        return listOfNotNull(channel.name, channel.topic, channel.description)
            .any { normalize(it).contains(q) }
    }

    fun matchesFilter(channel: ChatChannelDto, filter: ChatListFilter, favoriteIds: Set<Long>): Boolean =
        when (filter) {
            ChatListFilter.TODOS -> true
            ChatListFilter.NO_LEIDOS -> channel.unreadCount > 0 || channel.unread
            ChatListFilter.FAVORITOS -> channel.id in favoriteIds
            ChatListFilter.DIRECTOS -> channel.kind.equals("DIRECT", ignoreCase = true)
        }

    fun apply(
        channels: List<ChatChannelDto>,
        query: String,
        filter: ChatListFilter,
        favoriteIds: Set<Long>,
    ): List<ChatChannelDto> = channels.filter {
        matchesFilter(it, filter, favoriteIds) && matchesQuery(it, query)
    }

    /** Cuántos entran en cada chip (sin la búsqueda de texto, para que el número no baile al escribir). */
    fun count(channels: List<ChatChannelDto>, filter: ChatListFilter, favoriteIds: Set<Long>): Int =
        channels.count { matchesFilter(it, filter, favoriteIds) }

    private fun normalize(text: String): String =
        java.text.Normalizer.normalize(text.trim().lowercase(), java.text.Normalizer.Form.NFD)
            .replace(Regex("\\p{Mn}+"), "")
}
