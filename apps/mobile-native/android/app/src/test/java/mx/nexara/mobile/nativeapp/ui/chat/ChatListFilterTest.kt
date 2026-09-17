package mx.nexara.mobile.nativeapp.ui.chat

import mx.nexara.mobile.nativeapp.data.api.ChatChannelDto
import org.junit.Assert.assertEquals
import org.junit.Test

class ChatListFilterTest {

    private val canales = listOf(
        ChatChannelDto(id = 1, name = "general", kind = "PUBLIC", unreadCount = 0),
        ChatChannelDto(id = 2, name = "Operación Puebla", kind = "PRIVATE", topic = "Obras", unreadCount = 3),
        ChatChannelDto(id = 3, name = "Karla Núñez", kind = "DIRECT", unreadCount = 0, unread = true),
        ChatChannelDto(id = 4, name = "Juan", kind = "direct", unreadCount = 0),
    )

    private fun ids(list: List<ChatChannelDto>) = list.map { it.id }

    @Test
    fun todosSinBusquedaEsLaListaCompleta() {
        assertEquals(listOf(1L, 2L, 3L, 4L), ids(ChatListFiltering.apply(canales, "", ChatListFilter.TODOS, emptySet())))
    }

    @Test
    fun busquedaIgnoraMayusculasYAcentos() {
        assertEquals(listOf(2L), ids(ChatListFiltering.apply(canales, "operacion", ChatListFilter.TODOS, emptySet())))
        assertEquals(listOf(3L), ids(ChatListFiltering.apply(canales, "NUNEZ", ChatListFilter.TODOS, emptySet())))
        // El tema también cuenta.
        assertEquals(listOf(2L), ids(ChatListFiltering.apply(canales, "obras", ChatListFilter.TODOS, emptySet())))
    }

    @Test
    fun filtros() {
        assertEquals(listOf(2L, 3L), ids(ChatListFiltering.apply(canales, "", ChatListFilter.NO_LEIDOS, emptySet())))
        assertEquals(listOf(1L), ids(ChatListFiltering.apply(canales, "", ChatListFilter.FAVORITOS, setOf(1L))))
        assertEquals(listOf(3L, 4L), ids(ChatListFiltering.apply(canales, "", ChatListFilter.DIRECTOS, emptySet())))
        assertEquals(listOf(4L), ids(ChatListFiltering.apply(canales, "ju", ChatListFilter.DIRECTOS, emptySet())))
    }

    @Test
    fun conteoDeChipsNoDependeDeLaBusqueda() {
        assertEquals(2, ChatListFiltering.count(canales, ChatListFilter.NO_LEIDOS, emptySet()))
        assertEquals(2, ChatListFiltering.count(canales, ChatListFilter.DIRECTOS, emptySet()))
        assertEquals(0, ChatListFiltering.count(canales, ChatListFilter.FAVORITOS, emptySet()))
    }
}
