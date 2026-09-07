package mx.nexara.mobile.nativeapp.data.integra.video

import android.content.Context
import com.squareup.moshi.Moshi
import com.squareup.moshi.Types
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.ApiClient
import okhttp3.ResponseBody
import java.lang.reflect.ParameterizedType

/**
 * Capa de datos del bloque de video. Mismo patrón que
 * [mx.nexara.mobile.nativeapp.data.integra.IntegraRepository]: Retrofit autenticado
 * desde [ApiClient.authed], respuestas crudas y parseo tolerante a mapas.
 *
 * Todas las funciones son `suspend` y no cambian de hilo por su cuenta: quien
 * llama las mete en `Dispatchers.IO`, igual que hacen las pantallas de INTEGRA
 * que ya existen.
 */
class IntegraVideoRepository(context: Context) {

    private val authRepo = AuthRepository(context)
    private val api: IntegraVideoApi = ApiClient.authed(
        tokenProvider = { authRepo.token() },
        companyIdProvider = { authRepo.companyId() },
    ).create(IntegraVideoApi::class.java)

    private val moshi: Moshi = Moshi.Builder().add(KotlinJsonAdapterFactory()).build()

    private val mapType: ParameterizedType = Types.newParameterizedType(
        Map::class.java,
        String::class.java,
        Any::class.java,
    )

    private fun parseMap(body: ResponseBody): Map<String, Any?> {
        val raw = body.string().trim()
        if (raw.isEmpty() || !raw.startsWith("{")) return emptyMap()
        return moshi.adapter<Map<String, Any?>>(mapType).fromJson(raw) ?: emptyMap()
    }

    /** Saca la lista venga como venga: array pelado, `items`, `list`, `data`… */
    private fun parseList(body: ResponseBody): List<Map<String, Any?>> {
        val raw = body.string().trim()
        if (raw.isEmpty()) return emptyList()
        if (raw.startsWith("[")) {
            val listType = Types.newParameterizedType(List::class.java, mapType)
            return moshi.adapter<List<Map<String, Any?>>>(listType).fromJson(raw)?.filterNotNull()
                ?: emptyList()
        }
        if (!raw.startsWith("{")) return emptyList()
        val root = moshi.adapter<Map<String, Any?>>(mapType).fromJson(raw) ?: return emptyList()
        for (key in listOf("items", "list", "data", "results", "rows")) {
            val nested = root[key]
            if (nested is List<*>) return asMapList(nested)
            val nestedMap = asMap(nested) ?: continue
            val inner = nestedMap["list"] ?: nestedMap["items"]
            if (inner is List<*>) return asMapList(inner)
        }
        return emptyList()
    }

    /** Inventario de cámaras. Las filas sin identificador se descartan. */
    suspend fun cameras(siteId: Int? = null): List<IntegraCamera> =
        parseList(api.listCameras(siteId = siteId)).mapNotNull { IntegraCamera.fromMap(it) }

    /**
     * Abre varias cámaras. Devuelve un mapa por id para que la rejilla case cada
     * celda con su resultado —incluido el fallido, que trae su motivo dentro—.
     *
     * Se trocea de 40 en 40 porque ese es el tope que valida el servidor
     * (`StreamsBatchDto`): mandar la lista entera de un sitio grande volvería con
     * un 400 y la rejilla se quedaría sin ninguna cámara en vez de sin ninguna
     * razón. Los lotes van en serie a propósito: cada registro reescribe el YAML
     * de go2rtc y las escrituras simultáneas son como se corrompió antes.
     */
    suspend fun openStreams(
        cameraIds: List<String>,
        siteId: Int? = null,
    ): Map<String, IntegraStreamSlot> {
        val unicas = cameraIds.map { it.trim() }.filter { it.isNotEmpty() }.distinct()
        if (unicas.isEmpty()) return emptyMap()

        val out = LinkedHashMap<String, IntegraStreamSlot>(unicas.size)
        for (lote in unicas.chunked(MAX_IDS_POR_LOTE)) {
            val root = parseMap(
                api.streamsBatch(
                    body = IntegraStreamsBatchRequest(cameraIds = lote),
                    siteId = siteId,
                ),
            )
            for (item in asMapList(root["items"])) {
                IntegraStreamSlot.fromBatchItem(item)?.let { out[it.cameraId] = it }
            }
        }
        return out
    }

    /** Reintento de una sola celda, sin arrastrar a las demás. */
    suspend fun openStream(cameraId: String, siteId: Int? = null): IntegraStreamSlot =
        IntegraStreamSlot.fromSingle(cameraId, parseMap(api.stream(cameraId, siteId = siteId)))

    /**
     * Presets de la domo. Solo los sitios ISAPI los tienen; en los demás el
     * servidor responde error y aquí se traduce en lista vacía, que es lo que la
     * pantalla necesita para no ofrecer un control que no existe.
     */
    suspend fun ptzPresets(cameraId: String, siteId: Int? = null): List<IntegraPtzPreset> =
        parseList(api.ptzPresets(cameraId, siteId = siteId))
            .mapNotNull { IntegraPtzPreset.fromMap(it) }

    suspend fun ptzMove(
        cameraId: String,
        pan: Int = 0,
        tilt: Int = 0,
        zoom: Int = 0,
        siteId: Int? = null,
    ) {
        api.ptz(cameraId, IntegraPtzRequest.move(pan = pan, tilt = tilt, zoom = zoom), siteId)
    }

    suspend fun ptzGoToPreset(cameraId: String, preset: Int, siteId: Int? = null) {
        api.ptz(cameraId, IntegraPtzRequest.goToPreset(preset), siteId)
    }

    suspend fun ptzStop(cameraId: String, siteId: Int? = null) {
        api.ptz(cameraId, IntegraPtzRequest.stop(), siteId)
    }

    /** Pide al equipo que guarde una captura. Ver [IntegraCaptureResult]. */
    suspend fun capture(cameraId: String, siteId: Int? = null): IntegraCaptureResult =
        IntegraCaptureResult.fromMap(parseMap(api.capture(cameraId, siteId = siteId)))

    /** RTSP crudo. Dato técnico: Android no lo reproduce. */
    suspend fun previewRtsp(cameraId: String, siteId: Int? = null): String? =
        parseMap(api.preview(cameraId, siteId = siteId)).str("url")

    private companion object {
        /** Tope de `StreamsBatchDto` en la API. */
        const val MAX_IDS_POR_LOTE = 40
    }
}
