package mx.nexara.mobile.nativeapp.data.chat

import android.content.Context
import android.net.Uri
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.ApiClient
import mx.nexara.mobile.nativeapp.data.api.AddChatMemberBody
import mx.nexara.mobile.nativeapp.data.api.ChatApi
import mx.nexara.mobile.nativeapp.data.api.ChatChannelDto
import mx.nexara.mobile.nativeapp.data.api.ChatColleagueDto
import mx.nexara.mobile.nativeapp.data.api.ChatMentionDto
import mx.nexara.mobile.nativeapp.data.api.ChatMessageDto
import mx.nexara.mobile.nativeapp.data.api.ChatUploadResponse
import mx.nexara.mobile.nativeapp.data.api.CreateChatChannelBody
import mx.nexara.mobile.nativeapp.data.api.OpenChatDmBody
import mx.nexara.mobile.nativeapp.data.api.PatchChatMessageBody
import mx.nexara.mobile.nativeapp.data.api.PostChatMessageBody
import mx.nexara.mobile.nativeapp.data.api.PostChatReactionBody
import mx.nexara.mobile.nativeapp.data.api.UpdateChatTopicBody
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import java.io.File

class ChatRepository(context: Context) {
    private val appContext = context.applicationContext
    private val api: ChatApi =
        ApiClient.authed { AuthRepository(appContext).token() }.create(ChatApi::class.java)

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
