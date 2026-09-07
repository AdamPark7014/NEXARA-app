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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
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
import mx.nexara.mobile.nativeapp.data.integra.detection.CapabilityState
import mx.nexara.mobile.nativeapp.data.integra.detection.DAY_LABELS
import mx.nexara.mobile.nativeapp.data.integra.detection.DestructiveImpact
import mx.nexara.mobile.nativeapp.data.integra.detection.DetectionCamera
import mx.nexara.mobile.nativeapp.data.integra.detection.DetectionDraft
import mx.nexara.mobile.nativeapp.data.integra.detection.DetectionProfile
import mx.nexara.mobile.nativeapp.data.integra.detection.IntegraDetectionRepository
import mx.nexara.mobile.nativeapp.data.integra.detection.SiteCapabilityRow
import mx.nexara.mobile.nativeapp.data.integra.detection.capabilityLabel
import mx.nexara.mobile.nativeapp.data.integra.detection.capabilityStateLabel
import mx.nexara.mobile.nativeapp.data.integra.detection.confidenceHint
import mx.nexara.mobile.nativeapp.data.integra.detection.confidenceLabel
import mx.nexara.mobile.nativeapp.data.integra.detection.draftFromProfile
import mx.nexara.mobile.nativeapp.data.integra.detection.draftProblems
import mx.nexara.mobile.nativeapp.data.integra.detection.sensitivityMeaning
import mx.nexara.mobile.nativeapp.data.integra.detection.targetLabel
import mx.nexara.mobile.nativeapp.data.integra.detection.windowSummary
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxListRow
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone

/**
 * DETECCIÓN — paridad con `/integra/detection`.
 *
 * Tres pantallas: el inventario de cámaras, la sintonización de una, y lo que
 * el parque declara soportar.
 *
 * **Qué es nativo aquí y qué no.** Sensibilidad, confianza, objetivo, horario y
 * el interruptor del perfil se editan de verdad. Los **polígonos no**: se ven
 * ([DetectionRegionPreview]) y se editan en la consola web. El motivo está en
 * ese fichero; en resumen, un editor de vértices con el dedo escribiría zonas
 * imprecisas en el equipo de un cliente y el fallo sería silencioso.
 *
 * **Guardar no es aplicar.** El PATCH cambia la fila de la base; el `apply`
 * escribe en la cámara. Son dos botones distintos porque son dos cosas
 * distintas, y confundirlos deja al operador creyendo que el equipo ya está
 * sintonizado cuando solo lo está la base de datos. Aplicar pide confirmación.
 */

/* ── Cámaras ────────────────────────────────────────────────────────────── */

data class DetectionCamerasUiState(
    val loading: Boolean = true,
    val isRefreshing: Boolean = false,
    val error: String? = null,
    val items: List<DetectionCamera> = emptyList(),
)

class IntegraDetectionCamerasViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = IntegraDetectionRepository(app.applicationContext)
    private val _state = MutableStateFlow(DetectionCamerasUiState())
    val state: StateFlow<DetectionCamerasUiState> = _state

    init { refresh() }

    fun refresh(initial: Boolean = true) {
        _state.update {
            it.copy(loading = initial && it.items.isEmpty(), isRefreshing = !initial, error = null)
        }
        viewModelScope.launch {
            try {
                val list = withContext(Dispatchers.IO) { repo.cameras() }
                _state.update { it.copy(loading = false, isRefreshing = false, items = list) }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        loading = false,
                        isRefreshing = false,
                        error = e.toUserMessage("No se pudieron listar las cámaras"),
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun IntegraDetectionCamerasScreen(
    onOpenCamera: (String) -> Unit,
    onOpenCapabilities: () -> Unit,
    vm: IntegraDetectionCamerasViewModel = viewModel(),
) {
    val s by vm.state.collectAsState()

    PullToRefreshBox(
        isRefreshing = s.isRefreshing,
        onRefresh = { vm.refresh(initial = false) },
        modifier = Modifier.fillMaxSize(),
    ) {
        when {
            s.loading -> NxLoadingBlock("Cargando cámaras…")
            s.error != null && s.items.isEmpty() -> NxErrorBlock(s.error.orEmpty()) { vm.refresh() }
            s.items.isEmpty() -> NxEmptyState(
                "Sin cámaras",
                "Este sitio no tiene cámaras en el espejo. Sincronízalo desde Ajustes.",
            )
            else -> LazyColumn(
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                item {
                    NxSectionHeader(
                        title = "Sintonización de detección",
                        subtitle = "Cada cámara con su zona, su sensibilidad y su horario. " +
                            "Antes se escribía la misma plantilla a ciegas en todas.",
                    )
                }
                item {
                    OutlinedButton(
                        onClick = onOpenCapabilities,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text("Ver qué soporta cada equipo")
                    }
                }
                s.error?.let { err ->
                    item { Text(err, color = NxColors.Danger) }
                }
                items(s.items, key = { it.id }) { cam ->
                    NxListRow(
                        title = cam.name,
                        subtitle = listOfNotNull(cam.region, cam.model).joinToString(" · ")
                            .ifBlank { "Sin región declarada" },
                        meta = cam.sourceIp?.let { "IP $it" },
                        chipText = if (cam.isPtz) "PTZ" else null,
                        chipTone = NxTone.Info,
                        onClick = { onOpenCamera(cam.id) },
                    )
                }
                item { Spacer(Modifier.height(24.dp)) }
            }
        }
    }
}

/* ── Sintonización de una cámara ────────────────────────────────────────── */

data class DetectionTuningUiState(
    val loading: Boolean = true,
    val error: String? = null,
    val message: String? = null,
    val profile: DetectionProfile? = null,
    val draft: DetectionDraft? = null,
    val saving: Boolean = false,
    val applying: Boolean = false,
    val probing: Boolean = false,
    val problems: List<String> = emptyList(),
    val pendingApply: DestructiveImpact? = null,
) {
    /** Hay cambios sin guardar: el borrador ya no es lo que confirmó el servidor. */
    val dirty: Boolean
        get() {
            val p = profile ?: return false
            val d = draft ?: return false
            return d != draftFromProfile(p)
        }
}

class IntegraDetectionTuningViewModel(
    app: Application,
    private val cameraId: String,
) : AndroidViewModel(app) {
    private val repo = IntegraDetectionRepository(app.applicationContext)
    private val _state = MutableStateFlow(DetectionTuningUiState())
    val state: StateFlow<DetectionTuningUiState> = _state

    init { refresh() }

    fun refresh() {
        _state.update { it.copy(loading = true, error = null, message = null) }
        viewModelScope.launch {
            try {
                val p = withContext(Dispatchers.IO) { repo.profile(cameraId) }
                _state.update {
                    it.copy(loading = false, profile = p, draft = draftFromProfile(p), problems = emptyList())
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        loading = false,
                        error = e.toUserMessage("No se pudo cargar el perfil de detección"),
                    )
                }
            }
        }
    }

    private fun edit(block: (DetectionDraft) -> DetectionDraft) {
        _state.update { s ->
            val d = s.draft ?: return@update s
            s.copy(draft = block(d), message = null, problems = emptyList())
        }
    }

    fun setEnabled(v: Boolean) = edit { it.copy(enabled = v) }

    /**
     * La sensibilidad viaja como `Int` y nunca «se rellena sola».
     *
     * Es el punto donde el servidor se rompió una vez: `Number(null) === 0`
     * escribía un 0 —cámara sorda— en cada perfil sin valor. Aquí el borrador
     * siempre nace del `effective` del servidor, que ya trae el 50 por defecto,
     * así que un 0 solo llega al equipo si alguien lo arrastró hasta ahí.
     */
    fun setSensitivity(v: Int) = edit { it.copy(sensitivity = v.coerceIn(0, 100)) }

    fun setConfidence(v: String) = edit { it.copy(alarmConfidence = v) }

    fun setTarget(v: String) = edit { it.copy(detectionTarget = v) }

    fun toggleDay(day: Int) = edit { d ->
        val days = if (day in d.window.days) d.window.days - day else (d.window.days + day).sorted()
        d.copy(window = d.window.copy(days = days))
    }

    fun setWindowStart(v: String) = edit { it.copy(window = it.window.copy(start = v)) }

    fun setWindowEnd(v: String) = edit { it.copy(window = it.window.copy(end = v)) }

    fun discardChanges() {
        _state.update { s ->
            val p = s.profile ?: return@update s
            s.copy(draft = draftFromProfile(p), problems = emptyList(), message = null)
        }
    }

    /** Guarda el perfil. **No** toca el equipo. */
    fun save() {
        val draft = _state.value.draft ?: return
        val limits = _state.value.profile?.limits
        val problems = if (limits != null) draftProblems(draft, limits) else draftProblems(draft)
        if (problems.isNotEmpty()) {
            _state.update { it.copy(problems = problems, message = null) }
            return
        }
        _state.update { it.copy(saving = true, error = null, message = null, problems = emptyList()) }
        viewModelScope.launch {
            try {
                val p = withContext(Dispatchers.IO) { repo.saveProfile(cameraId, draft) }
                _state.update {
                    it.copy(
                        saving = false,
                        profile = p,
                        draft = draftFromProfile(p),
                        message = "Perfil guardado. Todavía NO está escrito en la cámara: " +
                            "para eso, «Aplicar al equipo».",
                    )
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(saving = false, error = e.toUserMessage("No se pudo guardar el perfil"))
                }
            }
        }
    }

    /** Pide confirmación antes de escribir en el equipo del cliente. */
    fun askApply() {
        val s = _state.value
        val p = s.profile ?: return
        val nombre = p.cameraName ?: p.cameraId
        val zonas = if (p.regions.isNullOrEmpty()) {
            "el fotograma completo"
        } else {
            "${p.regions?.size ?: 0} zona(s) ya guardada(s)"
        }
        val pendiente = if (s.dirty) {
            " ATENCIÓN: tienes cambios sin guardar y NO se van a aplicar. " +
                "Se escribe lo último guardado. Guarda primero."
        } else {
            ""
        }
        _state.update {
            it.copy(
                pendingApply = DestructiveImpact(
                    title = "Aplicar al equipo",
                    message = "Se va a escribir el perfil guardado en «$nombre» " +
                        "(${p.deviceIp ?: "IP desconocida"}, canal ${p.channel ?: "?"}): " +
                        "sensibilidad ${p.sensitivity}, confianza " +
                        "${confidenceLabel(p.alarmConfidence)}, objetivo " +
                        "${targetLabel(p.detectionTarget).lowercase()}, sobre $zonas. " +
                        "Sustituye la configuración de detección que la cámara tenga ahora." +
                        pendiente,
                    confirmLabel = "Escribir en la cámara",
                ),
            )
        }
    }

    fun dismissApply() = _state.update { it.copy(pendingApply = null) }

    fun confirmApply() {
        _state.update { it.copy(applying = true, pendingApply = null, error = null, message = null) }
        viewModelScope.launch {
            try {
                val outcome = withContext(Dispatchers.IO) { repo.apply(cameraId) }
                val p = withContext(Dispatchers.IO) { repo.profile(cameraId) }
                _state.update {
                    it.copy(
                        applying = false,
                        profile = p,
                        draft = draftFromProfile(p),
                        message = if (outcome.applied) {
                            "Escrito en la cámara. ${outcome.note}"
                        } else {
                            // Un `applied=false` NO es un éxito silencioso: el
                            // equipo puede no admitir FieldDetection en ese canal.
                            "El equipo no aceptó la escritura: ${outcome.note.ifBlank { "sin detalle" }}"
                        },
                    )
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(applying = false, error = e.toUserMessage("No se pudo aplicar el perfil"))
                }
            }
        }
    }

    /** Le pregunta a ESTA cámara qué sabe hacer. Es una lectura del equipo. */
    fun probeCapabilities() {
        _state.update { it.copy(probing = true, error = null, message = null) }
        viewModelScope.launch {
            try {
                val caps = withContext(Dispatchers.IO) { repo.probeCamera(cameraId) }
                val p = withContext(Dispatchers.IO) { repo.profile(cameraId) }
                _state.update {
                    it.copy(
                        probing = false,
                        profile = p,
                        message = when {
                            caps == null -> "El servidor no devolvió capacidades."
                            caps.probeOk -> "Sondeo correcto: ya sabemos qué soporta."
                            else -> "El equipo no contestó: ${caps.probeNote ?: "sin detalle"}. " +
                                "Sus capacidades siguen SIN VERIFICAR, que no es lo mismo que " +
                                "«no soportadas»."
                        },
                    )
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(probing = false, error = e.toUserMessage("No se pudo sondear la cámara"))
                }
            }
        }
    }

    companion object {
        fun factory(app: Application, cameraId: String) = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T =
                IntegraDetectionTuningViewModel(app, cameraId) as T
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun IntegraDetectionTuningScreen(cameraId: String) {
    val app = LocalContext.current.applicationContext as Application
    val vm: IntegraDetectionTuningViewModel = viewModel(
        key = "integra-detection-$cameraId",
        factory = IntegraDetectionTuningViewModel.factory(app, cameraId),
    )
    val s by vm.state.collectAsState()
    val profile = s.profile
    val draft = s.draft

    s.pendingApply?.let { impact ->
        NxDestructiveConfirm(
            impact = impact,
            busy = s.applying,
            danger = true,
            onDismiss = vm::dismissApply,
            onConfirm = vm::confirmApply,
        )
    }

    if (s.loading) {
        NxLoadingBlock("Cargando perfil de detección…")
        return
    }
    if (profile == null || draft == null) {
        NxErrorBlock(s.error ?: "No hay perfil para esta cámara") { vm.refresh() }
        return
    }

    val meaning = sensitivityMeaning(draft.sensitivity)

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            NxSectionHeader(
                title = profile.cameraName ?: profile.cameraId,
                subtitle = listOfNotNull(
                    profile.deviceIp?.let { "IP $it" },
                    profile.channel?.let { "canal $it" },
                    if (profile.hasStoredProfile) "perfil propio" else "plantilla de compatibilidad",
                ).joinToString(" · "),
            )
        }

        s.message?.let { msg -> item { NxNotice(msg, NxTone.Success) } }
        s.error?.let { err -> item { NxNotice(err, NxTone.Danger) } }
        if (s.problems.isNotEmpty()) {
            item { NxNotice(s.problems.joinToString("\n"), NxTone.Warning) }
        }

        // ── Interruptor del perfil ─────────────────────────────────────
        item {
            NxPanel("Perfil") {
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(
                            if (draft.enabled) "Activo" else "Apagado",
                            fontWeight = FontWeight.SemiBold,
                            color = NxColors.Slate,
                        )
                        Text(
                            if (draft.enabled) {
                                "Al aplicar se escribe en la cámara."
                            } else {
                                "Apagado, «Aplicar» no toca el equipo: el servidor responde sin escribir."
                            },
                            style = MaterialTheme.typography.bodySmall,
                            color = NxColors.Muted,
                        )
                    }
                    Switch(checked = draft.enabled, onCheckedChange = vm::setEnabled)
                }
            }
        }

        // ── Sensibilidad ───────────────────────────────────────────────
        item {
            NxPanel("Sensibilidad") {
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        "${draft.sensitivity}",
                        style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold),
                        color = NxColors.Teal,
                    )
                    NxStatusChip(meaning.label, NxTone.Brand)
                }
                Slider(
                    value = draft.sensitivity.toFloat(),
                    onValueChange = { vm.setSensitivity(it.toInt()) },
                    valueRange = profile.limits.sensitivityMin.toFloat()..profile.limits.sensitivityMax.toFloat(),
                    steps = 0,
                )
                Text(meaning.hint, style = MaterialTheme.typography.bodySmall, color = NxColors.Muted)
                if (draft.sensitivity != profile.limits.sensitivityDefault) {
                    Text(
                        "El valor por defecto del servidor es ${profile.limits.sensitivityDefault} " +
                            "— el del ejemplo del fabricante.",
                        style = MaterialTheme.typography.labelSmall,
                        color = NxColors.Muted,
                    )
                }
            }
        }

        // ── Confianza ──────────────────────────────────────────────────
        item {
            NxPanel("Nivel de confianza") {
                NxChipRow(
                    options = profile.limits.alarmConfidences,
                    selected = draft.alarmConfidence,
                    label = ::confidenceLabel,
                    onSelect = vm::setConfidence,
                )
                Text(
                    confidenceHint(draft.alarmConfidence),
                    style = MaterialTheme.typography.bodySmall,
                    color = NxColors.Muted,
                )
                Text(
                    "Aviso del servidor: este enum es EMPÍRICO. El equipo devuelve el tag pero " +
                        "el fabricante no lo documenta, así que la dirección no está confirmada. " +
                        "Súbelo en UNA cámara y mide antes de tocar las demás.",
                    style = MaterialTheme.typography.labelSmall,
                    color = NxColors.Warning,
                )
            }
        }

        // ── Objetivo ───────────────────────────────────────────────────
        item {
            NxPanel("Qué debe detectar") {
                NxChipRow(
                    options = profile.limits.detectionTargets,
                    selected = draft.detectionTarget,
                    label = ::targetLabel,
                    onSelect = vm::setTarget,
                )
            }
        }

        // ── Horario ────────────────────────────────────────────────────
        item {
            NxPanel("Cuándo cuenta") {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    NxTimeField(
                        value = draft.window.start,
                        label = "Desde",
                        onChange = vm::setWindowStart,
                        modifier = Modifier.weight(1f),
                    )
                    NxTimeField(
                        value = draft.window.end,
                        label = "Hasta",
                        onChange = vm::setWindowEnd,
                        modifier = Modifier.weight(1f),
                    )
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    DAY_LABELS.forEachIndexed { index, label ->
                        FilterChip(
                            selected = index in draft.window.days,
                            onClick = { vm.toggleDay(index) },
                            label = { Text(label) },
                        )
                    }
                }
                Text(
                    windowSummary(draft.window),
                    style = MaterialTheme.typography.bodySmall,
                    color = if (draft.window.days.isEmpty()) NxColors.Danger else NxColors.Muted,
                )
            }
        }

        // ── Zonas: solo lectura ────────────────────────────────────────
        item {
            NxPanel("Zonas de detección") {
                DetectionRegionPreview(regions = profile.regions)
            }
        }

        // ── Qué soporta este equipo ────────────────────────────────────
        item {
            NxPanel("Qué soporta este equipo") {
                CapabilityFlags(row = profile.capabilities?.let { SiteCapabilityRow(profile.cameraId, it) })
                OutlinedButton(
                    onClick = vm::probeCapabilities,
                    enabled = !s.probing,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(if (s.probing) "Preguntando al equipo…" else "Preguntar al equipo")
                }
            }
        }

        // ── Eventos que se empujan ─────────────────────────────────────
        if (profile.eventTypes.isNotEmpty()) {
            item {
                NxPanel("Avisos que se empujan a NEXARA") {
                    Text(
                        profile.eventTypes.joinToString(", "),
                        style = MaterialTheme.typography.bodySmall,
                        color = NxColors.Slate,
                    )
                    Text(
                        "Lista blanca de `/ISAPI/Event/triggers` para esta cámara. Se amplía " +
                            "desde la consola web y solo con valores del catálogo documentado.",
                        style = MaterialTheme.typography.labelSmall,
                        color = NxColors.Muted,
                    )
                }
            }
        }

        // ── Guardar / Aplicar ──────────────────────────────────────────
        item {
            NxPanel("Guardar no es aplicar") {
                Text(
                    "Guardar cambia la ficha en NEXARA. Aplicar escribe en la cámara. " +
                        "Son dos pasos distintos a propósito.",
                    style = MaterialTheme.typography.bodySmall,
                    color = NxColors.Muted,
                )
                profile.lastAppliedAt?.let { at ->
                    Text(
                        "Última escritura en el equipo: $at" +
                            (profile.lastAppliedNote?.let { " · $it" } ?: ""),
                        style = MaterialTheme.typography.labelSmall,
                        color = NxColors.Muted,
                    )
                } ?: Text(
                    "Este perfil nunca se ha escrito en el equipo.",
                    style = MaterialTheme.typography.labelSmall,
                    color = NxColors.Warning,
                )
                Button(
                    onClick = vm::save,
                    enabled = !s.saving && !s.applying && s.dirty,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = NxColors.Teal),
                ) {
                    Text(
                        when {
                            s.saving -> "Guardando…"
                            s.dirty -> "Guardar cambios"
                            else -> "Sin cambios que guardar"
                        },
                    )
                }
                if (s.dirty) {
                    OutlinedButton(
                        onClick = vm::discardChanges,
                        enabled = !s.saving && !s.applying,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text("Descartar cambios")
                    }
                }
                OutlinedButton(
                    onClick = vm::askApply,
                    enabled = !s.saving && !s.applying,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(if (s.applying) "Escribiendo en la cámara…" else "Aplicar al equipo")
                }
            }
        }

        item { Spacer(Modifier.height(28.dp)) }
    }
}

/* ── Capacidades del parque ─────────────────────────────────────────────── */

data class DetectionCapabilitiesUiState(
    val loading: Boolean = true,
    val isRefreshing: Boolean = false,
    val error: String? = null,
    val message: String? = null,
    val probing: Boolean = false,
    val rows: List<SiteCapabilityRow> = emptyList(),
    val pendingProbe: DestructiveImpact? = null,
)

class IntegraDetectionCapabilitiesViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = IntegraDetectionRepository(app.applicationContext)
    private val _state = MutableStateFlow(DetectionCapabilitiesUiState())
    val state: StateFlow<DetectionCapabilitiesUiState> = _state

    init { refresh() }

    fun refresh(initial: Boolean = true) {
        _state.update {
            it.copy(loading = initial && it.rows.isEmpty(), isRefreshing = !initial, error = null)
        }
        viewModelScope.launch {
            try {
                val rows = withContext(Dispatchers.IO) { repo.siteCapabilities() }
                _state.update { it.copy(loading = false, isRefreshing = false, rows = rows) }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        loading = false,
                        isRefreshing = false,
                        error = e.toUserMessage("No se pudieron leer las capacidades"),
                    )
                }
            }
        }
    }

    /**
     * El sondeo del sitio entero abre una sesión ISAPI contra cada cámara, en
     * serie y por Tailscale. No es destructivo, pero tampoco es gratis: se
     * avisa antes en vez de dejar un botón suelto que castigue al parque.
     */
    fun askProbeAll() {
        _state.update {
            it.copy(
                pendingProbe = DestructiveImpact(
                    title = "Sondear todo el sitio",
                    message = "Se le va a preguntar a CADA cámara del sitio qué detecciones " +
                        "admite, una a una y por el enlace del cliente. No cambia " +
                        "configuración, pero tarda y carga los equipos. En un sitio de " +
                        "dieciséis cámaras no es instantáneo.",
                    confirmLabel = "Sondear ahora",
                ),
            )
        }
    }

    fun dismissProbe() = _state.update { it.copy(pendingProbe = null) }

    fun confirmProbeAll() {
        _state.update { it.copy(probing = true, pendingProbe = null, error = null, message = null) }
        viewModelScope.launch {
            try {
                val outcome = withContext(Dispatchers.IO) { repo.probeSite() }
                val rows = withContext(Dispatchers.IO) { repo.siteCapabilities() }
                val mudas = outcome.total - outcome.ok
                _state.update {
                    it.copy(
                        probing = false,
                        rows = rows,
                        message = "Contestaron ${outcome.ok} de ${outcome.total}." +
                            if (mudas > 0) {
                                " Las $mudas restantes quedan SIN VERIFICAR — que no es «no soportado»."
                            } else {
                                ""
                            },
                    )
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(probing = false, error = e.toUserMessage("No se pudo sondear el sitio"))
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun IntegraDetectionCapabilitiesScreen(
    vm: IntegraDetectionCapabilitiesViewModel = viewModel(),
) {
    val s by vm.state.collectAsState()

    s.pendingProbe?.let { impact ->
        NxDestructiveConfirm(
            impact = impact,
            busy = s.probing,
            danger = false,
            onDismiss = vm::dismissProbe,
            onConfirm = vm::confirmProbeAll,
        )
    }

    PullToRefreshBox(
        isRefreshing = s.isRefreshing,
        onRefresh = { vm.refresh(initial = false) },
        modifier = Modifier.fillMaxSize(),
    ) {
        when {
            s.loading -> NxLoadingBlock("Leyendo capacidades…")
            s.error != null && s.rows.isEmpty() -> NxErrorBlock(s.error.orEmpty()) { vm.refresh() }
            else -> LazyColumn(
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                item {
                    NxSectionHeader(
                        title = "Qué soporta el parque",
                        subtitle = "Tres estados, no dos: soportado, no soportado y NO VERIFICADO. " +
                            "«No verificado» significa que nadie se lo ha preguntado al equipo.",
                    )
                }
                s.message?.let { msg -> item { NxNotice(msg, NxTone.Success) } }
                s.error?.let { err -> item { NxNotice(err, NxTone.Danger) } }
                item {
                    Button(
                        onClick = vm::askProbeAll,
                        enabled = !s.probing,
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = NxColors.Teal),
                    ) {
                        Text(if (s.probing) "Sondeando el sitio…" else "Sondear todo el sitio")
                    }
                }
                if (s.rows.isEmpty()) {
                    item {
                        NxEmptyState(
                            "Ninguna cámara sondeada",
                            "Nadie le ha preguntado nada a este parque todavía. Eso no quiere " +
                                "decir que no soporte nada: quiere decir que no lo sabemos.",
                        )
                    }
                }
                items(s.rows, key = { it.cameraId }) { row ->
                    NxPanel(row.cameraId) { CapabilityFlags(row) }
                }
                item { Spacer(Modifier.height(24.dp)) }
            }
        }
    }
}

/**
 * Los flags con sus tres estados intactos.
 *
 * «No verificado» se pinta distinto de «no soportado» a propósito: fue un error
 * explícito de este proyecto tratarlos igual, y una cámara que nadie preguntó
 * no es una cámara incapaz.
 */
@Composable
private fun CapabilityFlags(row: SiteCapabilityRow?) {
    if (row == null) {
        Text(
            "Sin sondear: no sabemos qué admite esta cámara. NO es lo mismo que «no admite nada».",
            style = MaterialTheme.typography.bodySmall,
            color = NxColors.Warning,
        )
        return
    }
    val caps = row.capabilities
    Text(
        buildString {
            append(if (caps.probeOk) "El equipo contestó" else "El equipo NO contestó")
            caps.probedAt?.let { append(" · $it") }
        },
        style = MaterialTheme.typography.labelSmall,
        color = if (caps.probeOk) NxColors.Muted else NxColors.Warning,
    )
    caps.probeNote?.let { note ->
        Text(note, style = MaterialTheme.typography.labelSmall, color = NxColors.Warning)
    }
    caps.flags.forEach { (key, state) ->
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                capabilityLabel(key),
                style = MaterialTheme.typography.bodySmall,
                color = NxColors.Slate,
                modifier = Modifier.weight(1f),
            )
            NxStatusChip(
                capabilityStateLabel(state),
                when (state) {
                    CapabilityState.SUPPORTED -> NxTone.Success
                    CapabilityState.UNSUPPORTED -> NxTone.Neutral
                    CapabilityState.UNVERIFIED -> NxTone.Warning
                },
            )
        }
    }
}

/* ── Piezas compartidas por las pantallas de este paquete ───────────────── */

@Composable
internal fun NxPanel(title: String, content: @Composable () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = NxColors.Card),
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(
                title,
                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
                color = NxColors.Slate,
            )
            content()
        }
    }
}

@Composable
internal fun NxNotice(text: String, tone: NxTone) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = when (tone) {
                NxTone.Success -> NxColors.SuccessSoft
                NxTone.Danger -> NxColors.DangerSoft
                NxTone.Warning -> NxColors.WarningSoft
                else -> NxColors.InfoSoft
            },
        ),
    ) {
        Text(
            text,
            modifier = Modifier.padding(12.dp),
            style = MaterialTheme.typography.bodySmall,
            color = NxColors.Slate,
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun NxChipRow(
    options: List<String>,
    selected: String,
    label: (String) -> String,
    onSelect: (String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        options.chunked(2).forEach { row ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                row.forEach { option ->
                    FilterChip(
                        selected = option == selected,
                        onClick = { onSelect(option) },
                        label = { Text(label(option)) },
                        modifier = Modifier.weight(1f),
                    )
                }
                if (row.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

/**
 * Hora `HH:MM`. Se teclea con teclado numérico y se valida al vuelo; no se
 * abre el selector del sistema porque la ventana admite cruzar la medianoche
 * y el selector nativo no sabe expresar eso.
 */
@Composable
private fun NxTimeField(
    value: String,
    label: String,
    onChange: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var text by remember(value) { mutableStateOf(value) }
    androidx.compose.material3.OutlinedTextField(
        value = text,
        onValueChange = { raw ->
            val filtered = raw.filter { it.isDigit() || it == ':' }.take(5)
            text = filtered
            onChange(filtered)
        },
        modifier = modifier,
        singleLine = true,
        label = { Text(label) },
        placeholder = { Text("HH:MM") },
        isError = !Regex("""^([01]\d|2[0-3]):([0-5]\d)$""").matches(text),
    )
}
