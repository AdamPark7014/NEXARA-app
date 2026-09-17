package mx.nexara.mobile.nativeapp.push

import mx.nexara.mobile.nativeapp.R
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

/** Cada `icon` que manda el servidor tiene glifo propio; lo desconocido cae en la campana. */
class NotificationEventIconsTest {

    @Test
    fun celebracionesTienenGlifoYColorDeFiesta() {
        assertEquals(R.drawable.ic_nx_cake, NotificationEventIcons.glyphRes("cumpleanos"))
        assertEquals(R.drawable.ic_nx_celebration, NotificationEventIcons.glyphRes("aniversario"))
        assertEquals(NotificationEventIcons.PINK, NotificationEventIcons.color("cumpleanos"))
        assertEquals(NotificationEventIcons.AMBER, NotificationEventIcons.color("aniversario"))
    }

    @Test
    fun alertaDeAsistenciaTieneIconoPropioYRojo() {
        // Contrato A: ATTENDANCE_FLAGGED (ubicación simulada, fuera de sitio, cierre automático).
        assertEquals(R.drawable.ic_nx_location_off, NotificationEventIcons.glyphRes("asistencia_alerta"))
        assertEquals(NotificationEventIcons.RED, NotificationEventIcons.color("asistencia_alerta"))
    }

    @Test
    fun rechazoYExcesoDeTiempoTienenSuGlifo() {
        // Contrato B: ACTIVITY_REJECTED_BY_ASSIGNEE (rojo) y ACTIVITY_OVERTIME (ámbar).
        assertEquals(R.drawable.ic_nx_event_busy, NotificationEventIcons.glyphRes("actividad_rechazada"))
        assertEquals(NotificationEventIcons.RED, NotificationEventIcons.color("actividad_rechazada"))
        assertEquals(R.drawable.ic_nx_hourglass_top, NotificationEventIcons.glyphRes("exceso_tiempo"))
        assertEquals(NotificationEventIcons.AMBER, NotificationEventIcons.color("exceso_tiempo"))
    }

    @Test
    fun iconosNuevosDelServidorNoCaenEnLaCampana() {
        listOf("cancelada", "falta_justificada", "cliente").forEach { icon ->
            assertNotEquals(icon, R.drawable.ic_nx_notifications, NotificationEventIcons.glyphRes(icon))
        }
        assertEquals(NotificationEventIcons.RED, NotificationEventIcons.color("cancelada"))
    }

    @Test
    fun iconoDesconocidoUsaLaCampanaAzul() {
        assertEquals(R.drawable.ic_nx_notifications, NotificationEventIcons.glyphRes("no_existe"))
        assertEquals(NotificationEventIcons.BLUE, NotificationEventIcons.color("no_existe"))
    }
}
