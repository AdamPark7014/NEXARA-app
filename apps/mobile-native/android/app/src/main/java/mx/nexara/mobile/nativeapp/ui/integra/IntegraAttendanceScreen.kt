package mx.nexara.mobile.nativeapp.ui.integra

import android.app.Application
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
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
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.integra.IntegraRepository
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSearchField
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone
import mx.nexara.mobile.nativeapp.ui.integra.common.ATTENDANCE_DAY_RANGES
import mx.nexara.mobile.nativeapp.ui.integra.common.AVISO_SIN_SALIDA
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraFormat
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraNotice
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraSiteBar
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraSitesCache
import mx.nexara.mobile.nativeapp.ui.integra.common.agruparPorDia
import mx.nexara.mobile.nativeapp.ui.integra.common.attendanceMatches
import mx.nexara.mobile.nativeapp.ui.integra.common.attendanceRangeLabel
import mx.nexara.mobile.nativeapp.ui.integra.common.int
import mx.nexara.mobile.nativeapp.ui.integra.common.jornadaLabel
import mx.nexara.mobile.nativeapp.ui.integra.common.jornadaSinCerrar
import mx.nexara.mobile.nativeapp.ui.integra.common.jornadaTone
import mx.nexara.mobile.nativeapp.ui.integra.common.resumenDelDia
import mx.nexara.mobile.nativeapp.ui.integra.common.str
import java.time.Instant
import java.time.ZoneId
import java.time.temporal.ChronoUnit

/**
 * Asistencia deducida del control de accesos.
 *
 * La regla que manda en toda la pantalla ya está resuelta en el servidor y
 * **aquí no se toca**: `minutes` llega `null` cuando la persona sólo pasó una
 * vez ese día. Este hardware no emite señal de salida por control de acceso —
 * `ACS_EXIT_MINORS` está vacía a propósito, porque el único `minor` que la
 * producía era en realidad un fallo de reconocimiento facial. Así que una
 * jornada sin salida se enseña **como jornada sin salida**, no como una de cero
 * minutos ni cerrada a una hora inventada.
 *
 * Cambiar el rango **vuelve a pedir al servidor** con otro `from`; no se traen
 * treinta días para pintar siete.
 */
data class IntegraAttendanceUiState(
    val loading: Boolean = true,
    val isRefreshing: Boolean = false,
    val error: String? = null,
    val items: List<Map<String, Any?>> = emptyList(),
    val days: Int = 7,
    val query: String = "",
    val soloSinSalida: Boolean = false,
    val zone: ZoneId = IntegraFormat.MexicoCity,
)

class IntegraAttendanceViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = IntegraRepository(app.applicationContext)
    private val _state = MutableStateFlow(IntegraAttendanceUiState(zone = ZoneId.systemDefault()))
    val state: StateFlow<IntegraAttendanceUiState> = _state

    init { refresh() }

    fun setQuery(v: String) = _state.update { it.copy(query = v) }
    fun toggleSinSalida() = _state.update { it.copy(soloSinSalida = !it.soloSinSalida) }

    /** Otro rango es otra consulta, no un recorte de lo ya traído. */
    fun setDays(days: Int) {
        if (_state.value.days == days) return
        _state.update { it.copy(days = days, items = emptyList()) }
        refresh()
    }

    fun selectSite(siteId: Int?) {
        repo.selectSite(siteId)
        _state.update { it.copy(items = emptyList()) }
        refresh()
    }

    fun refresh(initial: Boolean = true) {
        _state.update {
            it.copy(loading = initial && it.items.isEmpty(), isRefreshing = !initial, error = null)
        }
        viewModelScope.launch {
            IntegraSitesCache.ensure(repo)
            val s = _state.value
            // «Hoy» arranca a medianoche local, no 24 h atrás.
            val ahora = Instant.now()
            val desde = if (s.days <= 1) {
                ahora.atZone(s.zone).toLocalDate().atStartOfDay(s.zone).toInstant()
            } else {
                ahora.minus(s.days.toLong(), ChronoUnit.DAYS)
            }
            try {
                val list = withContext(Dispatchers.IO) { repo.attendance(from = desde, to = ahora) }
                _state.update { it.copy(loading = false, isRefreshing = false, items = list) }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        loading = false,
                        isRefreshing = false,
                        error = e.toUserMessage("No se pudo cargar la asistencia ACS"),
                    )
                }
            }
        }
    }

    fun filtered(): List<Map<String, Any?>> {
        val s = _state.value
        return s.items.filter { row ->
            (!s.soloSinSalida || jornadaSinCerrar(row)) && attendanceMatches(row, s.query)
        }
    }

    fun sinCerrar(): Int = _state.value.items.count { jornadaSinCerrar(it) }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun IntegraAttendanceScreen(vm: IntegraAttendanceViewModel = viewModel()) {
    val s by vm.state.collectAsState()
    val sites by IntegraSitesCache.sites.collectAsState()
    val sitesLoading by IntegraSitesCache.loading.collectAsState()
    val filas = vm.filtered()
    val dias = agruparPorDia(filas)
    val personas = filas.mapNotNull { str(it, "personId").takeIf { id -> id.isNotBlank() } }
        .distinct().size

    PullToRefreshBox(
        isRefreshing = s.isRefreshing,
        onRefresh = { vm.refresh(initial = false) },
        modifier = Modifier.fillMaxSize(),
    ) {
        when {
            s.loading -> NxLoadingBlock("Cargando asistencia…")
            s.error != null && s.items.isEmpty() -> NxErrorBlock(s.error.orEmpty()) { vm.refresh() }
            else -> LazyColumn(
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                item {
                    IntegraSiteBar(sites = sites, loading = sitesLoading, onSelect = vm::selectSite)
                }
                item {
                    NxSectionHeader(
                        title = "Asistencia deducida",
                        subtitle = "${filas.size} jornada(s) · $personas persona(s)",
                    )
                }
                item {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        ATTENDANCE_DAY_RANGES.forEach { d ->
                            FilterChip(
                                selected = s.days == d,
                                onClick = { vm.setDays(d) },
                                label = { Text(attendanceRangeLabel(d)) },
                            )
                        }
                        FilterChip(
                            selected = s.soloSinSalida,
                            onClick = vm::toggleSinSalida,
                            label = { Text("Sin salida (${vm.sinCerrar()})") },
                        )
                    }
                }
                item {
                    NxSearchField(
                        value = s.query,
                        onValueChange = vm::setQuery,
                        placeholder = "Nombre o código…",
                    )
                }
                item { IntegraNotice(AVISO_SIN_SALIDA, NxTone.Info) }

                if (dias.isEmpty()) {
                    item {
                        NxEmptyState(
                            if (s.items.isEmpty()) "Sin registros" else "Ninguna coincide",
                            if (s.items.isEmpty()) {
                                "No hay accesos concedidos en el rango. La asistencia se arma con " +
                                    "los eventos que los terminales empujan a NEXARA."
                            } else {
                                "Ninguna de las ${s.items.size} jornadas cargadas coincide con el filtro."
                            },
                        )
                    }
                } else {
                    dias.forEach { (dia, filasDelDia) ->
                        item(key = "dia-$dia") {
                            NxSectionHeader(
                                title = IntegraFormat.dayLabel(dia, s.zone),
                                subtitle = resumenDelDia(filasDelDia),
                            )
                        }
                        items(filasDelDia, key = { "$dia|" + str(it, "personId") }) { row ->
                            AttendanceCard(row, s.zone)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun AttendanceCard(row: Map<String, Any?>, zone: ZoneId) {
    val minutes = int(row, "minutes")
    val passes = int(row, "passes") ?: 0
    val denied = int(row, "denied") ?: 0
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = NxColors.Card),
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        str(row, "personName").ifBlank { str(row, "personId") },
                        fontWeight = FontWeight.SemiBold,
                        color = NxColors.Slate,
                    )
                    Text(
                        str(row, "personId"),
                        style = MaterialTheme.typography.labelSmall,
                        color = NxColors.Muted,
                    )
                }
                NxStatusChip(jornadaLabel(minutes, passes), jornadaTone(minutes, passes))
            }
            Text(
                buildString {
                    append("Entrada ${IntegraFormat.time(str(row, "firstAt"), zone)}")
                    // El último paso sólo se enseña si de verdad hubo otro: con
                    // un solo pase, `lastAt` es el mismo evento de entrada.
                    if (passes > 1) {
                        append(" · Último paso ${IntegraFormat.time(str(row, "lastAt"), zone)}")
                    }
                },
                style = MaterialTheme.typography.bodySmall,
                color = NxColors.Muted,
            )
            Text(
                buildString {
                    append("$passes acceso(s)")
                    if (denied > 0) append(" · $denied denegado(s)")
                    val puerta = str(row, "firstDoor")
                    if (puerta.isNotBlank()) append(" · $puerta")
                },
                style = MaterialTheme.typography.labelSmall,
                color = NxColors.Muted,
            )
        }
    }
}
