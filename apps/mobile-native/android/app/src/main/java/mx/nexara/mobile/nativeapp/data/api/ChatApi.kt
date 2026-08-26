package mx.nexara.mobile.nativeapp.data.api

import okhttp3.MultipartBody
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.Query

data class ChatAuthorDto(
    val id: Long = 0L,
    val nombre: String = "",
    val email: String = "",
)

data class ChatChannelDto(
    val id: Long = 0L,
    val name: String = "",
    val kind: String = "",
    val slug: String? = null,
    val topic: String? = null,
    val description: String? = null,
    val memberCount: Int = 0,
    val unreadCount: Int = 0,
    val unread: Boolean = false,
    val lastMessageAt: String? = null,
    val lastMessagePreview: String? = null,
    val lastReadAt: String? = null,
)

data class ChatReactionDto(
    val emoji: String = "",
    val count: Int = 0,
    val userIds: List<Long> = emptyList(),
)

data class ChatMessageDto(
    val id: Long = 0L,
    val channelId: Long = 0L,
    val authorId: Long = 0L,
    val parentId: Long? = null,
    val body: String = "",
    val attachmentUrl: String? = null,
    val attachmentName: String? = null,
    val pinnedAt: String? = null,
    val editedAt: String? = null,
    val createdAt: String = "",
    val author: ChatAuthorDto? = null,
    val replyCount: Int = 0,
    val reactions: List<ChatReactionDto> = emptyList(),
)

data class ChatMessagesResponse(
    val messages: List<ChatMessageDto> = emptyList(),
    val hasMore: Boolean = false,
)

data class ChatPinsResponse(
    val messages: List<ChatMessageDto> = emptyList(),
)

data class ChatMentionDto(
    val kind: String = "",
    val id: Long = 0L,
    val label: String = "",
    val subtitle: String = "",
    val href: String? = null,
)

data class ChatUploadResponse(
    val url: String = "",
    val name: String = "",
)

data class PostChatMessageBody(
    val body: String,
    val parentId: Long? = null,
    val attachmentUrl: String? = null,
    val attachmentName: String? = null,
)

data class PostChatReactionBody(
    val emoji: String,
)

data class PatchChatMessageBody(
    val body: String,
)

data class ChatColleagueDto(
    val id: Long = 0L,
    val nombre: String = "",
    val email: String = "",
)

data class CreateChatChannelBody(
    val name: String,
    val kind: String? = null,
    val topic: String? = null,
    val description: String? = null,
)

data class UpdateChatTopicBody(
    val topic: String,
)

data class AddChatMemberBody(
    val userId: Long,
)

data class OpenChatDmBody(
    val userId: Long,
)

interface ChatApi {
    @GET("chat/channels")
    suspend fun listChannels(): List<ChatChannelDto>

    @POST("chat/channels")
    suspend fun createChannel(@Body body: CreateChatChannelBody): ChatChannelDto

    @PATCH("chat/channels/{id}/topic")
    suspend fun updateTopic(
        @Path("id") channelId: Long,
        @Body body: UpdateChatTopicBody,
    ): ChatChannelDto

    @POST("chat/channels/{id}/members")
    suspend fun addMember(
        @Path("id") channelId: Long,
        @Body body: AddChatMemberBody,
    ): ChatChannelDto

    @GET("chat/colleagues")
    suspend fun listColleagues(@Query("q") query: String? = null): List<ChatColleagueDto>

    @POST("chat/dm")
    suspend fun openDm(@Body body: OpenChatDmBody): ChatChannelDto

    @GET("chat/channels/{id}/messages")
    suspend fun listMessages(
        @Path("id") channelId: Long,
        @Query("limit") limit: Int? = 50,
        @Query("parentId") parentId: Long? = null,
        @Query("beforeId") beforeId: Long? = null,
    ): ChatMessagesResponse

    @GET("chat/channels/{id}/pins")
    suspend fun listPins(@Path("id") channelId: Long): ChatPinsResponse

    @GET("chat/mentions")
    suspend fun listMentions(
        @Query("q") query: String? = null,
        @Query("kind") kind: String? = null,
    ): List<ChatMentionDto>

    @PATCH("chat/channels/{id}/read")
    suspend fun markRead(@Path("id") channelId: Long): okhttp3.ResponseBody

    @POST("chat/channels/{id}/messages")
    suspend fun postMessage(
        @Path("id") channelId: Long,
        @Body body: PostChatMessageBody,
    ): ChatMessageDto

    @Multipart
    @POST("chat/upload")
    suspend fun uploadAttachment(@Part file: MultipartBody.Part): ChatUploadResponse

    @POST("chat/messages/{id}/reactions")
    suspend fun toggleReaction(
        @Path("id") messageId: Long,
        @Body body: PostChatReactionBody,
    ): ChatMessageDto

    @PATCH("chat/messages/{id}")
    suspend fun editMessage(
        @Path("id") messageId: Long,
        @Body body: PatchChatMessageBody,
    ): ChatMessageDto

    @POST("chat/messages/{id}/pin")
    suspend fun pinMessage(@Path("id") messageId: Long): ChatMessageDto
}
