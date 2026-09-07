package mx.nexara.mobile.nativeapp.ui.integra.schedules

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import mx.nexara.mobile.nativeapp.data.integra.schedules.AcsTime
import mx.nexara.mobile.nativeapp.data.integra.schedules.DoorPlanAssignment
import mx.nexara.mobile.nativeapp.data.integra.schedules.PersonBrief
import mx.nexara.mobile.nativeapp.data.integra.schedules.ScheduleDoor
import mx.nexara.mobile.nativeapp.data.integra.schedules.SchedulePresets
import mx.nexara.mobile.nativeapp.data.integra.schedules.SchedulesCatalog
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxDimens
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSearchField
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone

/**
 * HORARIOS de acceso — paridad con `apps/web/app/(panels)/integra/schedules`.
 *
 * Dos vistas, «Por persona» y «Por puerta». La web tiene una tercera, «Matriz
 * puerta», que muestra exactamente las mismas columnas que «Por puerta» para la
 * misma puerta seleccionada; en una pantalla de teléfono una tabla con scroll
 * horizontal no aporta nada sobre la lista, así que su único contenido propio
 * —el salto rápido entre puertas— vive aquí en el selector de puerta.
 *
 * Todas las horas de esta pantalla son **reloj de pared del terminal ACS**: no
 * se convierten de zona en ningún punto. Ver `AcsTime`.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun IntegraSchedulesScreen(
    initialDoorId: String? = null,
    vm: IntegraSchedulesViewModel = viewModel(),
) {
    val s by vm.state.collectAsState()

    LaunchedEffect(initialDoorId, s.catalog != null) {
        val door = SchedulesRoutes.decodeRouteArg(initialDoorId) ?: return@LaunchedEffect
        if (s.catalog != null && s.selectedDoorId != door) {
            vm.setTab(SchedulesTab.DOOR)
            vm.selectDoor(door)
        }
    }

    PullToRefreshBox(
        isRefreshing = s.refreshing,
        onRefresh = { vm.load(initial = false) },
        modifier = Modifier.fillMaxSize().background(NxColors.Surface),
    ) {
        when {
            s.loading -> NxLoadingBlock("Cargando horarios ACS…")
            s.error != null && s.catalog == null ->
                Box(Modifier.fillMaxSize().padding(16.dp)) {
                    NxErrorBlock(s.error.orEmpty()) { vm.load(initial = true) }
                }
            else -> {
                val catalog = s.catalog
                Column(Modifier.fillMaxSize()) {
                    TabRow(selectedTabIndex = s.tab.ordinal) {
                        SchedulesTab.entries.forEach { tab ->
                            Tab(
                                selected = s.tab == tab,
                                onClick = { vm.setTab(tab) },
                                text = { Text(tab.label) },
                            )
                        }
                    }
                    if (catalog == null) {
                        NxEmptyState(
                            "Sin catálogo de horarios",
                            "El sitio no devolvió puertas ni plantillas ACS.",
                            actionLabel = "Reintentar",
                            onAction = { vm.load(initial = true) },
                        )
                    } else {
                        when (s.tab) {
                            SchedulesTab.PERSON -> PersonTab(s, catalog, vm)
                            SchedulesTab.DOOR -> DoorTab(s, catalog, vm)
                        }
                    }
                }
            }
        }
    }
}

// ── Vista «Por persona» ──────────────────────────────────────────────────────

@Composable
private fun PersonTab(
    s: SchedulesUiState,
    catalog: SchedulesCatalog,
    vm: IntegraSchedulesViewModel,
) {
    val draft = s.draft
    if (s.selectedPersonId == null || draft == null) {
        PersonPicker(s, vm, loading = s.personLoading)
        return
    }

    val previewTemplate = catalog.templateOf(
        draft.doorPlans.firstOrNull { it.doorId == s.previewDoorId }?.planTemplateNo,
    )

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        draft.name,
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                        color = NxColors.Slate,
                    )
                    Text(
                        "${draft.doorsWithAccess} de ${draft.doorPlans.size} puertas con acceso",
                        style = MaterialTheme.typography.bodySmall,
                        color = NxColors.Muted,
                    )
                }
                NxStatusChip(
                    draft.validityLabel,
                    when {
                        !draft.validEnable -> NxTone.Danger
                        draft.indefinite -> NxTone.Success
                        else -> NxTone.Warning
                    },
                )
            }
        }
        item {
            TextButton(onClick = vm::clearPerson) { Text("Cambiar de persona") }
        }
        draft.note?.let { note ->
            item { InfoCard(note, NxTone.Warning) }
        }
        if (!s.caps.canSettings) {
            item {
                InfoCard(
                    "Tu usuario puede consultar horarios pero no guardarlos.",
                    NxTone.Info,
                )
            }
        }

        // ── Presets ──────────────────────────────────────────────────────────
        item { NxSectionHeader("Presets", "Un toque, revisa y guarda") }
        item {
            val scroll = rememberScrollState()
            Row(
                Modifier.fillMaxWidth().horizontalScroll(scroll),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                SchedulePresets.all.forEach { preset ->
                    val active = s.activePresetId == preset.id
                    Card(
                        onClick = { vm.applyPreset(preset.id) },
                        modifier = Modifier.width(190.dp),
                        shape = RoundedCornerShape(NxDimens.PanelRadius),
                        colors = CardDefaults.cardColors(
                            containerColor = if (active) NxColors.TealSoft else NxColors.Card,
                        ),
                    ) {
                        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                            Text(
                                preset.title,
                                style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
                                color = NxColors.Slate,
                            )
                            Text(
                                preset.blurb,
                                style = MaterialTheme.typography.labelSmall,
                                color = NxColors.Muted,
                            )
                        }
                    }
                }
            }
        }

        // ── Vigencia ─────────────────────────────────────────────────────────
        item { NxSectionHeader("Vigencia", "UserInfo.Valid del terminal") }
        item {
            Card(
                Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(NxDimens.PanelRadius),
                colors = CardDefaults.cardColors(containerColor = NxColors.Card),
            ) {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(
                        "«Indefinido» guarda fin 2037-12-31 en el terminal, la convención " +
                            "Hikvision para acceso sin caducidad. El horario semanal se " +
                            "elige por puerta, más abajo.",
                        style = MaterialTheme.typography.labelSmall,
                        color = NxColors.Muted,
                    )
                    SwitchRow(
                        label = "Acceso habilitado",
                        checked = draft.validEnable,
                        enabled = s.caps.canSettings,
                        onChange = vm::setValidEnabled,
                    )
                    SwitchRow(
                        label = "Sin fecha fin (indefinido)",
                        checked = draft.indefinite,
                        enabled = s.caps.canSettings && draft.validEnable,
                        onChange = vm::setIndefinite,
                    )
                    Text(
                        "Fechas en hora del terminal (sin conversión de zona).",
                        style = MaterialTheme.typography.labelSmall,
                        color = NxColors.Muted,
                    )
                    DateTimeFields(
                        label = "Desde",
                        date = s.validFromDate,
                        time = s.validFromTime,
                        enabled = s.caps.canSettings && draft.validEnable,
                        onDate = vm::setValidFromDate,
                        onTime = vm::setValidFromTime,
                    )
                    DateTimeFields(
                        label = "Hasta",
                        date = s.validToDate,
                        time = s.validToTime,
                        enabled = s.caps.canSettings && draft.validEnable && !draft.indefinite,
                        onDate = vm::setValidToDate,
                        onTime = vm::setValidToTime,
                    )
                }
            }
        }

        // ── Puertas ──────────────────────────────────────────────────────────
        item {
            NxSectionHeader(
                "Puertas y horario",
                "Plantilla por puerta (RightPlan.planTemplateNo)",
            )
        }
        if (catalog.doors.isEmpty()) {
            item {
                NxEmptyState(
                    "Sin puertas",
                    "Sincroniza el sitio para cargar el inventario ACS.",
                    actionLabel = "Reintentar",
                    onAction = { vm.load(initial = true) },
                )
            }
        } else {
            items(draft.doorPlans, key = { it.doorId }) { plan ->
                DoorPlanCard(
                    plan = plan,
                    catalog = catalog,
                    selected = s.previewDoorId == plan.doorId,
                    enabled = s.caps.canSettings,
                    onSelect = { vm.previewDoor(plan.doorId) },
                    onPlanChange = { vm.setDoorPlan(plan.doorId, it) },
                )
            }
        }

        // ── Vista semanal ────────────────────────────────────────────────────
        item {
            NxSectionHeader(
                "Vista semanal",
                catalog.doors.firstOrNull { it.id == s.previewDoorId }?.name
                    ?: "Elige una puerta",
            )
        }
        item {
            Card(
                Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(NxDimens.PanelRadius),
                colors = CardDefaults.cardColors(containerColor = NxColors.Card),
            ) {
                Box(Modifier.padding(14.dp)) {
                    ScheduleWeekGrid(previewTemplate)
                }
            }
        }

        // ── Guardar ──────────────────────────────────────────────────────────
        s.formError?.let { item { InfoCard(it, NxTone.Danger) } }
        item {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Button(
                    onClick = vm::save,
                    enabled = s.caps.canSettings && !s.saving && s.dirty,
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(containerColor = NxColors.Teal),
                ) {
                    Text(if (s.saving) "Guardando en terminales…" else "Guardar horario")
                }
                OutlinedButton(
                    onClick = vm::discardChanges,
                    enabled = !s.saving && s.dirty,
                ) {
                    Text("Descartar")
                }
            }
        }
        if (!s.dirty && s.saveOk == null) {
            item {
                Text(
                    "Sin cambios pendientes.",
                    style = MaterialTheme.typography.labelSmall,
                    color = NxColors.Muted,
                )
            }
        }
        s.saveNote?.let { note ->
            item { InfoCard(note, if (s.saveOk == true) NxTone.Success else NxTone.Danger) }
        }
        if (s.saveResults.isNotEmpty()) {
            item {
                NxSectionHeader(
                    "Terminales",
                    "${s.saveResults.count { it.ok }} de ${s.saveResults.size} aceptaron el cambio",
                )
            }
            items(s.saveResults, key = { it.deviceIp }) { result ->
                Row(
                    Modifier
                        .fillMaxWidth()
                        .background(NxColors.Card, RoundedCornerShape(NxDimens.PanelRadius))
                        .padding(12.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        result.deviceIp,
                        style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.SemiBold),
                        color = NxColors.Slate,
                        modifier = Modifier.weight(1f),
                    )
                    NxStatusChip(
                        if (result.ok) "OK" else result.error ?: "Falló",
                        if (result.ok) NxTone.Success else NxTone.Danger,
                    )
                }
            }
        }
        item { Spacer(Modifier.height(24.dp)) }
    }
}

@Composable
private fun PersonPicker(
    s: SchedulesUiState,
    vm: IntegraSchedulesViewModel,
    loading: Boolean,
) {
    val people = s.filteredPeople
    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        NxSectionHeader("Elige una persona", "${s.people.size} en el directorio ACS")
        NxSearchField(
            value = s.personQuery,
            onValueChange = vm::setPersonQuery,
            placeholder = "Nombre o código…",
        )
        when {
            loading -> NxLoadingBlock("Leyendo horario…")
            s.people.isEmpty() -> NxEmptyState(
                "Sin personas en el sitio",
                "Da de alta en Personas o sincroniza el directorio ACS.",
                actionLabel = "Reintentar",
                onAction = { vm.load(initial = true) },
            )
            people.isEmpty() -> NxEmptyState(
                "Sin coincidencias",
                "Ninguna persona coincide con «${s.personQuery}».",
            )
            else -> LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(people, key = PersonBrief::id) { person ->
                    Card(
                        onClick = { vm.selectPerson(person.id) },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(NxDimens.PanelRadius),
                        colors = CardDefaults.cardColors(containerColor = NxColors.Card),
                    ) {
                        Column(Modifier.padding(14.dp)) {
                            Text(
                                person.name,
                                style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
                                color = NxColors.Slate,
                            )
                            Text(
                                person.code ?: person.id,
                                style = MaterialTheme.typography.labelSmall,
                                color = NxColors.Muted,
                            )
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DoorPlanCard(
    plan: DoorPlanAssignment,
    catalog: SchedulesCatalog,
    selected: Boolean,
    enabled: Boolean,
    onSelect: () -> Unit,
    onPlanChange: (String) -> Unit,
) {
    var menuOpen by remember { mutableStateOf(false) }
    val meta = listOfNotNull(
        plan.deviceIp.takeIf { it.isNotBlank() },
        if (plan.present == false) "no enrolado" else null,
        plan.error,
    ).joinToString(" · ")

    Card(
        onClick = onSelect,
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(NxDimens.PanelRadius),
        colors = CardDefaults.cardColors(
            containerColor = if (selected) NxColors.TealSoft else NxColors.Card,
        ),
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        plan.doorName ?: plan.doorId,
                        style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
                        color = NxColors.Slate,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    if (meta.isNotBlank()) {
                        Text(
                            meta,
                            style = MaterialTheme.typography.labelSmall,
                            color = NxColors.Muted,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
                NxStatusChip(
                    if (plan.hasAccess) "Abre" else "Sin acceso",
                    if (plan.hasAccess) NxTone.Success else NxTone.Neutral,
                )
            }
            Box {
                OutlinedButton(
                    onClick = { if (enabled) menuOpen = true },
                    enabled = enabled,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(catalog.templateLabel(plan.planTemplateNo))
                }
                DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                    catalog.templates.forEach { template ->
                        DropdownMenuItem(
                            text = { Text(template.name) },
                            onClick = {
                                menuOpen = false
                                onPlanChange(template.id)
                            },
                        )
                    }
                }
            }
            ScheduleWeekSummary(catalog.templateOf(plan.planTemplateNo))
        }
    }
}

// ── Vista «Por puerta» ───────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DoorTab(
    s: SchedulesUiState,
    catalog: SchedulesCatalog,
    vm: IntegraSchedulesViewModel,
) {
    var menuOpen by remember { mutableStateOf(false) }
    val selected = catalog.doors.firstOrNull { it.id == s.selectedDoorId }
    val access = s.doorAccess

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            Box {
                OutlinedButton(
                    onClick = { menuOpen = true },
                    enabled = catalog.doors.isNotEmpty(),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(selected?.name ?: "Elige una puerta")
                }
                DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                    catalog.doors.forEach { door: ScheduleDoor ->
                        DropdownMenuItem(
                            text = {
                                Column {
                                    Text(door.name)
                                    Text(
                                        listOfNotNull(
                                            door.location,
                                            door.id,
                                            if (!door.online) "fuera de línea" else null,
                                        ).joinToString(" · "),
                                        style = MaterialTheme.typography.labelSmall,
                                        color = NxColors.Muted,
                                    )
                                }
                            },
                            onClick = {
                                menuOpen = false
                                vm.selectDoor(door.id)
                            },
                        )
                    }
                }
            }
        }
        catalog.note?.let { item { InfoCard(it, NxTone.Warning) } }
        access?.note?.let { item { InfoCard(it, NxTone.Info) } }

        when {
            catalog.doors.isEmpty() -> item {
                NxEmptyState(
                    "Sin puertas",
                    "Sincroniza el sitio para cargar el inventario ACS.",
                    actionLabel = "Reintentar",
                    onAction = { vm.load(initial = true) },
                )
            }
            s.doorLoading && access == null -> item { NxLoadingBlock("Leyendo quién abre…") }
            access == null || access.people.isEmpty() -> item {
                NxEmptyState(
                    "Nadie asignado a esta puerta",
                    "Nadie tiene horario activo aquí, o el espejo aún no trae RightPlan. " +
                        "Se asigna desde «Por persona».",
                    actionLabel = "Ir a Por persona",
                    onAction = { vm.setTab(SchedulesTab.PERSON) },
                )
            }
            else -> {
                item {
                    NxSectionHeader(
                        access.door.name,
                        "${access.people.size} con acceso · ${access.people.count { it.indefinite }} indefinidos",
                    )
                }
                items(access.people, key = { it.personId }) { row ->
                    Card(
                        onClick = { vm.editPersonFromDoor(row.personId) },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(NxDimens.PanelRadius),
                        colors = CardDefaults.cardColors(containerColor = NxColors.Card),
                    ) {
                        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Row(
                                Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(Modifier.weight(1f)) {
                                    Text(
                                        row.name,
                                        style = MaterialTheme.typography.bodyMedium
                                            .copy(fontWeight = FontWeight.SemiBold),
                                        color = NxColors.Slate,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                    Text(
                                        "${row.code ?: row.personId} · ${row.validityLabel}",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = NxColors.Muted,
                                    )
                                }
                                NxStatusChip(
                                    planLabelOrNoAccess(catalog, row.planTemplateNo),
                                    if (row.hasAccess) NxTone.Info else NxTone.Neutral,
                                )
                            }
                            ScheduleWeekSummary(catalog.templateOf(row.planTemplateNo))
                            Text(
                                "Toca para editar su horario",
                                style = MaterialTheme.typography.labelSmall,
                                color = NxColors.Teal,
                            )
                        }
                    }
                }
            }
        }
        item { Spacer(Modifier.height(24.dp)) }
    }
}

// ── Piezas compartidas ───────────────────────────────────────────────────────

@Composable
internal fun SwitchRow(
    label: String,
    checked: Boolean,
    enabled: Boolean,
    onChange: (Boolean) -> Unit,
) {
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            label,
            style = MaterialTheme.typography.bodyMedium,
            color = if (enabled) NxColors.Slate else NxColors.Muted,
            modifier = Modifier.weight(1f),
        )
        Switch(checked = checked, onCheckedChange = onChange, enabled = enabled)
    }
}

/**
 * Fecha y hora como texto.
 *
 * Deliberadamente no se usa `DatePickerDialog`: devuelve medianoche **UTC** del
 * día elegido y reconstruirla contra la zona del teléfono es justo la operación
 * que corre las horas. Aquí lo tecleado es el valor.
 */
@Composable
internal fun DateTimeFields(
    label: String,
    date: String,
    time: String,
    enabled: Boolean,
    onDate: (String) -> Unit,
    onTime: (String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(
            label,
            style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold),
            color = NxColors.Slate,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(
                value = date,
                onValueChange = onDate,
                enabled = enabled,
                singleLine = true,
                label = { Text("AAAA-MM-DD") },
                modifier = Modifier.weight(1.4f),
            )
            OutlinedTextField(
                value = time,
                onValueChange = onTime,
                enabled = enabled,
                singleLine = true,
                label = { Text("HH:MM") },
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
internal fun InfoCard(message: String, tone: NxTone) {
    val bg = when (tone) {
        NxTone.Success -> NxColors.SuccessSoft
        NxTone.Warning -> NxColors.WarningSoft
        NxTone.Danger -> NxColors.DangerSoft
        NxTone.Info -> NxColors.InfoSoft
        NxTone.Brand -> NxColors.TealSoft
        NxTone.Neutral -> NxColors.Surface
    }
    Card(
        Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(NxDimens.PanelRadius),
        colors = CardDefaults.cardColors(containerColor = bg),
    ) {
        Text(
            message,
            modifier = Modifier.padding(12.dp),
            style = MaterialTheme.typography.bodySmall,
            color = NxColors.Slate,
        )
    }
}

/** Etiqueta de un instante del servidor, siempre en hora de México. */
internal fun serverInstantLabel(iso: String?): String = AcsTime.dayTimeMexico(iso)
