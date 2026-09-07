package mx.nexara.mobile.nativeapp.ui.integra.detection

import android.app.Application
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.integra.detection.AcsFanoutEntry
import mx.nexara.mobile.nativeapp.data.integra.detection.DestructiveImpact
import mx.nexara.mobile.nativeapp.data.integra.detection.IntegraCapabilityCounts
import mx.nexara.mobile.nativeapp.data.integra.detection.IntegraSettingsRepository
import mx.nexara.mobile.nativeapp.data.integra.detection.IntegraSite
import mx.nexara.mobile.nativeapp.data.integra.detection.MODULE_LABELS
import mx.nexara.mobile.nativeapp.data.integra.detection.PROVIDERS
import mx.nexara.mobile.nativeapp.data.integra.detection.SiteDraft
import mx.nexara.mobile.nativeapp.data.integra.detection.SyncRun
import mx.nexara.mobile.nativeapp.data.integra.detection.deletionImpact
import mx.nexara.mobile.nativeapp.data.integra.detection.moduleApplies
import mx.nexara.mobile.nativeapp.data.integra.detection.moduleEnabled
import mx.nexara.mobile.nativeapp.data.integra.detection.moduleToggleImpact
import mx.nexara.mobile.nativeapp.data.integra.detection.providerLabel
import mx.nexara.mobile.nativeapp.data.integra.detection.siteDraftProblems
import mx.nexara.mobile.nativeapp.data.integra.detection.syncImpact
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxFormTextField
import mx.nexara.mobile.nativeapp.ui.enterprise.NxListRow
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone

/**
 * AJUSTES — paridad con `/integra/settings`.
 *
 * En Android, «Ajustes» existía solo como una lista de sitios de solo lectura.
 * Aquí se administra de verdad: alta, etiqueta, activación, predeterminado,
 * módulos por sitio, sincronización y baja.
 *
 * **Es un módulo destructivo y se comporta como tal.** Ninguna de las
 * operaciones que cambian el mundo se ejecuta desde un toque suelto: todas
 * pasan por [NxDestructiveConfirm], que dice qué se pierde con nombre y cifras,
 * y la baja de un sitio exige teclear su nombre. El precedente está documentado
 * en este proyecto: en la web, pulsar un pin del plano lo borraba sin preguntar.
 */

/* ── Lista de sitios ────────────────────────────────────────────────────── */

data class IntegraSettingsUiState(
    val loading: Boolean = true,
    val isRefreshing: Boolean = false,
    val error: String? = null,
    val sites: List<IntegraSite> = emptyList(),
    val counts: IntegraCapabilityCounts? = null,
)

class IntegraSettingsViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = IntegraSettingsRepository(app.applicationContext)
    private val _state = MutableStateFlow(IntegraSettingsUiState())
    val state: StateFlow<IntegraSettingsUiState> = _state

    init { refresh() }

    fun refresh(initial: Boolean = true) {
        _state.update {
            it.copy(loading = initial && it.sites.isEmpty(), isRefreshing = !initial, error = null)
        }
        viewModelScope.launch {
            try {
                val sites = withContext(Dispatchers.IO) { repo.sites() }
                // Las cifras del sitio son un extra: si fallan, la lista sigue
                // sirviendo. No se tumba la pantalla por un panel secundario.
                val counts = runCatching { withContext(Dispatchers.IO) { repo.capabilities() } }.getOrNull()
                _state.update {
                    it.copy(loading = false, isRefreshing = false, sites = sites, counts = counts)
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        loading = false,
                        isRefreshing = false,
                        error = e.toUserMessage("No se pudieron cargar los sitios"),
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun IntegraSettingsScreen(
    onOpenSite: (Int) -> Unit,
    onOpenNewSite: () -> Unit,
    vm: IntegraSettingsViewModel = viewModel(),
) {
    val s by vm.state.collectAsState()

    PullToRefreshBox(
        isRefreshing = s.isRefreshing,
        onRefresh = { vm.refresh(initial = false) },
        modifier = Modifier.fillMaxSize(),
    ) {
        when {
            s.loading -> NxLoadingBlock("Cargando sitios…")
            s.error != null && s.sites.isEmpty() -> NxErrorBlock(s.error.orEmpty()) { vm.refresh() }
            else -> LazyColumn(
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                item {
                    NxSectionHeader(
                        title = "Sitios INTEGRA",
                        subtitle = if (s.sites.isEmpty()) {
                            "Administración"
                        } else {
                            "${s.sites.size} conectados"
                        },
                    )
                }
                s.error?.let { err -> item { NxNotice(err, NxTone.Danger) } }
                if (s.sites.isEmpty()) {
                    item {
                        NxEmptyState(
                            "Agrega tu primer sitio",
                            "Un sitio es la conexión a HikCentral (en sitio), Hik-Connect (nube) " +
                                "o ISAPI directo. Después sincronizas el inventario.",
                            actionLabel = "Nuevo sitio",
                            onAction = onOpenNewSite,
                        )
                    }
                }
                items(s.sites, key = { it.id }) { site ->
                    NxListRow(
                        title = site.displayName,
                        subtitle = "${providerLabel(site.provider)} · ${site.host}",
                        meta = buildString {
                            val inv = site.inventory
                            if (!inv.isEmpty) {
                                append("${inv.cameras ?: 0} cámaras · ${inv.doors ?: 0} puertas · ")
                                append("${inv.people ?: 0} personas")
                                append(" · ")
                            }
                            append("Última sync: ${site.lastSyncAt ?: "nunca"}")
                        },
                        chipText = when {
                            !site.isActive -> "Inactivo"
                            site.isDefault -> "Predeterminado"
                            else -> "Activo"
                        },
                        chipTone = when {
                            !site.isActive -> NxTone.Neutral
                            site.isDefault -> NxTone.Info
                            else -> NxTone.Success
                        },
                        onClick = { onOpenSite(site.id) },
                    )
                }
                if (s.sites.isNotEmpty()) {
                    item {
                        OutlinedButton(onClick = onOpenNewSite, modifier = Modifier.fillMaxWidth()) {
                            Text("Nuevo sitio")
                        }
                    }
                }
                s.counts?.takeIf { it.entries.isNotEmpty() || it.modules.isNotEmpty() }?.let { c ->
                    item {
                        NxPanel("Lo que hay en el espejo") {
                            c.entries.forEach { (k, v) ->
                                NxKeyValue(k, v.toString())
                            }
                            if (c.modules.isNotEmpty()) {
                                Text(
                                    "Módulos encendidos: " +
                                        c.modules.filter { it.second }.joinToString(", ") { it.first }
                                            .ifBlank { "ninguno" },
                                    style = MaterialTheme.typography.labelSmall,
                                    color = NxColors.Muted,
                                )
                            }
                        }
                    }
                }
                item { Spacer(Modifier.height(24.dp)) }
            }
        }
    }
}

/* ── Detalle y administración de un sitio ───────────────────────────────── */

data class IntegraSiteDetailUiState(
    val loading: Boolean = true,
    val error: String? = null,
    val message: String? = null,
    val busy: Boolean = false,
    val site: IntegraSite? = null,
    val lastSync: SyncRun? = null,
    val fanout: List<AcsFanoutEntry> = emptyList(),
    val pending: DestructiveImpact? = null,
    val pendingAction: PendingSiteAction? = null,
    val deleted: Boolean = false,
)

/** Qué se ejecutará si el operador confirma el diálogo que está viendo. */
sealed interface PendingSiteAction {
    data object Delete : PendingSiteAction
    data object Sync : PendingSiteAction
    data class ToggleModule(val key: String, val enable: Boolean) : PendingSiteAction
    data class SetActive(val active: Boolean) : PendingSiteAction
    data object MakeDefault : PendingSiteAction
}

class IntegraSiteDetailViewModel(
    app: Application,
    private val siteId: Int,
) : AndroidViewModel(app) {
    private val repo = IntegraSettingsRepository(app.applicationContext)
    private val _state = MutableStateFlow(IntegraSiteDetailUiState())
    val state: StateFlow<IntegraSiteDetailUiState> = _state

    init { refresh() }

    fun refresh() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            try {
                val site = withContext(Dispatchers.IO) { repo.sites() }.firstOrNull { it.id == siteId }
                if (site == null) {
                    _state.update { it.copy(loading = false, error = "El sitio ya no está en la lista.") }
                    return@launch
                }
                val last = runCatching { withContext(Dispatchers.IO) { repo.lastSync(siteId) } }.getOrNull()
                val fanout = runCatching { withContext(Dispatchers.IO) { repo.acsFanout(siteId) } }
                    .getOrDefault(emptyList())
                _state.update {
                    it.copy(loading = false, site = site, lastSync = last, fanout = fanout)
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(loading = false, error = e.toUserMessage("No se pudo cargar el sitio"))
                }
            }
        }
    }

    /* ── Peticiones de confirmación ─────────────────────────────────── */

    fun askDelete() {
        val site = _state.value.site ?: return
        _state.update { it.copy(pending = deletionImpact(site), pendingAction = PendingSiteAction.Delete) }
    }

    fun askSync() {
        val site = _state.value.site ?: return
        _state.update { it.copy(pending = syncImpact(site), pendingAction = PendingSiteAction.Sync) }
    }

    fun askToggleModule(key: String, enable: Boolean) {
        val site = _state.value.site ?: return
        _state.update {
            it.copy(
                pending = moduleToggleImpact(site, key, enable),
                pendingAction = PendingSiteAction.ToggleModule(key, enable),
            )
        }
    }

    fun askSetActive(active: Boolean) {
        val site = _state.value.site ?: return
        val impact = if (active) {
            DestructiveImpact(
                title = "Reactivar sitio",
                message = "«${site.displayName}» volverá a aparecer y a sincronizarse.",
                confirmLabel = "Reactivar",
            )
        } else {
            DestructiveImpact(
                title = "Desactivar sitio",
                message = "«${site.displayName}» deja de aparecer en las pantallas de INTEGRA y " +
                    "deja de sincronizarse. No se borra nada: el inventario espejo se queda como " +
                    "está y vuelve al reactivarlo.",
                confirmLabel = "Desactivar",
            )
        }
        _state.update { it.copy(pending = impact, pendingAction = PendingSiteAction.SetActive(active)) }
    }

    fun askMakeDefault() {
        val site = _state.value.site ?: return
        _state.update {
            it.copy(
                pending = DestructiveImpact(
                    title = "Marcar como predeterminado",
                    message = "«${site.displayName}» pasará a ser el sitio que usan las pantallas " +
                        "que no nombran ninguno — para todos los usuarios de la empresa, no solo " +
                        "para ti. El que lo sea ahora dejará de serlo.",
                    confirmLabel = "Marcar predeterminado",
                ),
                pendingAction = PendingSiteAction.MakeDefault,
            )
        }
    }

    fun dismiss() = _state.update { it.copy(pending = null, pendingAction = null) }

    /* ── Ejecución ──────────────────────────────────────────────────── */

    fun confirm() {
        val site = _state.value.site ?: return
        val action = _state.value.pendingAction ?: return
        _state.update { it.copy(busy = true, pending = null, pendingAction = null, error = null, message = null) }
        viewModelScope.launch {
            try {
                when (action) {
                    PendingSiteAction.Delete -> {
                        withContext(Dispatchers.IO) { repo.deleteSite(site.id) }
                        _state.update {
                            it.copy(busy = false, deleted = true, message = "Sitio eliminado.")
                        }
                        return@launch
                    }
                    PendingSiteAction.Sync -> {
                        val run = withContext(Dispatchers.IO) { repo.runSync(site.id) }
                        _state.update {
                            it.copy(
                                busy = false,
                                lastSync = run ?: it.lastSync,
                                message = "Sincronización lanzada." +
                                    (run?.status?.let { st -> " Estado: $st." } ?: ""),
                            )
                        }
                    }
                    is PendingSiteAction.ToggleModule -> {
                        withContext(Dispatchers.IO) {
                            repo.setModuleEnabled(site, action.key, action.enable)
                        }
                        _state.update { it.copy(busy = false, message = "Módulo actualizado.") }
                    }
                    is PendingSiteAction.SetActive -> {
                        withContext(Dispatchers.IO) { repo.setActive(site, action.active) }
                        _state.update { it.copy(busy = false, message = "Sitio actualizado.") }
                    }
                    PendingSiteAction.MakeDefault -> {
                        withContext(Dispatchers.IO) { repo.makeDefault(site) }
                        _state.update { it.copy(busy = false, message = "Predeterminado actualizado.") }
                    }
                }
                refresh()
            } catch (e: Exception) {
                _state.update {
                    it.copy(busy = false, error = e.toUserMessage("No se pudo completar la acción"))
                }
            }
        }
    }

    companion object {
        fun factory(app: Application, siteId: Int) = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T =
                IntegraSiteDetailViewModel(app, siteId) as T
        }
    }
}

@Composable
fun IntegraSiteDetailScreen(siteId: Int, onDeleted: () -> Unit) {
    val app = LocalContext.current.applicationContext as Application
    val vm: IntegraSiteDetailViewModel = viewModel(
        key = "integra-site-$siteId",
        factory = IntegraSiteDetailViewModel.factory(app, siteId),
    )
    val s by vm.state.collectAsState()

    // La navegación de vuelta la decide quien llama. Va en un efecto y no en el
    // cuerpo de la composición: navegar mientras se compone es un `pop` en
    // mitad del dibujo y deja la pila en un estado que nadie eligió.
    LaunchedEffect(s.deleted) {
        if (s.deleted) onDeleted()
    }
    if (s.deleted) return

    s.pending?.let { impact ->
        NxDestructiveConfirm(
            impact = impact,
            busy = s.busy,
            danger = s.pendingAction is PendingSiteAction.Delete,
            onDismiss = vm::dismiss,
            onConfirm = vm::confirm,
        )
    }

    if (s.loading) {
        NxLoadingBlock("Cargando sitio…")
        return
    }
    val site = s.site
    if (site == null) {
        NxErrorBlock(s.error ?: "Sitio no encontrado") { vm.refresh() }
        return
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            NxSectionHeader(
                title = site.displayName,
                subtitle = "${providerLabel(site.provider)} · ${site.host}",
            )
        }
        s.message?.let { msg -> item { NxNotice(msg, NxTone.Success) } }
        s.error?.let { err -> item { NxNotice(err, NxTone.Danger) } }

        item {
            NxPanel("Estado") {
                NxKeyValue("Activo", if (site.isActive) "Sí" else "No")
                NxKeyValue("Predeterminado", if (site.isDefault) "Sí" else "No")
                NxKeyValue("Última sincronización", site.lastSyncAt ?: "Nunca")
                val inv = site.inventory
                if (!inv.isEmpty) {
                    NxKeyValue("Cámaras", (inv.cameras ?: 0).toString())
                    NxKeyValue("Puertas", (inv.doors ?: 0).toString())
                    NxKeyValue("Personas", (inv.people ?: 0).toString())
                    NxKeyValue("Vehículos", (inv.vehicles ?: 0).toString())
                }
            }
        }

        s.lastSync?.let { run ->
            item {
                NxPanel("Última corrida") {
                    NxKeyValue("Estado", run.status ?: "—")
                    NxKeyValue("Terminó", run.finishedAt ?: "sin terminar")
                    run.cameras?.let { NxKeyValue("Cámaras", it.toString()) }
                    run.doors?.let { NxKeyValue("Puertas", it.toString()) }
                    run.error?.let {
                        Text(it, style = MaterialTheme.typography.bodySmall, color = NxColors.Danger)
                    }
                }
            }
        }

        item {
            NxPanel("Módulos de este sitio") {
                Text(
                    "Apagar un módulo lo esconde para TODOS los usuarios del sitio. " +
                        "Los datos no se borran.",
                    style = MaterialTheme.typography.bodySmall,
                    color = NxColors.Muted,
                )
                MODULE_LABELS.forEach { (key, label) ->
                    val aplica = moduleApplies(site.provider, key)
                    val on = moduleEnabled(site, key)
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(label, style = MaterialTheme.typography.bodyMedium, color = NxColors.Slate)
                            if (!aplica) {
                                Text(
                                    "No existe en Hik-Connect (ADR-0019): el interruptor no haría nada.",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = NxColors.Muted,
                                )
                            }
                        }
                        Switch(
                            checked = aplica && on,
                            enabled = aplica && !s.busy,
                            onCheckedChange = { vm.askToggleModule(key, it) },
                        )
                    }
                }
            }
        }

        if (s.fanout.isNotEmpty()) {
            item {
                NxPanel("Últimos envíos a las terminales ACS") {
                    s.fanout.take(10).forEach { entry ->
                        Row(
                            Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(
                                    "${entry.op} · ${entry.employeeNo}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = NxColors.Slate,
                                )
                                Text(
                                    "${entry.at ?: "—"} · ${entry.okCount} ok / ${entry.failCount} fallos",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = NxColors.Muted,
                                )
                            }
                            if (entry.pendingRetry) NxStatusChip("Reintento", NxTone.Warning)
                        }
                    }
                }
            }
        }

        item {
            NxPanel("Acciones") {
                if (!site.isDefault) {
                    OutlinedButton(
                        onClick = vm::askMakeDefault,
                        enabled = !s.busy,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text("Marcar como predeterminado")
                    }
                }
                OutlinedButton(
                    onClick = { vm.askSetActive(!site.isActive) },
                    enabled = !s.busy,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(if (site.isActive) "Desactivar sitio" else "Reactivar sitio")
                }
                Button(
                    onClick = vm::askSync,
                    enabled = !s.busy,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = NxColors.Teal),
                ) {
                    Text(if (s.busy) "Trabajando…" else "Sincronizar inventario")
                }
                Button(
                    onClick = vm::askDelete,
                    enabled = !s.busy,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = NxColors.Danger),
                ) {
                    Text("Eliminar sitio")
                }
                Text(
                    "Eliminar pide escribir el nombre del sitio. No es desconfianza: es que la " +
                        "baja se lleva el inventario espejo entero.",
                    style = MaterialTheme.typography.labelSmall,
                    color = NxColors.Muted,
                )
            }
        }

        item { Spacer(Modifier.height(28.dp)) }
    }
}

/* ── Alta de sitio ──────────────────────────────────────────────────────── */

data class IntegraNewSiteUiState(
    val draft: SiteDraft = SiteDraft(),
    val problems: List<String> = emptyList(),
    val busy: Boolean = false,
    val error: String? = null,
    val created: Boolean = false,
    val isFirstSite: Boolean = false,
)

class IntegraNewSiteViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = IntegraSettingsRepository(app.applicationContext)
    private val _state = MutableStateFlow(IntegraNewSiteUiState())
    val state: StateFlow<IntegraNewSiteUiState> = _state

    init {
        viewModelScope.launch {
            val count = runCatching { withContext(Dispatchers.IO) { repo.sites() } }
                .getOrDefault(emptyList()).size
            _state.update { it.copy(isFirstSite = count == 0) }
        }
    }

    fun edit(block: (SiteDraft) -> SiteDraft) =
        _state.update { it.copy(draft = block(it.draft), problems = emptyList(), error = null) }

    fun create() {
        val draft = _state.value.draft
        val problems = siteDraftProblems(draft)
        if (problems.isNotEmpty()) {
            _state.update { it.copy(problems = problems) }
            return
        }
        _state.update { it.copy(busy = true, error = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.createSite(draft, _state.value.isFirstSite) }
                _state.update { it.copy(busy = false, created = true) }
            } catch (e: Exception) {
                _state.update {
                    it.copy(busy = false, error = e.toUserMessage("No se pudo crear el sitio"))
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun IntegraNewSiteScreen(
    onCreated: () -> Unit,
    vm: IntegraNewSiteViewModel = viewModel(),
) {
    val s by vm.state.collectAsState()

    LaunchedEffect(s.created) {
        if (s.created) onCreated()
    }
    if (s.created) return

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            NxSectionHeader(
                title = "Nuevo sitio",
                subtitle = "La conexión a HikCentral, Hik-Connect o un equipo ISAPI en LAN.",
            )
        }
        s.error?.let { err -> item { NxNotice(err, NxTone.Danger) } }
        if (s.problems.isNotEmpty()) {
            item { NxNotice(s.problems.joinToString("\n"), NxTone.Warning) }
        }
        item {
            NxPanel("Tipo de conexión") {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    PROVIDERS.forEach { p ->
                        FilterChip(
                            selected = s.draft.provider == p,
                            onClick = { vm.edit { d -> d.copy(provider = p) } },
                            label = { Text(p) },
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
                Text(
                    providerLabel(s.draft.provider),
                    style = MaterialTheme.typography.bodySmall,
                    color = NxColors.Muted,
                )
            }
        }
        item {
            NxPanel("Identificación") {
                NxFormTextField(
                    value = s.draft.name,
                    onValueChange = { v -> vm.edit { it.copy(name = v) } },
                    label = "Nombre interno",
                )
                NxFormTextField(
                    value = s.draft.label,
                    onValueChange = { v -> vm.edit { it.copy(label = v) } },
                    label = "Etiqueta visible (opcional)",
                )
                NxFormTextField(
                    value = s.draft.host,
                    onValueChange = { v -> vm.edit { it.copy(host = v) } },
                    label = "Servidor (https://…)",
                    keyboardType = KeyboardType.Uri,
                )
            }
        }
        item {
            NxPanel("Credenciales del sitio") {
                Text(
                    "Las teclea el cliente: NEXARA las guarda cifradas y no las vuelve a enseñar.",
                    style = MaterialTheme.typography.bodySmall,
                    color = NxColors.Muted,
                )
                NxFormTextField(
                    value = s.draft.appKey,
                    onValueChange = { v -> vm.edit { it.copy(appKey = v) } },
                    label = "appKey",
                )
                androidx.compose.material3.OutlinedTextField(
                    value = s.draft.appSecret,
                    onValueChange = { v -> vm.edit { it.copy(appSecret = v) } },
                    label = { Text("appSecret") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                )
            }
        }
        item {
            Button(
                onClick = vm::create,
                enabled = !s.busy,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = NxColors.Teal),
            ) {
                Text(if (s.busy) "Creando…" else "Crear sitio")
            }
        }
        if (s.isFirstSite) {
            item {
                NxNotice(
                    "Es el primer sitio de la empresa: quedará como predeterminado.",
                    NxTone.Info,
                )
            }
        }
        item { Spacer(Modifier.height(28.dp)) }
    }
}

/* ── Piezas locales ─────────────────────────────────────────────────────── */

@Composable
private fun NxKeyValue(label: String, value: String) {
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = NxColors.Muted)
        Text(value, style = MaterialTheme.typography.bodySmall, color = NxColors.Slate)
    }
}
