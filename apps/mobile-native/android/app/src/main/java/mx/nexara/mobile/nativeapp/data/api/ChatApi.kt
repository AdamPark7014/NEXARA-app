package mx.nexara.mobile.nativeapp.data.api

import okhttp3.MultipartBody
import retrofit2.http.Body
import retrofit2.http.DELETE
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

data class ChatReactionUserDto(
    val id: Long = 0L,
    val nombre: String = "",
    val avatarUrl: String? = null,
    val reactedAt: String? = null,
)

data class ChatReactionDto(
    val emoji: String = "",
    val count: Int = 0,
    val userIds: List<Long> = emptyList(),
    /** Reactores en orden de reacción (más antiguo primero). Opcional por compatibilidad. */
    val users: List<ChatReactionUserDto> = emptyList(),
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

// ── Ficha de canal, silencio, salida y búsqueda ─────────────────────────────
// Cuatro endpoints que la consola web consumía y ninguna de las dos apps:
// `chat/channels/:id`, `chat/channels/:id/mute`, `chat/channels/:id/leave` y
// `chat/search`. Los tres primeros son ajustes que se hacen justo cuando el
// teléfono vibra por décima vez; el cuarto es cómo se encuentra el mensaje con
// el dato que hace falta estando en la calle.

data class ChatChannelMemberDto(
    val id: Long = 0L,
    val nombre: String = "",
    val email: String = "",
    val role: String = "",
    val lastReadAt: String? = null,
)

/**
 * `GET chat/channels/:id`.
 *
 * `supervised` y `readOnly` no son adorno: el servidor rechaza silenciar una
 * conversación supervisada (un jefe mirando el DM de sus reportes) con 403, así
 * que la app tiene que apagar el interruptor antes de intentarlo.
 */
data class ChatChannelDetailDto(
    val id: Long = 0L,
    val kind: String = "",
    val slug: String? = null,
    val name: String = "",
    val topic: String? = null,
    val description: String? = null,
    val lastMessageAt: String? = null,
    val memberCount: Int = 0,
    val supervised: Boolean = false,
    val readOnly: Boolean = false,
    val muted: Boolean = false,
    val mutedUntil: String? = null,
    val members: List<ChatChannelMemberDto> = emptyList(),
)

data class SetChatMutedBody(
    val muted: Boolean,
)

/** Canal al que pertenece un resultado de búsqueda. */
data class ChatSearchChannelDto(
    val id: Long = 0L,
    val name: String = "",
    val kind: String = "",
    val slug: String? = null,
)

/**
 * Mensaje encontrado. Es el mismo cuerpo que `ChatMessageDto` más el canal,
 * porque una búsqueda global cruza canales y sin decir cuál el resultado no
 * sirve de nada.
 */
data class ChatSearchHitDto(
    val id: Long = 0L,
    val channelId: Long = 0L,
    val authorId: Long = 0L,
    val parentId: Long? = null,
    val body: String = "",
    val attachmentUrl: String? = null,
    val attachmentName: String? = null,
    val createdAt: String = "",
    val author: ChatAuthorDto? = null,
    val channel: ChatSearchChannelDto? = null,
)

data class ChatSearchResponse(
    val messages: List<ChatSearchHitDto> = emptyList(),
)

// ── Ligas y asistente (paridad con la web, 29-10-2026) ──────────────────────
// `POST chat/ligas` arma las tarjetas de las ligas de los mensajes con los
// permisos de quien las ve; `POST chat/asistente` contesta solo a quien pregunta
// en #general (nada se publica en el canal).

data class ChatLigasBody(
    /** Rutas `/erp/…` de las ligas o `folio:AN-0031`; el API atiende 40 por llamada. */
    val refs: List<String>,
)

data class ChatLigaMontoDto(
    val total: Double = 0.0,
    val moneda: String? = null,
)

/** `TarjetaLiga` del API (`apps/api/src/chat/ligas/ligas.ts`), ya filtrada por permisos. */
data class ChatTarjetaLigaDto(
    val ref: String = "",
    val tipo: String = "",
    /** `false`: sin permiso o ya no existe; solo trae el título genérico y [motivo]. */
    val acceso: Boolean = false,
    val folio: String? = null,
    val titulo: String = "",
    val estado: String? = null,
    val detalle: List<String> = emptyList(),
    val monto: ChatLigaMontoDto? = null,
    val href: String = "",
    /** «Sin acceso», «No se encontró». */
    val motivo: String? = null,
)

data class ChatAsistenteBody(
    /** El mensaje tal cual, con la mención al asistente. */
    val texto: String,
    /** #general: el API rechaza cualquier otro canal. */
    val channelId: Long,
)

/** «Asígnale a…» (solo CEO): se crea solo al tocar «Crear», con `POST activities`. */
data class ChatPropuestaAsistenteDto(
    val resumen: String = "",
    val titulo: String = "",
    val responsable: String? = null,
    val cuando: String? = null,
    val faltantes: List<String> = emptyList(),
    val avisos: List<String> = emptyList(),
    /** Cuerpo listo para `POST activities`; se reenvía tal cual. */
    val payload: Map<String, Any?> = emptyMap(),
)

data class ChatAccionAsistenteDto(
    val tipo: String = "",
    val propuestas: List<ChatPropuestaAsistenteDto> = emptyList(),
)

data class ChatRespuestaAsistenteDto(
    val intencion: String = "",
    /** `codigo`: reglas y base de datos; `ia`: Claude por la puerta. */
    val fuente: String = "codigo",
    /** Markdown del chat: sus ligas `[…](/erp/…)` se pintan como tarjetas. */
    val texto: String = "",
    val sugerencias: List<String> = emptyList(),
    val accion: ChatAccionAsistenteDto? = null,
)

data class ChatEstadoAsistenteDto(
    val disponible: Boolean = false,
    val ia: Boolean = false,
)

data class ChatActividadCreadaDto(
    val id: Long = 0L,
    val anNumber: String? = null,
    /** La cola sin conexión contesta `{queued:true}`: se creará al volver la señal. */
    val queued: Boolean = false,
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

    /**
     * `aroundId` pide la ventana centrada en ese mensaje (el servidor devuelve
     * los anteriores y los posteriores), así un enlace `?channel&msg` abre un
     * mensaje viejo sin depender de que caiga en los últimos 50.
     */
    @GET("chat/channels/{id}/messages")
    suspend fun listMessages(
        @Path("id") channelId: Long,
        @Query("limit") limit: Int? = 50,
        @Query("parentId") parentId: Long? = null,
        @Query("beforeId") beforeId: Long? = null,
        @Query("aroundId") aroundId: Long? = null,
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

    /** Ficha del canal: miembros, silencio y si la vista es supervisada. */
    @GET("chat/channels/{id}")
    suspend fun getChannel(@Path("id") channelId: Long): ChatChannelDetailDto

    /** Silencia o reactiva el canal para el usuario actual. */
    @PATCH("chat/channels/{id}/mute")
    suspend fun setChannelMuted(
        @Path("id") channelId: Long,
        @Body body: SetChatMutedBody,
    ): ChatChannelDetailDto

    /**
     * Salir del canal. El servidor lo prohíbe en DM y en `general`/`anuncios`;
     * la app no ofrece el gesto en esos casos para no provocar un 400.
     */
    @DELETE("chat/channels/{id}/leave")
    suspend fun leaveChannel(@Path("id") channelId: Long): okhttp3.ResponseBody

    /** Búsqueda de mensajes; sin `channelId` cruza todos los canales visibles. */
    @GET("chat/search")
    suspend fun searchMessages(
        @Query("q") query: String,
        @Query("channelId") channelId: Long? = null,
    ): ChatSearchResponse

    /** Tarjetas de las ligas: un mapa `ref → tarjeta` (las que no reconoce no vienen). */
    @POST("chat/ligas")
    suspend fun resolveLigas(@Body body: ChatLigasBody): Map<String, ChatTarjetaLigaDto>

    /** Pregunta al asistente de #general. No publica nada en el canal. */
    @POST("chat/asistente")
    suspend fun askAsistente(@Body body: ChatAsistenteBody): ChatRespuestaAsistenteDto

    @GET("chat/asistente/estado")
    suspend fun asistenteEstado(): ChatEstadoAsistenteDto

    /** Crea la actividad de una propuesta del asistente con el cuerpo que trajo (`POST activities`). */
    @POST("activities")
    suspend fun createProposedActivity(
        @Body payload: Map<String, @JvmSuppressWildcards Any?>,
    ): ChatActividadCreadaDto
}
