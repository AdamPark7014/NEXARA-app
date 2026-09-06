package mx.nexara.mobile.nativeapp.push

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class NexaraNotificationsTest {

    @Test
    fun deepLinkDataFrom_stripsRoutingChannel_keepsEntityTypeAndChannelId() {
        val out = NexaraNotifications.deepLinkDataFrom(
            mapOf(
                "channel" to "tickets",
                "entityType" to "ticket",
                "relatedEntityId" to "22",
            ),
        )

        assertFalse(out.containsKey("channel"))
        assertEquals("ticket", out["entityType"])
        assertEquals("22", out["relatedEntityId"])
    }

    @Test
    fun deepLinkDataFrom_keepsNumericChannelForChat() {
        val out = NexaraNotifications.deepLinkDataFrom(
            mapOf(
                "channel" to "9",
                "entityType" to "chat_message",
                "relatedEntityId" to "55",
            ),
        )

        assertEquals("9", out["channel"])
        assertEquals("chat_message", out["entityType"])
    }

    @Test
    fun notificationChannelFrom_mapsRoutingKeys() {
        assertEquals(NexaraNotifications.CHANNEL_TICKETS, NexaraNotifications.notificationChannelFrom("tickets"))
        assertEquals(NexaraNotifications.CHANNEL_OPS, NexaraNotifications.notificationChannelFrom("ops"))
        assertEquals(NexaraNotifications.CHANNEL_CHAT, NexaraNotifications.notificationChannelFrom("chat"))
        assertEquals(NexaraNotifications.CHANNEL_APPROVALS, NexaraNotifications.notificationChannelFrom("approvals"))
        assertEquals(NexaraNotifications.CHANNEL_DEFAULT, NexaraNotifications.notificationChannelFrom("9"))
    }
}
