package mx.nexara.mobile.nativeapp.ui.shared

import mx.nexara.mobile.nativeapp.data.api.NotificationRowDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** «Abrir la bandeja la da por vista» y los filtros de la fila única de chips. */
class NotificationsSeenTest {

    private val rows = listOf(
        NotificationRowDto(id = 1, category = "activity", isRead = false),
        NotificationRowDto(id = 2, category = "chat", isRead = true),
        NotificationRowDto(id = 3, category = "attendance", isRead = null),
        // Módulo retirado de Core: nunca se lista ni se cuenta.
        NotificationRowDto(id = 4, category = "quotes", isRead = false),
    )

    @Test
    fun soloSeLlamaAlApiSiHayAlgoSinLeer() {
        assertTrue(NotificationSeen.shouldMarkAll(0, rows))
        assertTrue(NotificationSeen.shouldMarkAll(2, emptyList()))
        assertFalse(NotificationSeen.shouldMarkAll(0, listOf(NotificationRowDto(id = 9, isRead = true))))
        assertFalse(NotificationSeen.shouldMarkAll(0, emptyList()))
    }

    @Test
    fun lasSinLeerQuedanComoNuevasAunqueYaSeMarcaran() {
        val nuevos = NotificationSeen.unreadIds(rows)
        assertEquals(setOf(1L, 3L, 4L), nuevos)
        // Tras «leer todo» el servidor las devuelve leídas; la visita las sigue marcando «Nuevo».
        val leidas = rows.map { it.copy(isRead = true) }
        assertTrue(NotificationSeen.isNew(leidas[0], nuevos))
        assertFalse(NotificationSeen.isNew(leidas[1], nuevos))
    }

    @Test
    fun filtroNuevosUsaLaVisitaNoElServidor() {
        val leidas = rows.map { it.copy(isRead = true) }
        val nuevos = setOf(1L, 3L)
        val visibles = visibleNotificationRows(leidas, NotificationFilter.UNREAD, NotificationCategory.TODAS, nuevos)
        assertEquals(listOf(1L, 3L), visibles.map { it.id })
    }

    @Test
    fun categoriaYModulosRetirados() {
        val todas = visibleNotificationRows(rows, NotificationFilter.ALL, NotificationCategory.TODAS)
        assertEquals(listOf(1L, 2L, 3L), todas.map { it.id })
        val chat = visibleNotificationRows(rows, NotificationFilter.ALL, NotificationCategory.CHAT)
        assertEquals(listOf(2L), chat.map { it.id })
        val counts = notificationCategoryCounts(rows)
        assertEquals(3, counts[NotificationCategory.TODAS])
        assertEquals(1, counts[NotificationCategory.OPS])
        assertEquals(1, counts[NotificationCategory.ASISTENCIA])
        assertEquals(0, counts[NotificationCategory.OTRAS])
    }
}
