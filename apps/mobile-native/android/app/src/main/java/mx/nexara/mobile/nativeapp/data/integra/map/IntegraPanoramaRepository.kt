package mx.nexara.mobile.nativeapp.data.integra.map

import android.content.Context
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.ApiClient
import mx.nexara.mobile.nativeapp.data.integra.IntegraSiteScope

/**
 * El panorama de INTEGRA: «¿cómo está el sistema ahora?».
 *
 * Cinco peticiones en paralelo y **cada una falla por su cuenta**. Un sitio sin
 * empuje ACS no tiene `push/events/stats`, y uno recién dado de alta no tiene
 * cola de alarmas; que eso deje en blanco los conteos de puertas sería absurdo.
 * Lo que no responde se apunta en [PanoramaSnapshot.missing] y la pantalla lo
 * dice con palabras en lugar de pintar un cero que nadie sabría interpretar.
 *
 * Sólo lee. No hay ninguna orden aquí: atender alarmas, abrir puertas y
 * sincronizar tienen sus propias pantallas, ya nativas, y esta manda allí.
 */
class IntegraPanoramaRepository(context: Context) {

    private val authRepo = AuthRepository(context)

    private val api: IntegraPanoramaApi = ApiClient.authed(
        tokenProvider = { authRepo.token() },
        companyIdProvider = { authRepo.companyId() },
    ).create(IntegraPanoramaApi::class.java)

    private fun site(): Int? = IntegraSiteScope.current()

    /** Ventana de la cola SOC, la misma que usa la consola web. */
    private val alarmHours = 24

    /**
     * Foto completa.
     *
     * `GET integra/dashboard` es el único que **sí** puede tumbar la pantalla:
     * sin él no hay ni salud del enlace ni conteos, y fingir un panorama sin eso
     * sería un cascarón. Su excepción sube y la pantalla enseña el error de
     * verdad, con botón de reintentar.
     */
    suspend fun snapshot(): PanoramaSnapshot = coroutineScope {
        val siteId = site()

        val dashJob = async { MapJson.map(api.dashboard(siteId = siteId)) }
        val alarmsJob = async { runCatching { MapJson.map(api.alarmQueue(siteId = siteId, hours = alarmHours)) } }
        val occupancyJob = async { runCatching { MapJson.map(api.occupancy(siteId = siteId)) } }
        val todayJob = async { runCatching { MapJson.map(api.pushEventStats(siteId = siteId)) } }
        val camerasJob = async { runCatching { MapJson.list(api.listCameras(siteId = siteId)) } }

        val dash = dashJob.await()
        val missing = mutableListOf<PanoramaPart>()

        val counts = PanoramaCounts.fromMap(dash)
        val caps = dash.mmap("capabilities").orEmpty()

        val alarms = alarmsJob.await().getOrElse {
            missing += PanoramaPart.ALARMS
            null
        }
        val occupancy = occupancyJob.await().getOrElse {
            missing += PanoramaPart.OCCUPANCY
            null
        }
        val todayRaw = todayJob.await().getOrElse {
            missing += PanoramaPart.TODAY
            null
        }
        val cameraRows = camerasJob.await().getOrElse {
            missing += PanoramaPart.CAMERAS
            null
        }

        val today = todayRaw?.let(PanoramaToday::fromMap)?.takeIf { it.hasAny }
        if (todayRaw != null && today == null) missing += PanoramaPart.TODAY

        PanoramaSnapshot(
            link = PanoramaLink.fromMap(dash),
            counts = counts,
            doorHealth = DoorHealth.of(counts.doors, counts.doorsOnline, counts.doorsOffline),
            cameraHealth = cameraRows?.let(CameraHealth::of),
            openAlarms = alarms?.mint("openCount"),
            alarmSource = alarms?.mstr("source"),
            // Sólo las primeras: esto es un panorama, no la cola. «Ver todas»
            // manda al módulo de alarmas, que es donde se atienden.
            topAlarms = alarms?.let { MapJson.itemsOf(it) }.orEmpty().take(TOP_ALARMS),
            onSite = occupancy?.mint("total") ?: today?.onSite,
            occupancyDay = occupancy?.mstr("day"),
            occupancyNote = occupancy?.mstr("note"),
            today = today,
            lastSync = readLastSync(dash),
            canSettings = caps.mbool("settings") ?: false,
            canControlDoors = caps.mbool("canControlDoors") ?: false,
            missing = missing.distinct(),
        )
    }

    /**
     * `lastSync` es la fila entera de `IntegraSyncRun`, o `null` si el sitio no
     * se ha sincronizado nunca. Interesa cuándo **terminó**; si sigue en marcha
     * no ha terminado y vale cuándo empezó.
     */
    private fun readLastSync(dash: Map<String, Any?>): String? {
        val row = dash.mmap("lastSync") ?: return dash.mstr("lastSync")
        return row.mstr("finishedAt") ?: row.mstr("startedAt")
    }

    private companion object {
        const val TOP_ALARMS = 5
    }
}
