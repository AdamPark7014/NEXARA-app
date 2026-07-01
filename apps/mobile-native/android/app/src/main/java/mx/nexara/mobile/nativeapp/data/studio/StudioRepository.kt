package mx.nexara.mobile.nativeapp.data.studio

import android.content.Context
import android.net.Uri
import com.squareup.moshi.Moshi
import com.squareup.moshi.Types
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.ApiClient
import mx.nexara.mobile.nativeapp.data.api.CaseStudyDto
import mx.nexara.mobile.nativeapp.data.api.ContactMessageDto
import mx.nexara.mobile.nativeapp.data.api.CreateCaseStudyBody
import mx.nexara.mobile.nativeapp.data.api.CreateNewsBody
import mx.nexara.mobile.nativeapp.data.api.CreateSocialPostBody
import mx.nexara.mobile.nativeapp.data.api.ExtraApi
import mx.nexara.mobile.nativeapp.data.api.HeroSlideDto
import mx.nexara.mobile.nativeapp.data.api.NewsPostDto
import mx.nexara.mobile.nativeapp.data.api.NewsletterSubscriberDto
import mx.nexara.mobile.nativeapp.data.api.PageContentDto
import mx.nexara.mobile.nativeapp.data.api.ReorderHeroSlidesBody
import mx.nexara.mobile.nativeapp.data.api.SocialEstadoBody
import mx.nexara.mobile.nativeapp.data.api.SocialPostDto
import mx.nexara.mobile.nativeapp.data.api.StudioApi
import mx.nexara.mobile.nativeapp.data.api.UpdateCaseStudyBody
import mx.nexara.mobile.nativeapp.data.api.UpdateContactMessageBody
import mx.nexara.mobile.nativeapp.data.api.UpdateNewsBody
import mx.nexara.mobile.nativeapp.data.api.UpdateSocialPostBody
import mx.nexara.mobile.nativeapp.data.api.UpsertPageContentBody
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File
import java.lang.reflect.ParameterizedType

data class StudioDashboardStats(
    val contactTotal: Int,
    val casesTotal: Int,
    val casesPublished: Int,
    val socialDrafts: List<SocialPostDto>,
)

class StudioRepository(context: Context) {
    private val authRepo = AuthRepository(context)
    private val appContext = context.applicationContext
    private val api: StudioApi = ApiClient.authed { authRepo.token() }.create(StudioApi::class.java)
    private val extraApi: ExtraApi = ApiClient.authed { authRepo.token() }.create(ExtraApi::class.java)

    private val moshi = Moshi.Builder().add(KotlinJsonAdapterFactory()).build()

    private inline fun <reified T> parseList(raw: String): List<T> {
        val trimmed = raw.trim()
        if (trimmed.isEmpty()) return emptyList()
        val listType: ParameterizedType = Types.newParameterizedType(List::class.java, T::class.java)
        if (trimmed.startsWith("[")) {
            return moshi.adapter<List<T>>(listType).fromJson(trimmed) ?: emptyList()
        }
        if (trimmed.startsWith("{")) {
            val mapType = Types.newParameterizedType(Map::class.java, String::class.java, Any::class.java)
            val map = moshi.adapter<Map<String, Any?>>(mapType).fromJson(trimmed) ?: return emptyList()
            for (k in listOf("items", "data", "results", "rows")) {
                val v = map[k]
                if (v is List<*>) {
                    val reJson = moshi.adapter(Any::class.java).toJson(v)
                    return moshi.adapter<List<T>>(listType).fromJson(reJson) ?: emptyList()
                }
            }
        }
        return emptyList()
    }

    private suspend inline fun <reified T> parseListResponse(body: okhttp3.ResponseBody): List<T> =
        parseList(body.string())

    fun parseTotal(raw: String): Int? {
        val trimmed = raw.trim()
        if (!trimmed.startsWith("{")) return null
        val mapType = Types.newParameterizedType(Map::class.java, String::class.java, Any::class.java)
        val map = moshi.adapter<Map<String, Any?>>(mapType).fromJson(trimmed) ?: return null
        return (map["total"] as? Number)?.toInt()
    }

    private fun textPart(value: String?): RequestBody? =
        value?.toRequestBody("text/plain".toMediaType())

    private fun boolPart(value: Boolean?): RequestBody? =
        value?.toString()?.toRequestBody("text/plain".toMediaType())

    private fun intPart(value: Int?): RequestBody? =
        value?.toString()?.toRequestBody("text/plain".toMediaType())

    private fun imagePart(uri: Uri, fieldName: String): MultipartBody.Part? {
        val resolver = appContext.contentResolver
        val mime = resolver.getType(uri) ?: "image/jpeg"
        val name = uri.lastPathSegment?.substringAfterLast('/') ?: "image.jpg"
        val tmp = File.createTempFile("nexara_upload_", "_$name", appContext.cacheDir)
        resolver.openInputStream(uri)?.use { input ->
            tmp.outputStream().use { output -> input.copyTo(output) }
        } ?: return null
        val body = tmp.asRequestBody(mime.toMediaType())
        return MultipartBody.Part.createFormData(fieldName, name, body)
    }

    // ── Dashboard ───────────────────────────────────────────────────────────
    suspend fun dashboardStats(): StudioDashboardStats {
        val contactRaw = api.contactMessagesRaw(limit = 1).string()
        val contactTotal = parseTotal(contactRaw) ?: parseList<ContactMessageDto>(contactRaw).size

        val cases = caseStudies()
        val casesPublished = cases.count { it.publicado == true }

        val social = socialPosts().filter { it.estado == "Programado" || it.estado == "Borrador" }.take(4)

        return StudioDashboardStats(
            contactTotal = contactTotal,
            casesTotal = cases.size,
            casesPublished = casesPublished,
            socialDrafts = social,
        )
    }

    // ── Hero ────────────────────────────────────────────────────────────────
    suspend fun heroSlides(): List<HeroSlideDto> = api.listHeroSlides()

    suspend fun createHeroSlide(
        altText: String?,
        caption: String?,
        href: String?,
        position: Int?,
        isActive: Boolean,
        imageUri: Uri?,
    ): HeroSlideDto = api.createHeroSlide(
        altText = textPart(altText),
        caption = textPart(caption),
        href = textPart(href),
        position = intPart(position),
        isActive = boolPart(isActive),
        image = imageUri?.let { imagePart(it, "image") },
    )

    suspend fun updateHeroSlide(
        id: Long,
        altText: String?,
        caption: String?,
        href: String?,
        position: Int?,
        isActive: Boolean?,
        imageUri: Uri?,
    ): HeroSlideDto = api.updateHeroSlide(
        id = id,
        altText = textPart(altText),
        caption = textPart(caption),
        href = textPart(href),
        position = intPart(position),
        isActive = boolPart(isActive),
        image = imageUri?.let { imagePart(it, "image") },
    )

    suspend fun reorderHeroSlides(ids: List<Long>) = api.reorderHeroSlides(ReorderHeroSlidesBody(ids))

    suspend fun deleteHeroSlide(id: Long) = api.deleteHeroSlide(id)

    // ── Cases ───────────────────────────────────────────────────────────────
    suspend fun caseStudies(): List<CaseStudyDto> =
        parseListResponse(api.listCaseStudiesRaw(limit = 100))

    suspend fun getCaseStudy(id: Long) = api.getCaseStudy(id)

    suspend fun createCaseStudy(body: CreateCaseStudyBody) = api.createCaseStudy(body)

    suspend fun updateCaseStudy(id: Long, body: UpdateCaseStudyBody) = api.updateCaseStudyJson(id, body)

    suspend fun toggleCasePublicado(id: Long) = api.toggleCasePublicado(id)

    suspend fun deleteCaseStudy(id: Long) = api.deleteCaseStudy(id)

    // ── Social ──────────────────────────────────────────────────────────────
    suspend fun socialPosts(estado: String? = null): List<SocialPostDto> =
        parseListResponse(api.listSocialPostsRaw(limit = 50, estado = estado))

    suspend fun createSocialPost(body: CreateSocialPostBody) = api.createSocialPost(body)

    suspend fun updateSocialPost(id: Long, body: UpdateSocialPostBody) = api.updateSocialPost(id, body)

    suspend fun setSocialEstado(id: Long, estado: String) =
        api.setSocialEstado(id, SocialEstadoBody(estado))

    suspend fun deleteSocialPost(id: Long) = api.deleteSocialPost(id)

    // ── Pages ───────────────────────────────────────────────────────────────
    suspend fun pageSections(): List<String> =
        api.listPageSections().sections ?: emptyList()

    suspend fun listPageContent(): List<PageContentDto> = api.listPageContent()

    suspend fun getPageContent(section: String) = api.getPageContent(section)

    suspend fun upsertPageContent(section: String, content: Any) =
        api.upsertPageContent(section, UpsertPageContentBody(content = content))

    // ── News ────────────────────────────────────────────────────────────────
    suspend fun news(search: String? = null, status: String? = null): List<NewsPostDto> =
        parseListResponse(extraApi.getNewsRaw(search, status))

    suspend fun createNews(body: CreateNewsBody) = api.createNewsJson(body)

    suspend fun updateNews(id: Long, body: UpdateNewsBody) = api.updateNewsJson(id, body)

    suspend fun deleteNews(id: Long) = api.deleteNews(id)

    // ── Contacts / Leads ────────────────────────────────────────────────────
    suspend fun contactMessages(
        status: String? = null,
        category: String? = null,
        limit: Int? = 50,
        page: Int? = null,
    ): List<ContactMessageDto> {
        val raw = extraApi.getContactMessagesRaw(status, category).string()
        return parseList(raw)
    }

    suspend fun updateContactMessage(id: Long, body: UpdateContactMessageBody) =
        api.updateContactMessage(id, body)

    suspend fun deleteContactMessage(id: Long) = api.deleteContactMessage(id)

    // ── Newsletter ──────────────────────────────────────────────────────────
    suspend fun newsletter(search: String? = null): List<NewsletterSubscriberDto> =
        parseListResponse(extraApi.getNewsletterRaw(search))
}
