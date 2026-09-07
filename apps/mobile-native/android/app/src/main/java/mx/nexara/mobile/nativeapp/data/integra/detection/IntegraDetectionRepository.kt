package mx.nexara.mobile.nativeapp.data.integra.detection

import android.content.Context
import com.squareup.moshi.Moshi
import com.squareup.moshi.Types
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.ApiClient
import okhttp3.ResponseBody
import java.lang.reflect.ParameterizedType

/**
 * Lectura y escritura de los perfiles de detección.
 *
 * Se parsea a `Map<String, Any?>` y de ahí a los tipos de [DetectionContract],
 * en vez de mapear con `data class` de Moshi: casi todo el contrato es nulable
 * (`cameraName`, `deviceIp`, `channel`, `stored`, `capabilities`,
 * `lastAppliedAt`…) y un no-nulable que recibe `null` revienta la
 * deserialización y deja la pantalla vacía sin explicación. El mismo patrón que
 * `data/integra/IntegraRepository.kt`.
 */

/** Cámara del inventario, con lo poco que el selector necesita. */
data class DetectionCamera(
    val id: String,
    val name: String,
    val region: String?,
    /** IP del equipo que ve la escena: con ella se casan sus detecciones. */
    val sourceIp: String?,
    val model: String?,
    val isPtz: Boolean,
)

/** Desenlace de `POST …/detection/apply`. */
data class ApplyOutcome(
    val applied: Boolean,
    val note: String,
)

/** Desenlace de `POST integra/detection/capabilities/probe`. */
data class SiteProbeOutcome(
    val total: Int,
    val ok: Int,
    val items: List<SiteProbeItem>,
)

data class SiteProbeItem(
    val cameraId: String,
    val name: String?,
    val probeOk: Boolean,
    val note: String?,
)

/** Fila de `GET integra/detection/capabilities`. */
data class SiteCapabilityRow(
    val cameraId: String,
    val capabilities: CameraCapabilities,
)

internal object IntegraJson {
    private val moshi: Moshi = Moshi.Builder().add(KotlinJsonAdapterFactory()).build()

    private val mapType: ParameterizedType = Types.newParameterizedType(
        Map::class.java,
        String::class.java,
        Any::class.java,
    )

    private val listType: ParameterizedType = Types.newParameterizedType(List::class.java, mapType)

    fun map(body: ResponseBody): Map<String, Any?> {
        val raw = body.string().trim()
        if (raw.isEmpty() || !raw.startsWith("{")) return emptyMap()
        return moshi.adapter<Map<String, Any?>>(mapType).fromJson(raw) ?: emptyMap()
    }

    /**
     * Lista suelta o envuelta. `GET integra/sites` devuelve un array pelado y
     * el resto de endpoints un objeto con `items`: las dos formas conviven en
     * este controlador, así que se aceptan las dos.
     */
    fun list(body: ResponseBody): List<Map<String, Any?>> {
        val raw = body.string().trim()
        if (raw.isEmpty()) return emptyList()
        if (raw.startsWith("[")) {
            return moshi.adapter<List<Map<String, Any?>>>(listType).fromJson(raw) ?: emptyList()
        }
        val root = moshi.adapter<Map<String, Any?>>(mapType).fromJson(raw) ?: return emptyList()
        for (key in listOf("items", "list", "data", "results", "rows")) {
            val nested = root[key]
            if (nested is List<*>) {
                return nested.mapNotNull { row ->
                    if (row is Map<*, *>) {
                        row.entries
                            .filter { it.key is String }
                            .associate { (it.key as String) to it.value }
                    } else {
                        null
                    }
                }
            }
        }
        return emptyList()
    }

    fun itemsOf(root: Map<String, Any?>): List<Map<String, Any?>> {
        val items = root["items"] as? List<*> ?: return emptyList()
        return items.mapNotNull { row ->
            if (row is Map<*, *>) {
                row.entries.filter { it.key is String }.associate { (it.key as String) to it.value }
            } else {
                null
            }
        }
    }
}

class IntegraDetectionRepository(context: Context) {
    private val authRepo = AuthRepository(context)
    private val api: IntegraDetectionApi = ApiClient.authed(
        tokenProvider = { authRepo.token() },
        companyIdProvider = { authRepo.companyId() },
    ).create(IntegraDetectionApi::class.java)

    suspend fun cameras(siteId: Int? = null): List<DetectionCamera> =
        IntegraJson.list(api.listCameras(siteId = siteId)).mapNotNull { row ->
            val id = (row["id"] as? String)?.takeIf { it.isNotBlank() } ?: return@mapNotNull null
            DetectionCamera(
                id = id,
                name = (row["name"] as? String)?.takeIf { it.isNotBlank() } ?: id,
                region = (row["region"] as? String)?.takeIf { it.isNotBlank() },
                sourceIp = (row["sourceIp"] as? String)?.takeIf { it.isNotBlank() },
                model = (row["model"] as? String)?.takeIf { it.isNotBlank() },
                isPtz = row["isPtz"] == true,
            )
        }

    suspend fun profile(cameraId: String, siteId: Int? = null): DetectionProfile =
        parseProfile(IntegraJson.map(api.getDetectionProfile(cameraId, siteId)), cameraId)

    /**
     * Guarda el perfil. **No** escribe en el equipo.
     *
     * El cuerpo sale de [patchFromDraft], que a propósito **no manda
     * `regions`**: el teléfono no dibuja polígonos y el servidor solo toca esa
     * columna cuando el campo viene, así que omitirlo conserva las zonas.
     */
    suspend fun saveProfile(
        cameraId: String,
        draft: DetectionDraft,
        siteId: Int? = null,
    ): DetectionProfile = parseProfile(
        IntegraJson.map(api.patchDetectionProfile(cameraId, patchFromDraft(draft), siteId)),
        cameraId,
    )

    /** Escribe el perfil en la cámara. Guardar no es aplicar. */
    suspend fun apply(cameraId: String, siteId: Int? = null): ApplyOutcome {
        val root = IntegraJson.map(api.applyDetection(cameraId, siteId))
        return ApplyOutcome(
            applied = root["applied"] == true,
            note = (root["note"] as? String).orEmpty(),
        )
    }

    suspend fun probeCamera(cameraId: String, siteId: Int? = null): CameraCapabilities? =
        parseCapabilities(IntegraJson.map(api.probeCameraCapabilities(cameraId, siteId)), cameraId)

    suspend fun siteCapabilities(siteId: Int? = null): List<SiteCapabilityRow> {
        val root = IntegraJson.map(api.listDetectionCapabilities(siteId))
        return IntegraJson.itemsOf(root).mapNotNull { row ->
            val id = (row["cameraId"] as? String)?.takeIf { it.isNotBlank() } ?: return@mapNotNull null
            val caps = parseCapabilities(row, id) ?: return@mapNotNull null
            SiteCapabilityRow(cameraId = id, capabilities = caps)
        }
    }

    suspend fun probeSite(siteId: Int? = null): SiteProbeOutcome {
        val root = IntegraJson.map(api.probeSiteCapabilities(siteId))
        val items = IntegraJson.itemsOf(root).mapNotNull { row ->
            val id = (row["cameraId"] as? String)?.takeIf { it.isNotBlank() } ?: return@mapNotNull null
            SiteProbeItem(
                cameraId = id,
                name = (row["name"] as? String)?.takeIf { it.isNotBlank() },
                probeOk = row["probeOk"] == true,
                note = (row["note"] as? String)?.takeIf { it.isNotBlank() },
            )
        }
        return SiteProbeOutcome(
            total = (root["total"] as? Number)?.toInt() ?: items.size,
            ok = (root["ok"] as? Number)?.toInt() ?: items.count { it.probeOk },
            items = items,
        )
    }
}
