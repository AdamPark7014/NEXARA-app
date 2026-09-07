package mx.nexara.mobile.nativeapp.ui.integra.governance

import android.app.Application
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.api.NotificationRowDto
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.integra.IntegraRepository
import mx.nexara.mobile.nativeapp.data.integra.governance.IntegraGovernanceRepository
import mx.nexara.mobile.nativeapp.data.integra.governance.PushEventStatsDto
import mx.nexara.mobile.nativeapp.data.notifications.NotificationsRepository
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxDimens
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxKpi
import mx.nexara.mobile.nativeapp.ui.enterprise.NxKpiGrid
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone

/**
 * Centro de notificaciones de INTEGRA.
 *
 * `/integra/notifications-center` redirige en la web a
 * `/erp/notifications-center`: el inbox es el mismo para todos los paneles, y
 * por eso aquí se reutiliza `NotificationsRepository` en vez de duplicar un
 * cliente. Lo que cambia en INTEGRA es la tercera pestaña: donde la web pone
 * «Señales de negocio» (feed de CRM/OC), un panel de accesos necesita el pulso
 * de los terminales.
 *
 * Ack y cierre de alarmas **no** están aquí a propósito: ya viven en
 * `IntegraAlarmsScreen`. Esta pantalla dice cuántas hay abiertas y manda allí.
 */

data class NotificacionesUiState(
    val loading: Boolean = true,
    val isRefreshing: Boolean = false,
    val error: String? = null,
    val items: List<NotificationRowDto> = emptyList(),
    val vista: VistaNotificaciones = VistaNotificaciones.ACCION,
    val bucket: BucketNotif = BucketNotif.TODAS,
    val expandida: Long? = null,
    val acting: Boolean = false,
    val mensaje: String? = null,
    val ahoraMs: Long = System.currentTimeMillis(),
    val senalesCargando: Boolean = false,
    val senalesError: String? = null,
    val stats: PushEventStatsDto? = null,
    val alarmasAbiertas: Int? = null,
) {
    val sinLeer: Int get() = items.count { it.isRead != true }
    val accionables: Int get() = items.count { esAccionable(it) }
    val altaPrioridad: Int get() = items.count { esAltaPrioridad(it) }
    val visibles: List<NotificationRowDto> get() = filtrarNotificaciones(items, vista, bucket)
}

class IntegraNotificationsViewModel(app: Application) : AndroidViewModel(app) {

    private val notifs = NotificationsRepository(app.applicationContext)
    private val gobierno = IntegraGovernanceRepository(app.applicationContext)
    private val integra = IntegraRepository(app.applicationContext)

    private val _state = MutableStateFlow(NotificacionesUiState())
    val state: StateFlow<NotificacionesUiState> = _state

    private var cargaEnCurso: Job? = null
    private var senalesEnCurso: Job? = null

    init { cargar(inicial = true) }

    fun setVista(vista: VistaNotificaciones) {
        _state.update { it.copy(vista = vista, mensaje = null) }
        if (vista == VistaNotificaciones.SENALES && _state.value.stats == null) cargarSenales()
    }

    fun setBucket(bucket: BucketNotif) = _state.update { it.copy(bucket = bucket) }

    fun alternarExpansion(n: NotificationRowDto) {
        val id = n.id
        _state.update { it.copy(expandida = if (it.expandida == id) null else id, mensaje = null) }
        // Abrir una notificación es leerla: es lo que hace la web y lo que
        // espera el contador del badge.
        if (n.isRead != true && _state.value.expandida == id) marcarLeida(id)
    }

    fun cargar(inicial: Boolean = false, refresco: Boolean = false) {
        cargaEnCurso?.cancel()
        _state.update {
            it.copy(
                loading = inicial || (!refresco && it.items.isEmpty()),
                isRefreshing = refresco,
                error = null,
            )
        }
        cargaEnCurso = viewModelScope.launch {
            try {
                val lista = withContext(Dispatchers.IO) { notifs.list(limit = 80, offset = 0) }
                _state.update {
                    it.copy(
                        loading = false,
                        isRefreshing = false,
                        items = lista,
                        ahoraMs = System.currentTimeMillis(),
                    )
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        loading = false,
                        isRefreshing = false,
                        error = e.toUserMessage("No se pudieron cargar las notificaciones"),
                    )
                }
            }
        }
        if (_state.value.vista == VistaNotificaciones.SENALES) cargarSenales()
    }

    fun refrescar() = cargar(refresco = true)

    /**
     * Pulso de los terminales. Las dos llamadas van por separado a propósito:
     * si la cola de alarmas falla, los KPIs del día se siguen viendo.
     */
    fun cargarSenales() {
        senalesEnCurso?.cancel()
        _state.update { it.copy(senalesCargando = true, senalesError = null) }
        senalesEnCurso = viewModelScope.launch {
            val stats = try {
                withContext(Dispatchers.IO) { gobierno.pushEventStats() }
            } catch (e: Exception) {
                _state.update { it.copy(senalesError = e.toUserMessage("No se pudieron leer los KPIs del día")) }
                null
            }
            val abiertas = try {
                withContext(Dispatchers.IO) { integra.alarmQueue(hours = 24).openCount }
            } catch (_: Exception) {
                null
            }
            _state.update {
                it.copy(
                    senalesCargando = false,
                    stats = stats ?: it.stats,
                    alarmasAbiertas = abiertas ?: it.alarmasAbiertas,
                )
            }
        }
    }

    fun marcarLeida(id: Long) {
        // Optimista: la lista se actualiza ya y se revierte si el servidor dice que no.
        val previo = _state.value.items
        _state.update { s ->
            s.copy(items = s.items.map { if (it.id == id) it.copy(isRead = true) else it })
        }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { notifs.markRead(id) }
            } catch (e: Exception) {
                _state.update {
                    it.copy(items = previo, error = e.toUserMessage("No se pudo marcar como leída"))
                }
            }
        }
    }

    fun marcarTodasLeidas() {
        val previo = _state.value.items
        _state.update { s ->
            s.copy(acting = true, items = s.items.map { it.copy(isRead = true) })
        }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { notifs.markAllRead() }
                _state.update { it.copy(acting = false, mensaje = "Todas marcadas como leídas") }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        acting = false,
                        items = previo,
                        error = e.toUserMessage("No se pudieron marcar todas"),
                    )
                }
            }
        }
    }

    fun eliminar(id: Long) {
        val previo = _state.value.items
        _state.update { s ->
            s.copy(items = s.items.filterNot { it.id == id }, expandida = null)
        }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { notifs.delete(id) }
            } catch (e: Exception) {
                _state.update {
                    it.copy(items = previo, error = e.toUserMessage("No se pudo eliminar"))
                }
            }
        }
    }
}

/**
 * @param onAbrirRelacionado destino de `relatedUrl`. Si es `null` la ruta se
 *   muestra como texto en vez de fingir un enlace que no lleva a ningún sitio;
 *   el cableado con la navegación lo pone quien registra la pantalla.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun IntegraNotificationsCenterScreen(
    vm: IntegraNotificationsViewModel = viewModel(),
    onAbrirRelacionado: ((String) -> Unit)? = null,
) {
    val s by vm.state.collectAsState()

    Column(Modifier.fillMaxSize()) {
        ScrollableTabRow(
            selectedTabIndex = VistaNotificaciones.entries.indexOf(s.vista),
            edgePadding = 12.dp,
        ) {
            VistaNotificaciones.entries.forEach { vista ->
                Tab(
                    selected = s.vista == vista,
                    onClick = { vm.setVista(vista) },
                    text = {
                        val badge = when (vista) {
                            VistaNotificaciones.ACCION -> s.accionables
                            VistaNotificaciones.BANDEJA -> s.sinLeer
                            VistaNotificaciones.SENALES -> 0
                        }
                        Text(if (badge > 0) "${vista.etiqueta} ($badge)" else vista.etiqueta)
                    },
                )
            }
        }

        if (s.vista == VistaNotificaciones.SENALES) {
            SenalesIntegra(state = s, onReintentar = vm::cargarSenales)
            return@Column
        }

        PullToRefreshBox(
            isRefreshing = s.isRefreshing,
            onRefresh = vm::refrescar,
            modifier = Modifier.fillMaxSize(),
        ) {
            when {
                s.loading -> NxLoadingBlock("Cargando notificaciones…")
                s.error != null && s.items.isEmpty() -> NxErrorBlock(s.error.orEmpty()) { vm.cargar() }
                else -> LazyColumn(
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    item {
                        NxKpiGrid(
                            items = listOf(
                                NxKpi("Sin leer", s.sinLeer.toString(), tone = NxTone.Brand),
                                NxKpi(
                                    "Acción ahora",
                                    s.accionables.toString(),
                                    tone = if (s.accionables > 0) NxTone.Warning else NxTone.Neutral,
                                ),
                                NxKpi(
                                    "Prioridad alta",
                                    s.altaPrioridad.toString(),
                                    tone = if (s.altaPrioridad > 0) NxTone.Danger else NxTone.Neutral,
                                ),
                            ),
                            columns = 3,
                        )
                    }
                    s.error?.let { err -> item { NxErrorBlock(err) { vm.cargar() } } }
                    s.mensaje?.let { msg -> item { Text(msg, color = NxColors.Success) } }

                    if (s.sinLeer > 0) {
                        item {
                            OutlinedButton(
                                onClick = vm::marcarTodasLeidas,
                                enabled = !s.acting,
                                modifier = Modifier.fillMaxWidth(),
                            ) { Text("Marcar todas leídas (${s.sinLeer})") }
                        }
                    }

                    if (s.vista == VistaNotificaciones.BANDEJA) {
                        item {
                            Row(
                                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                            ) {
                                BucketNotif.entries.forEach { bucket ->
                                    FilterChip(
                                        selected = s.bucket == bucket,
                                        onClick = { vm.setBucket(bucket) },
                                        label = { Text(bucket.etiqueta) },
                                    )
                                }
                            }
                        }
                    }

                    val visibles = s.visibles
                    if (visibles.isEmpty()) {
                        item {
                            NxEmptyState(
                                title = if (s.vista == VistaNotificaciones.ACCION) {
                                    "Nada que atender"
                                } else {
                                    "Bandeja vacía"
                                },
                                subtitle = if (s.vista == VistaNotificaciones.ACCION) {
                                    "No hay avisos sin leer con peso operativo. Mira la bandeja para ver el resto."
                                } else {
                                    "No hay notificaciones en este filtro."
                                },
                            )
                        }
                    } else {
                        items(items = visibles, key = { it.id }) { n ->
                            FilaNotificacion(
                                n = n,
                                expandida = s.expandida == n.id,
                                ahoraMs = s.ahoraMs,
                                onClick = { vm.alternarExpansion(n) },
                                onEliminar = { vm.eliminar(n.id) },
                                onAbrirRelacionado = onAbrirRelacionado,
                            )
                        }
                    }
                    item { Spacer(Modifier.height(16.dp)) }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FilaNotificacion(
    n: NotificationRowDto,
    expandida: Boolean,
    ahoraMs: Long,
    onClick: () -> Unit,
    onEliminar: () -> Unit,
    onAbrirRelacionado: ((String) -> Unit)?,
) {
    val leida = n.isRead == true
    val alta = esAltaPrioridad(n)

    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(NxDimens.PanelRadius),
        colors = CardDefaults.cardColors(
            containerColor = if (leida) NxColors.Surface else NxColors.Card,
        ),
        elevation = CardDefaults.cardElevation(NxDimens.PanelElevation),
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    n.title?.takeIf { it.isNotBlank() } ?: "Notificación sin título",
                    modifier = Modifier.weight(1f),
                    style = MaterialTheme.typography.bodyMedium.copy(
                        fontWeight = if (leida) FontWeight.Normal else FontWeight.SemiBold,
                    ),
                    color = NxColors.Slate,
                )
                if (alta) NxStatusChip("Alta", NxTone.Danger)
                if (!leida && !alta) NxStatusChip("Nueva", NxTone.Info)
            }
            Text(
                n.message?.takeIf { it.isNotBlank() } ?: "Sin cuerpo",
                style = MaterialTheme.typography.bodySmall,
                color = NxColors.Muted,
                maxLines = if (expandida) Int.MAX_VALUE else 2,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                NxStatusChip(etiquetaCategoria(n.category), NxTone.Neutral)
                Text(
                    antiguedadNotificacion(n.createdAt, ahoraMs),
                    style = MaterialTheme.typography.labelSmall,
                    color = NxColors.Muted,
                )
            }
            if (expandida) {
                val ruta = n.relatedUrl?.takeIf { it.isNotBlank() }
                if (ruta != null) {
                    if (onAbrirRelacionado != null) {
                        AssistChip(
                            onClick = { onAbrirRelacionado(ruta) },
                            label = { Text("Abrir") },
                        )
                    } else {
                        Text(
                            "Vinculada a: $ruta",
                            style = MaterialTheme.typography.labelSmall
                                .copy(fontFamily = FontFamily.Monospace),
                            color = NxColors.Muted,
                        )
                    }
                }
                TextButton(onClick = onEliminar) { Text("Eliminar", color = NxColors.Danger) }
            }
        }
    }
}

/**
 * Pulso de los terminales: lo que en la web es «Señales de negocio» y en un
 * panel de accesos no dice nada útil.
 */
@Composable
private fun SenalesIntegra(state: NotificacionesUiState, onReintentar: () -> Unit) {
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        if (state.senalesCargando && state.stats == null) {
            item { NxLoadingBlock("Leyendo los terminales…") }
        }
        state.senalesError?.let { err ->
            item { NxErrorBlock(err, onReintentar) }
        }
        state.stats?.let { st ->
            item {
                NxKpiGrid(
                    items = listOf(
                        NxKpi("Entradas hoy", (st.entradas ?: 0).toString(), tone = NxTone.Success),
                        NxKpi(
                            "Denegados",
                            (st.denegados ?: 0).toString(),
                            tone = if ((st.denegados ?: 0) > 0) NxTone.Warning else NxTone.Neutral,
                        ),
                        NxKpi("Personas únicas", (st.unicos ?: 0).toString(), tone = NxTone.Info),
                        NxKpi("En sitio ahora", (st.enSitio ?: 0).toString(), tone = NxTone.Brand),
                    ),
                    columns = 2,
                )
            }
            item {
                Text(
                    "Día operativo ${st.day ?: "—"} · fuente: integra/push/events/stats (eventos que empujan los terminales, zona America/Mexico_City).",
                    style = MaterialTheme.typography.labelSmall,
                    color = NxColors.Muted,
                )
            }
        }
        state.alarmasAbiertas?.let { abiertas ->
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(NxDimens.PanelRadius),
                    colors = CardDefaults.cardColors(
                        containerColor = if (abiertas > 0) NxColors.DangerSoft else NxColors.SuccessSoft,
                    ),
                ) {
                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(
                            if (abiertas > 0) "$abiertas alarma(s) abiertas" else "Sin alarmas abiertas",
                            style = MaterialTheme.typography.titleSmall
                                .copy(fontWeight = FontWeight.Bold),
                            color = NxColors.Slate,
                        )
                        Text(
                            "Últimas 24 h. Atender y cerrar se hace en «Alarmas SOC», que es donde vive esa acción.",
                            style = MaterialTheme.typography.bodySmall,
                            color = NxColors.Slate,
                        )
                    }
                }
            }
        }
        if (!state.senalesCargando && state.stats == null && state.senalesError == null) {
            item {
                NxEmptyState(
                    title = "Sin señales",
                    subtitle = "Ningún terminal ha publicado eventos todavía.",
                    actionLabel = "Reintentar",
                    onAction = onReintentar,
                )
            }
        }
    }
}
