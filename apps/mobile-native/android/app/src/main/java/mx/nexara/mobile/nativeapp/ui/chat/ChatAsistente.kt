package mx.nexara.mobile.nativeapp.ui.chat

/**
 * Asistente de NEXARA en #general (`POST chat/asistente`), con la misma regla que la web
 * (`send` de `apps/web/components/WorkspaceChat.tsx`):
 *
 * un mensaje del canal —no una respuesta de hilo—, sin adjunto, en #general y que mencione al
 * asistente (`@asistente` escrito o la pastilla `[@Asistente](user:0)`) **no se publica**: va al
 * asistente y la respuesta solo la ve quien preguntó. Así nadie del canal ve datos que su rol no
 * alcanza, y la pregunta no queda como un mensaje al que nadie contesta.
 */
object ChatAsistente {

    /** `MENCION_ASISTENTE` de la web y del API (`ai/asistente-chat/texto.ts`). */
    private val MENCION = Regex("""\[@?asistente[^\]]*\]\(user:0\)|(^|\s)@asistente\b""", RegexOption.IGNORE_CASE)

    private val PASTILLA = Regex("""\[@?asistente[^\]]*\]\(user:0\)""", RegexOption.IGNORE_CASE)
    private val ESCRITA = Regex("""(^|\s)@asistente\b[,:]?""", RegexOption.IGNORE_CASE)

    /** El asistente solo vive en este canal (el API rechaza cualquier otro con 400). */
    const val SLUG_GENERAL = "general"

    /** Placeholder del redactor en #general (la web: «escribe @asistente para preguntarle a NEXARA»). */
    const val PLACEHOLDER_GENERAL = "Escribe o pregunta a @asistente…"

    /** Lo que se le enseña a quien abre el panel por primera vez. */
    const val PISTA = "Pregúntale de NEXARA · solo tú ves la respuesta"

    /** Cuántos turnos guarda el panel (la web guarda 20). */
    const val MAX_TURNOS = 20

    fun esMencion(texto: String?): Boolean = MENCION.containsMatchIn(texto.orEmpty())

    /**
     * ¿Este envío va al asistente en vez de publicarse? `parentId` es el hilo o la respuesta a la que
     * iría el mensaje (con él, se publica normal: la web solo intercepta el redactor del canal).
     */
    fun debePreguntar(texto: String?, slugCanal: String?, parentId: Long?, conAdjunto: Boolean): Boolean =
        parentId == null &&
            !conAdjunto &&
            slugCanal?.trim()?.lowercase() == SLUG_GENERAL &&
            !texto.isNullOrBlank() &&
            esMencion(texto)

    /** La pregunta como se ve en el panel: sin la mención al asistente (`preguntaVisible` de la web). */
    fun preguntaVisible(markup: String?): String = markup.orEmpty()
        .replace(PASTILLA, " ")
        .replace(ESCRITA, " ")
        .replace(Regex("""\s+"""), " ")
        .trim()

    /** Texto con el que se manda una sugerencia tocada (la web antepone la pastilla del asistente). */
    fun textoDeSugerencia(sugerencia: String): String = "@asistente ${sugerencia.trim()}"

    /** Pie de cada respuesta: de dónde salió. */
    fun etiquetaFuente(fuente: String?): String =
        if (fuente == "ia") "Respondido con IA" else "Respondido con datos de NEXARA"
}
