package mx.nexara.mobile.nativeapp.data.api

import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

data class KbPublicCategoryDto(
    val id: Long,
    val name: String,
    val icon: String? = null,
)

data class KbPublicArticleDto(
    val id: Long,
    val slug: String,
    val title: String,
    val excerpt: String? = null,
    val content: String,
    val category: KbPublicCategoryDto? = null,
    val tags: String? = null,
    val viewCount: Int = 0,
    val helpfulCount: Int = 0,
    val publishedAt: String? = null,
)

interface KbPublicApi {
    @GET("kb-public/articles")
    suspend fun listArticles(@Query("q") query: String? = null): List<KbPublicArticleDto>

    @POST("kb-public/articles/{id}/helpful")
    suspend fun markHelpful(@Path("id") id: Long): KbPublicArticleDto
}
