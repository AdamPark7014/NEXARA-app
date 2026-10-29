package mx.nexara.mobile.nativeapp.ui.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Regla de la web (`send` de `WorkspaceChat.tsx`): qué va al asistente y qué se publica. */
class ChatAsistenteTest {

    @Test
    fun `arroba asistente en general va al asistente`() {
        assertTrue(ChatAsistente.debePreguntar("@asistente ¿quién está en jornada?", "general", null, false))
        assertTrue(ChatAsistente.debePreguntar("Oye @Asistente, mis pendientes", "general", null, false))
        assertTrue(ChatAsistente.debePreguntar("[@Asistente](user:0) hola", "general", null, false))
    }

    @Test
    fun `fuera de general, en hilo o con adjunto se publica normal`() {
        assertFalse(ChatAsistente.debePreguntar("@asistente hola", "operaciones", null, false))
        assertFalse(ChatAsistente.debePreguntar("@asistente hola", null, null, false))
        assertFalse(ChatAsistente.debePreguntar("@asistente hola", "general", 15L, false))
        assertFalse(ChatAsistente.debePreguntar("@asistente hola", "general", null, true))
    }

    @Test
    fun `sin mencion no va al asistente`() {
        assertFalse(ChatAsistente.debePreguntar("hola equipo", "general", null, false))
        assertFalse(ChatAsistente.debePreguntar("escribe a soporte@asistente.mx", "general", null, false))
        assertFalse(ChatAsistente.debePreguntar("@asistentes de obra", "general", null, false))
        assertFalse(ChatAsistente.debePreguntar("   ", "general", null, false))
    }

    @Test
    fun `la pregunta visible quita la mencion`() {
        assertEquals("¿quién está en jornada?", ChatAsistente.preguntaVisible("@asistente, ¿quién está en jornada?"))
        assertEquals("mis pendientes", ChatAsistente.preguntaVisible("[@Asistente](user:0) mis pendientes"))
        assertEquals("Oye mis pendientes", ChatAsistente.preguntaVisible("Oye @asistente: mis pendientes"))
    }

    @Test
    fun `una sugerencia se manda mencionando al asistente`() {
        val texto = ChatAsistente.textoDeSugerencia("Mis pendientes de hoy")
        assertTrue(ChatAsistente.debePreguntar(texto, "general", null, false))
        assertEquals("Mis pendientes de hoy", ChatAsistente.preguntaVisible(texto))
    }

    @Test
    fun `pie de la respuesta`() {
        assertEquals("Respondido con IA", ChatAsistente.etiquetaFuente("ia"))
        assertEquals("Respondido con datos de NEXARA", ChatAsistente.etiquetaFuente("codigo"))
    }
}
