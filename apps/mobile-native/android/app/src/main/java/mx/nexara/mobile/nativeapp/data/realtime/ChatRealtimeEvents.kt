package mx.nexara.mobile.nativeapp.data.realtime

import mx.nexara.mobile.nativeapp.data.api.ChatAuthorDto
import mx.nexara.mobile.nativeapp.data.api.ChatMessageDto
import mx.nexara.mobile.nativeapp.data.api.ChatReactionDto
import org.json.JSONArray
import org.json.JSONObject

data class ChatTypingEvent(
    val channelId: Long,
    val userId: Long,
    val nombre: String,
    val at: Long,
)

data class ChatMessageDeletedEvent(
    val id: Long,
    val channelId: Long,
    val parentId: Long?,
)

data class ChatChannelUpdatedEvent(
    val id: Long,
    val topic: String?,
)

data class ChatMembersChangedEvent(
    val channelId: Long,
)

fun JSONObject.toChatMessageDto(): ChatMessageDto {
    val authorObj = optJSONObject("author")
    val author = authorObj?.let {
        ChatAuthorDto(
            id = it.optLong("id"),
            nombre = it.optString("nombre", ""),
            email = it.optString("email", ""),
        )
    }
    return ChatMessageDto(
        id = optLong("id"),
        channelId = optLong("channelId"),
        authorId = optLong("authorId"),
        parentId = if (isNull("parentId")) null else optLong("parentId"),
        body = optString("body", ""),
        attachmentUrl = optString("attachmentUrl").takeIf { it.isNotBlank() },
        attachmentName = optString("attachmentName").takeIf { it.isNotBlank() },
        pinnedAt = optString("pinnedAt").takeIf { it.isNotBlank() },
        createdAt = optString("createdAt", ""),
        author = author,
        replyCount = optInt("replyCount", 0),
        reactions = parseReactions(optJSONArray("reactions")),
    )
}

private fun parseReactions(arr: JSONArray?): List<ChatReactionDto> {
    if (arr == null) return emptyList()
    return (0 until arr.length()).mapNotNull { i ->
        val obj = arr.optJSONObject(i) ?: return@mapNotNull null
        val userIdsArr = obj.optJSONArray("userIds")
        val userIds = if (userIdsArr != null) {
            (0 until userIdsArr.length()).map { userIdsArr.optLong(it) }
        } else {
            emptyList()
        }
        ChatReactionDto(
            emoji = obj.optString("emoji", ""),
            count = obj.optInt("count", userIds.size),
            userIds = userIds,
        )
    }
}
