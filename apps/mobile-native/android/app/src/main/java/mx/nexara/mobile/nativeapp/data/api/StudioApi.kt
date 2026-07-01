package mx.nexara.mobile.nativeapp.data.api

import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.Query

// ── Hero slides ───────────────────────────────────────────────────────────
data class HeroSlideDto(
    val id: Long,
    val imageUrl: String? = null,
    val altText: String? = null,
    val caption: String? = null,
    val href: String? = null,
    val position: Int? = null,
    val isActive: Boolean? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
)

data class ReorderHeroSlidesBody(val ids: List<Long>)

// ── Case studies ────────────────────────────────────────────────────────────
data class CaseStudyDto(
    val id: Long,
    val titulo: String? = null,
    val slug: String? = null,
    val cliente: String? = null,
    val vertical: String? = null,
    val impacto: String? = null,
    val descripcion: String? = null,
    val cover: String? = null,
    val imageUrl: String? = null,
    val publicado: Boolean? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
)

data class CreateCaseStudyBody(
    val titulo: String,
    val slug: String? = null,
    val cliente: String,
    val vertical: String,
    val impacto: String,
    val descripcion: String? = null,
    val imageUrl: String? = null,
    val publicado: Boolean? = null,
)

data class UpdateCaseStudyBody(
    val titulo: String? = null,
    val slug: String? = null,
    val cliente: String? = null,
    val vertical: String? = null,
    val impacto: String? = null,
    val descripcion: String? = null,
    val imageUrl: String? = null,
    val publicado: Boolean? = null,
)

// ── Social posts ────────────────────────────────────────────────────────────
data class SocialPostDto(
    val id: Long,
    val red: String? = null,
    val titulo: String? = null,
    val contenido: String? = null,
    val mediaUrl: String? = null,
    val cuando: String? = null,
    val estado: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
)

data class CreateSocialPostBody(
    val red: String,
    val titulo: String,
    val contenido: String,
    val mediaUrl: String? = null,
    val cuando: String,
    val estado: String? = null,
)

data class UpdateSocialPostBody(
    val red: String? = null,
    val titulo: String? = null,
    val contenido: String? = null,
    val mediaUrl: String? = null,
    val cuando: String? = null,
    val estado: String? = null,
)

data class SocialEstadoBody(val estado: String)

// ── Page content ──────────────────────────────────────────────────────────
data class PageContentDto(
    val section: String? = null,
    val content: Any? = null,
    val updatedAt: String? = null,
    val updatedBy: String? = null,
)

data class UpsertPageContentBody(
    val content: Any,
    val updatedBy: String? = null,
)

data class PageSectionsResponse(val sections: List<String>? = null)

// ── News CRUD ───────────────────────────────────────────────────────────────
data class CreateNewsBody(
    val title: String,
    val slug: String? = null,
    val summary: String? = null,
    val content: String,
    val status: String? = null,
    val tags: List<String>? = null,
)

data class UpdateNewsBody(
    val title: String? = null,
    val slug: String? = null,
    val summary: String? = null,
    val content: String? = null,
    val status: String? = null,
    val tags: List<String>? = null,
)

// ── Contact update ──────────────────────────────────────────────────────────
data class UpdateContactMessageBody(
    val status: String? = null,
    val responseMessage: String? = null,
    val category: String? = null,
)

data class PaginatedTotal(val total: Int? = null)

/**
 * Endpoints del panel STUDIO (marca, marketing, sitio público).
 */
interface StudioApi {

    // Hero
    @GET("hero-slides")
    suspend fun listHeroSlides(): List<HeroSlideDto>

    @GET("hero-slides/{id}")
    suspend fun getHeroSlide(@Path("id") id: Long): HeroSlideDto

    @Multipart
    @POST("hero-slides")
    suspend fun createHeroSlide(
        @Part("altText") altText: RequestBody?,
        @Part("caption") caption: RequestBody?,
        @Part("href") href: RequestBody?,
        @Part("position") position: RequestBody?,
        @Part("isActive") isActive: RequestBody?,
        @Part image: MultipartBody.Part?,
    ): HeroSlideDto

    @Multipart
    @PUT("hero-slides/{id}")
    suspend fun updateHeroSlide(
        @Path("id") id: Long,
        @Part("altText") altText: RequestBody?,
        @Part("caption") caption: RequestBody?,
        @Part("href") href: RequestBody?,
        @Part("position") position: RequestBody?,
        @Part("isActive") isActive: RequestBody?,
        @Part image: MultipartBody.Part?,
    ): HeroSlideDto

    @PATCH("hero-slides/reorder")
    suspend fun reorderHeroSlides(@Body body: ReorderHeroSlidesBody): List<HeroSlideDto>

    @DELETE("hero-slides/{id}")
    suspend fun deleteHeroSlide(@Path("id") id: Long)

    // Case studies
    @GET("case-studies")
    suspend fun listCaseStudiesRaw(
        @Query("limit") limit: Int? = 100,
        @Query("page") page: Int? = null,
    ): okhttp3.ResponseBody

    @GET("case-studies/{id}")
    suspend fun getCaseStudy(@Path("id") id: Long): CaseStudyDto

    @POST("case-studies")
    suspend fun createCaseStudy(@Body body: CreateCaseStudyBody): CaseStudyDto

    @PATCH("case-studies/{id}")
    suspend fun updateCaseStudyJson(
        @Path("id") id: Long,
        @Body body: UpdateCaseStudyBody,
    ): CaseStudyDto

    @PATCH("case-studies/{id}/toggle-publicado")
    suspend fun toggleCasePublicado(@Path("id") id: Long): CaseStudyDto

    @DELETE("case-studies/{id}")
    suspend fun deleteCaseStudy(@Path("id") id: Long)

    // Social
    @GET("social-posts")
    suspend fun listSocialPostsRaw(
        @Query("limit") limit: Int? = 50,
        @Query("estado") estado: String? = null,
    ): okhttp3.ResponseBody

    @GET("social-posts/{id}")
    suspend fun getSocialPost(@Path("id") id: Long): SocialPostDto

    @POST("social-posts")
    suspend fun createSocialPost(@Body body: CreateSocialPostBody): SocialPostDto

    @PATCH("social-posts/{id}")
    suspend fun updateSocialPost(
        @Path("id") id: Long,
        @Body body: UpdateSocialPostBody,
    ): SocialPostDto

    @PATCH("social-posts/{id}/estado")
    suspend fun setSocialEstado(
        @Path("id") id: Long,
        @Body body: SocialEstadoBody,
    ): SocialPostDto

    @DELETE("social-posts/{id}")
    suspend fun deleteSocialPost(@Path("id") id: Long)

    // Page content
    @GET("studio/page-content")
    suspend fun listPageContent(): List<PageContentDto>

    @GET("studio/page-content/sections")
    suspend fun listPageSections(): PageSectionsResponse

    @GET("studio/page-content/{section}")
    suspend fun getPageContent(@Path("section") section: String): PageContentDto

    @PUT("studio/page-content/{section}")
    suspend fun upsertPageContent(
        @Path("section") section: String,
        @Body body: UpsertPageContentBody,
    ): PageContentDto

    // News mutations (reads via ExtraApi)
    @POST("news")
    suspend fun createNewsJson(@Body body: CreateNewsBody): NewsPostDto

    @PUT("news/{id}")
    suspend fun updateNewsJson(
        @Path("id") id: Long,
        @Body body: UpdateNewsBody,
    ): NewsPostDto

    @DELETE("news/{id}")
    suspend fun deleteNews(@Path("id") id: Long)

    // Contacts mutations (reads via ExtraApi)
    @PUT("contact-messages/{id}")
    suspend fun updateContactMessage(
        @Path("id") id: Long,
        @Body body: UpdateContactMessageBody,
    ): ContactMessageDto

    @DELETE("contact-messages/{id}")
    suspend fun deleteContactMessage(@Path("id") id: Long)

    // Dashboard aggregates
    @GET("contact-messages")
    suspend fun contactMessagesRaw(
        @Query("limit") limit: Int? = 1,
        @Query("page") page: Int? = null,
    ): okhttp3.ResponseBody
}
