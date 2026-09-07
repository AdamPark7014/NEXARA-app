package mx.nexara.mobile.nativeapp.ui.integra

import android.app.Application
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.integra.IntegraRepository
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxKpi
import mx.nexara.mobile.nativeapp.ui.enterprise.NxKpiGrid
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraFormat
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraNotice
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraSiteBar
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraSitesCache
import mx.nexara.mobile.nativeapp.ui.integra.common.SyncAge
import mx.nexara.mobile.nativeapp.ui.integra.common.bool
import mx.nexara.mobile.nativeapp.ui.integra.common.int
import mx.nexara.mobile.nativeapp.ui.integra.common.str
import mx.nexara.mobile.nativeapp.ui.integra.common.syncAge
import java.time.Instant
import java.time.ZoneId

/**
 * Cabecera viva del hub de INTEGRA.
 *
 * El hub era una rejilla de tarjetas de colores: bonita y muda. Abrirla no
 * decía si el sitio estaba conectado, cuántas puertas había caídas ni si había
 * alarmas esperando. Esto lo dice antes de que el operador toque nada.
 *
 * Vive aparte de `IntegraNavHost` porque el hub es de otro dueño: se engancha
 * con una sola línea dentro de su `LazyColumn`.
 *
 * ```
 * item { IntegraHomeSummary() }
 * ```
 */
data class IntegraHomeUiState(
    val loading: Boolean = true,
    val connected: Boolean? = null,
    val host: String = "",
    val doors: Int = 0,
    val doorsOnline: Int = 0,
    val cameras: Int = 0,
    val people: Int = 0,
    val devices: Int = 0,
    val enSitio: Int = 0,
    val denegados: Int = 0,
    val alarmasAbiertas: Int = 0,
    val sync: SyncAge? = null,
    val syncRaw: String = "",
    val zone: ZoneId = IntegraFormat.MexicoCity,
)

class IntegraHomeViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = IntegraRepository(app.applicationContext)
    private val _state = MutableStateFlow(IntegraHomeUiState(zone = ZoneId.systemDefault()))
    val state: StateFlow<IntegraHomeUiState> = _state

    init { refresh() }

    fun selectSite(siteId: Int?) {
        repo.selectSite(siteId)
        refresh()
    }

    /**
     * Ninguna de las tres consultas puede tumbar el hub: si el panorama falla,
     * las tarjetas de módulo tienen que seguir abriéndose.
     */
    fun refresh() {
        _state.update { it.copy(loading = true) }
        viewModelScope.launch {
            IntegraSitesCache.ensure(repo)
            val dash = runCatching { withContext(Dispatchers.IO) { repo.dashboard() } }
                .getOrDefault(emptyMap())
            val stats = runCatching { withContext(Dispatchers.IO) { repo.pushEventStats() } }
                .getOrDefault(emptyMap())
            val alarmas = runCatching { withContext(Dispatchers.IO) { repo.alarmQueue() } }.getOrNull()
            val zone = _state.value.zone
            val ultimaSync = str(dash, "lastSync", "lastSyncAt")
            _state.update {
                it.copy(
                    loading = false,
                    connected = bool(dash, "connected"),
                    host = str(dash, "host"),
                    doors = int(dash, "doors") ?: 0,
                    doorsOnline = int(dash, "doorsOnline") ?: 0,
                    cameras = int(dash, "cameras") ?: 0,
                    people = int(dash, "people") ?: 0,
                    devices = int(dash, "devices") ?: 0,
                    enSitio = int(stats, "enSitio", "onSite") ?: 0,
                    denegados = int(stats, "denegados", "denied") ?: 0,
                    alarmasAbiertas = alarmas?.openCount ?: 0,
                    syncRaw = ultimaSync,
                    sync = syncAge(
                        lastSyncMs = IntegraFormat.parse(ultimaSync, zone)?.toInstant()?.toEpochMilli(),
                        nowMs = Instant.now().toEpochMilli(),
                    ),
                )
            }
        }
    }
}

@Composable
fun IntegraHomeSummary(vm: IntegraHomeViewModel = viewModel()) {
    val s by vm.state.collectAsState()
    val sites by IntegraSitesCache.sites.collectAsState()
    val sitesLoading by IntegraSitesCache.loading.collectAsState()
    val caidas = (s.doors - s.doorsOnline).coerceAtLeast(0)

    Column(
        Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        IntegraSiteBar(sites = sites, loading = sitesLoading, onSelect = vm::selectSite)

        // `null` no es «desconectado»: es que el panorama no contestó.
        when (s.connected) {
            false -> IntegraNotice(
                "Sin enlace con el sitio${if (s.host.isNotBlank()) " (${s.host})" else ""}. " +
                    "Lo que se ve abajo es el último espejo sincronizado, no el estado de ahora.",
                NxTone.Danger,
            )
            null -> if (!s.loading) {
                IntegraNotice(
                    "No se pudo consultar el estado del sitio. Los módulos siguen abriéndose, " +
                        "pero sus datos pueden estar desfasados.",
                    NxTone.Warning,
                )
            }
            true -> Unit
        }

        NxKpiGrid(
            items = listOf(
                NxKpi(
                    label = "Puertas en línea",
                    value = if (s.doors > 0) "${s.doorsOnline}/${s.doors}" else "—",
                    hint = if (caidas > 0) "$caidas sin conexión" else null,
                    tone = if (caidas > 0) NxTone.Danger else NxTone.Success,
                ),
                NxKpi(
                    label = "Alarmas pendientes",
                    value = s.alarmasAbiertas.toString(),
                    hint = if (s.alarmasAbiertas > 0) "Requieren decisión" else "Cola limpia",
                    tone = if (s.alarmasAbiertas > 0) NxTone.Danger else NxTone.Success,
                ),
                NxKpi(
                    label = "En sitio ahora",
                    value = s.enSitio.toString(),
                    tone = NxTone.Info,
                ),
                NxKpi(
                    label = "Denegados hoy",
                    value = s.denegados.toString(),
                    tone = if (s.denegados > 0) NxTone.Warning else NxTone.Neutral,
                ),
            ),
        )

        Text(
            buildString {
                append("${s.cameras} cámaras · ${s.people} personas · ${s.devices} equipos")
                s.sync?.let { append(" · espejo ${it.label}") }
            },
            style = MaterialTheme.typography.labelSmall,
            color = NxColors.Muted,
        )

        val sync = s.sync
        if (sync == null && !s.loading) {
            IntegraNotice(
                "El espejo no tiene fecha de última reconciliación. No se sabe de cuándo son " +
                    "estos números; sincroniza desde la consola web.",
                NxTone.Warning,
            )
        } else if (sync != null && sync.stale) {
            IntegraNotice(
                "El espejo lleva ${sync.label.removePrefix("hace ")} sin reconciliarse. " +
                    "Puertas, personas y equipos pueden no coincidir con lo que hay instalado.",
                NxTone.Warning,
            )
        }
    }
}
