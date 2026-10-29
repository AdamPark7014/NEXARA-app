package mx.nexara.mobile.nativeapp.data.chat

import android.content.Context
import android.net.Uri
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.ApiClient
import mx.nexara.mobile.nativeapp.data.api.AddChatMemberBody
import mx.nexara.mobile.nativeapp.data.api.ChatApi
import mx.nexara.mobile.nativeapp.data.api.ChatChannelDetailDto
import mx.nexara.mobile.nativeapp.data.api.ChatChannelDto
import mx.nexara.mobile.nativeapp.data.api.ChatColleagueDto
import mx.nexara.mobile.nativeapp.data.api.ChatMentionDto
import mx.nexara.mobile.nativeapp.data.api.ChatMessageDto
import mx.nexara.mobile.nativeapp.data.api.ChatSearchHitDto
import mx.nexara.mobile.nativeapp.data.api.ChatUploadResponse
import mx.nexara.mobile.nativeapp.data.api.SetChatMutedBody
import mx.nexara.mobile.nativeapp.data.api.CreateChatChannelBody
import mx.nexara.mobile.nativeapp.data.api.OpenChatDmBody
import mx.nexara.mobile.nativeapp.data.api.PatchChatMessageBody
import mx.nexara.mobile.nativeapp.data.api.PostChatMessageBody
import mx.nexara.mobile.nativeapp.data.api.PostChatReactionBody
import mx.nexara.mobile.nativeapp.data.api.UpdateChatTopicBody
import mx.nexara.mobile.nativeapp.data.api.ChatActividadCreadaDto
import mx.nexara.mobile.nativeapp.data.api.ChatAsistenteBody
import mx.nexara.mobile.nativeapp.data.api.ChatEstadoAsistenteDto
import mx.nexara.mobile.nativeapp.data.api.ChatLigasBody
import mx.nexara.mobile.nativeapp.data.api.ChatRespuestaAsistenteDto
import mx.nexara.mobile.nativeapp.data.api.ChatTarjetaLigaDto
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import java.io.File

/** Refs por llamada a `chat/ligas` (`MAX_REFS` del API). */
private const val CHAT_LIGAS_MAX = 40

class ChatRepository(context: Context) {
    private val appContext = context.applicationContext
    private val api: ChatApi =
        ApiClient.authed(
            tokenProvider = { AuthRepository(appContext).token() },
            companyIdProvider = { AuthRepository(appContext).companyId() },
        ).create(ChatApi::class.java)

    suspend fun channels(): List<ChatChannelDto> = api.listChannels()

    suspend fun createChannel(
        name: String,
        topic: String? = null,
        kind: String? = null,
        description: String? = null,
    ): ChatChannelDto = api.createChannel(
        CreateChatChannelBody(
            name = name.trim(),
            kind = kind,
            topic = topic?.trim()?.takeIf { it.isNotBlank() },
            description = description?.trim()?.takeIf { it.isNotBlank() },
        ),
    )

    suspend fun updateTopic(channelId: Long, topic: String): ChatChannelDto =
        api.updateTopic(channelId, UpdateChatTopicBody(topic.trim()))

    suspend fun addMember(channelId: Long, userId: Long): ChatChannelDto =
        api.addMember(channelId, AddChatMemberBody(userId))

    suspend fun colleagues(query: String? = null): List<ChatColleagueDto> =
        api.listColleagues(query?.trim()?.takeIf { it.isNotBlank() })

    suspend fun openDm(userId: Long): ChatChannelDto =
        api.openDm(OpenChatDmBody(userId))

    suspend fun messages(channelId: Long, limit: Int = 50): List<ChatMessageDto> =
        api.listMessages(channelId, limit).messages

    /**
     * Ventana centrada en [aroundId] (`GET chat/channels/:id/messages?aroundId=`):
     * así un enlace `?channel&msg` abre un mensaje anterior a los últimos 50.
     */
    suspend fun messagesAround(channelId: Long, aroundId: Long, limit: Int = 50): List<ChatMessageDto> =
        api.listMessages(channelId, limit = limit, aroundId = aroundId).messages

    /** Latest page filtered client-side; API has `beforeId` only (no `sinceId`). */
    suspend fun messagesNewSince(channelId: Long, afterId: Long?, limit: Int = 50): List<ChatMessageDto> {
        val page = api.listMessages(channelId, limit).messages
        return if (afterId == null) page else page.filter { it.id > afterId }
    }

    suspend fun threadReplies(channelId: Long, parentId: Long, limit: Int = 100): List<ChatMessageDto> =
        api.listMessages(channelId, limit = limit, parentId = parentId).messages

    suspend fun threadRepliesNewSince(
        channelId: Long,
        parentId: Long,
        afterId: Long?,
        limit: Int = 100,
    ): List<ChatMessageDto> {
        val page = api.listMessages(channelId, limit = limit, parentId = parentId).messages
        return if (afterId == null) page else page.filter { it.id > afterId }
    }

    suspend fun pins(channelId: Long): List<ChatMessageDto> =
        api.listPins(channelId).messages

    suspend fun mentions(query: String? = null, kind: String? = null): List<ChatMentionDto> =
        api.listMentions(query?.trim()?.takeIf { it.isNotBlank() }, kind)

    suspend fun markRead(channelId: Long) {
        runCatching { api.markRead(channelId) }
    }

    suspend fun send(
        channelId: Long,
        body: String,
        parentId: Long? = null,
        attachmentUrl: String? = null,
        attachmentName: String? = null,
    ): ChatMessageDto = api.postMessage(
        channelId,
        PostChatMessageBody(
            body = body.trim(),
            parentId = parentId,
            attachmentUrl = attachmentUrl,
            attachmentName = attachmentName,
        ),
    )

    suspend fun uploadAttachment(uri: Uri): ChatUploadResponse {
        val part = filePart(uri) ?: throw IllegalStateException("No se pudo leer el archivo")
        return api.uploadAttachment(part)
    }

    suspend fun toggleReaction(messageId: Long, emoji: String): ChatMessageDto =
        api.toggleReaction(messageId, PostChatReactionBody(emoji))

    suspend fun editMessage(messageId: Long, body: String): ChatMessageDto =
        api.editMessage(messageId, PatchChatMessageBody(body.trim()))

    suspend fun pinMessage(messageId: Long): ChatMessageDto =
        api.pinMessage(messageId)

    /** Ficha del canal: miembros, silencio y si la vista es supervisada. */
    suspend fun channelDetail(channelId: Long): ChatChannelDetailDto =
        api.getChannel(channelId)

    /** El API devuelve la ficha ya actualizada, así que no hace falta releer. */
    suspend fun setMuted(channelId: Long, muted: Boolean): ChatChannelDetailDto =
        api.setChannelMuted(channelId, SetChatMutedBody(muted))

    suspend fun leaveChannel(channelId: Long) {
        api.leaveChannel(channelId)
    }

    /**
     * El servidor exige dos caracteres como mínimo y con menos devuelve lista
     * vacía; se corta aquí para no gastar la petición.
     */
    suspend fun searchMessages(query: String, channelId: Long? = null): List<ChatSearchHitDto> {
        val q = query.trim()
        if (q.length < 2) return emptyList()
        return api.searchMessages(q, channelId).messages
    }

    // ── Ligas y asistente ────────────────────────────────────────────────────

    /**
     * Tarjetas de varias ligas en una sola llamada (`POST chat/ligas`), en tandas de
     * [CHAT_LIGAS_MAX] para no pasar el tope del API. Devuelve `ref → tarjeta`; las que el
     * API no reconoce simplemente no vienen.
     */
    suspend fun ligas(refs: List<String>): Map<String, ChatTarjetaLigaDto> {
        val unicas = refs.map { it.trim() }.filter { it.isNotEmpty() }.distinct()
        if (unicas.isEmpty()) return emptyMap()
        val out = LinkedHashMap<String, ChatTarjetaLigaDto>()
        unicas.chunked(CHAT_LIGAS_MAX).forEach { tanda ->
            out.putAll(api.resolveLigas(ChatLigasBody(tanda)))
        }
        return out
    }

    /** `POST chat/asistente`: la respuesta es solo para quien pregunta; nada se publica. */
    suspend fun askAsistente(texto: String, channelId: Long): ChatRespuestaAsistenteDto =
        api.askAsistente(ChatAsistenteBody(texto = texto.trim().take(2000), channelId = channelId))

    suspend fun asistenteEstado(): ChatEstadoAsistenteDto = api.asistenteEstado()

    /** Crea la actividad de una propuesta del asistente (la persona tocó «Crear»). */
    suspend fun createProposedActivity(payload: Map<String, Any?>): ChatActividadCreadaDto =
        api.createProposedActivity(payload)

    private fun filePart(uri: Uri): MultipartBody.Part? {
        val resolver = appContext.contentResolver
        val mime = resolver.getType(uri) ?: "application/octet-stream"
        val name = uri.lastPathSegment?.substringAfterLast('/') ?: "file"
        val tmp = File.createTempFile("nexara_chat_", "_$name", appContext.cacheDir)
        resolver.openInputStream(uri)?.use { input ->
            tmp.outputStream().use { output -> input.copyTo(output) }
        } ?: return null
        val body = tmp.asRequestBody(mime.toMediaType())
        return MultipartBody.Part.createFormData("file", name, body)
    }
}
