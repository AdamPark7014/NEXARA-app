package mx.nexara.mobile.nativeapp.ui.integra.schedules

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import mx.nexara.mobile.nativeapp.data.integra.schedules.SpaceCard
import mx.nexara.mobile.nativeapp.data.integra.schedules.SpaceWindow
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSearchField
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone

/**
 * Espacios / puertas con política, personas con acceso y ventanas de uso.
 *
 * El ViewModel ya existía; esta pantalla faltaba por el corte de sesión.
 * [onOpenSchedules] es opcional: el NavHost (propiedad de Adam) puede
 * saltar a horarios de esa puerta cuando cablee la ruta.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun IntegraEspaciosScreen(
    onOpenSchedules: ((doorId: String) -> Unit)? = null,
    vm: IntegraEspaciosViewModel = viewModel(),
) {
    val s by vm.state.collectAsState()
    val selected = s.selectedId

    if (selected != null) {
        EspacioDetail(s = s, vm = vm, onOpenSchedules = onOpenSchedules)
        return
    }

    PullToRefreshBox(
        isRefreshing = s.refreshing,
        onRefresh = { vm.load(initial = false) },
        modifier = Modifier.fillMaxSize().background(NxColors.Surface),
    ) {
        when {
            s.loading -> NxLoadingBlock("Cargando espacios…")
            s.error != null && s.overview == null ->
                NxErrorBlock(s.error.orEmpty()) { vm.load(initial = true) }
            else -> LazyColumn(
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                item {
                    Text(
                        "Espacios y puertas",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        "Política de acceso y ventanas de uso. No es un mapa de planta.",
                        style = MaterialTheme.typography.bodySmall,
                        color = NxColors.Muted,
                    )
                }
                item {
                    NxSearchField(
                        value = s.query,
                        onValueChange = vm::setQuery,
                        placeholder = "Buscar espacio…",
                    )
                }
                item {
                    Row(
                        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        SpaceFilter.entries.forEach { f ->
                            FilterChip(
                                selected = s.filter == f,
                                onClick = { vm.setFilter(f) },
                                label = { Text(f.label) },
                            )
                        }
                    }
                }
                s.message?.let { msg ->
                    item { Text(msg, color = NxColors.Success) }
                }
                s.error?.let { err ->
                    item { Text(err, color = NxColors.Danger) }
                }
                val spaces = s.spaces
                if (spaces.isEmpty()) {
                    item {
                        NxEmptyState(
                            "Sin espacios",
                            "No hay puertas/espacios con el filtro actual.",
                        )
                    }
                } else {
                    items(spaces, key = { it.id }) { space ->
                        SpaceCardRow(space = space, onClick = { vm.selectSpace(space.id) })
                    }
                }
            }
        }
    }
}

@Composable
private fun SpaceCardRow(space: SpaceCard, onClick: () -> Unit) {
    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = NxColors.Card),
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(space.name, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                NxStatusChip(
                    if (space.online) "En línea" else "Offline",
                    if (space.online) NxTone.Success else NxTone.Neutral,
                )
            }
            space.regionName?.takeIf { it.isNotBlank() }?.let {
                Text(it, style = MaterialTheme.typography.bodySmall, color = NxColors.Muted)
            }
            Text(
                "${space.policy.label} · ${space.accessCounts.total} personas · ${space.windowsOpen} ventana(s)",
                style = MaterialTheme.typography.labelSmall,
                color = NxColors.Muted,
            )
        }
    }
}

@Composable
private fun EspacioDetail(
    s: EspaciosUiState,
    vm: IntegraEspaciosViewModel,
    onOpenSchedules: ((doorId: String) -> Unit)?,
) {
    val doorId = s.selectedId.orEmpty()
    val detail = s.detail
    LazyColumn(
        Modifier.fillMaxSize().background(NxColors.Surface).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            OutlinedButton(onClick = vm::clearSpace) { Text("← Espacios") }
        }
        if (s.detailLoading && detail == null) {
            item { NxLoadingBlock("Cargando ficha…") }
            return@LazyColumn
        }
        if (detail == null) {
            item { NxErrorBlock(s.error ?: "Sin detalle") { vm.selectSpace(doorId) } }
            return@LazyColumn
        }
        val card = detail.card
        item {
            Text(card.name, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text(
                "Política actual: ${card.policy.label}",
                style = MaterialTheme.typography.bodyMedium,
                color = NxColors.Muted,
            )
        }
        s.message?.let { item { Text(it, color = NxColors.Success) } }
        s.error?.let { item { Text(it, color = NxColors.Danger) } }

        if (onOpenSchedules != null) {
            item {
                OutlinedButton(
                    onClick = { onOpenSchedules(doorId) },
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Ver horarios ACS de esta puerta") }
            }
        }

        item {
            Text("Plantilla de acceso", fontWeight = FontWeight.SemiBold)
            Text(
                "Cambia la política del espacio. Requiere permiso de control de puertas.",
                style = MaterialTheme.typography.bodySmall,
                color = NxColors.Muted,
            )
        }
        item {
            Row(
                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                val templates = s.overview?.templates.orEmpty()
                if (templates.isEmpty()) {
                    Text(
                        "Sin catálogo de plantillas en el overview.",
                        style = MaterialTheme.typography.bodySmall,
                        color = NxColors.Muted,
                    )
                } else {
                    templates.forEach { tpl ->
                        FilterChip(
                            selected = (s.policyKey ?: card.policy.templateKey) == tpl.key,
                            onClick = { vm.setPolicyKey(tpl.key) },
                            enabled = s.caps.canControlDoors && !s.savingPolicy,
                            label = { Text(tpl.label) },
                        )
                    }
                }
            }
        }
        if (s.caps.canControlDoors) {
            item {
                Button(
                    onClick = vm::savePolicy,
                    enabled = !s.savingPolicy,
                    modifier = Modifier.fillMaxWidth(),
                ) { Text(if (s.savingPolicy) "Guardando…" else "Guardar política") }
            }
        } else {
            item {
                Text(
                    "Tu usuario no puede cambiar la política de espacios.",
                    style = MaterialTheme.typography.bodySmall,
                    color = NxColors.Muted,
                )
            }
        }

        item { Text("Personas con acceso (${detail.people.size})", fontWeight = FontWeight.SemiBold) }
        if (detail.people.isEmpty()) {
            item { Text("Nadie con acceso vigente en este espacio.", color = NxColors.Muted) }
        } else {
            items(detail.people.take(40), key = { it.personId }) { p ->
                Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = NxColors.Card)) {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(p.personName, fontWeight = FontWeight.SemiBold)
                        Text("${p.kindLabel} · ${p.validityRange}", style = MaterialTheme.typography.bodySmall, color = NxColors.Muted)
                    }
                }
            }
        }

        item { Text("Ventanas de uso", fontWeight = FontWeight.SemiBold) }
        items(detail.windows, key = { it.id }) { w ->
            BookingRow(w = w, canCancel = s.caps.canControlDoors, busy = s.savingBooking) {
                vm.cancelBooking(w.id)
            }
        }

        if (s.caps.canControlDoors) {
            item { Text("Programar ventana", fontWeight = FontWeight.SemiBold) }
            item {
                OutlinedTextField(
                    value = s.bookingTitle,
                    onValueChange = vm::setBookingTitle,
                    label = { Text("Título") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = s.bookingStartDate,
                        onValueChange = vm::setBookingStartDate,
                        label = { Text("Inicio fecha") },
                        modifier = Modifier.weight(1f),
                        singleLine = true,
                    )
                    OutlinedTextField(
                        value = s.bookingStartTime,
                        onValueChange = vm::setBookingStartTime,
                        label = { Text("Hora") },
                        modifier = Modifier.weight(1f),
                        singleLine = true,
                    )
                }
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = s.bookingEndDate,
                        onValueChange = vm::setBookingEndDate,
                        label = { Text("Fin fecha") },
                        modifier = Modifier.weight(1f),
                        singleLine = true,
                    )
                    OutlinedTextField(
                        value = s.bookingEndTime,
                        onValueChange = vm::setBookingEndTime,
                        label = { Text("Hora") },
                        modifier = Modifier.weight(1f),
                        singleLine = true,
                    )
                }
            }
            item {
                OutlinedTextField(
                    value = s.bookingNotes,
                    onValueChange = vm::setBookingNotes,
                    label = { Text("Notas") },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            s.bookingError?.let { item { Text(it, color = NxColors.Danger) } }
            item {
                Button(
                    onClick = vm::createBooking,
                    enabled = !s.savingBooking,
                    modifier = Modifier.fillMaxWidth(),
                ) { Text(if (s.savingBooking) "Guardando…" else "Crear ventana") }
            }
        }
    }
}

@Composable
private fun BookingRow(w: SpaceWindow, canCancel: Boolean, busy: Boolean, onCancel: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = NxColors.Card),
    ) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.CenterVertically) {
                Text(w.title.ifBlank { "Ventana #${w.id}" }, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                NxStatusChip(w.phaseLabel, NxTone.Info)
            }
            Text(w.rangeLabel, style = MaterialTheme.typography.bodySmall, color = NxColors.Muted)
            w.hostName?.takeIf { it.isNotBlank() }?.let {
                Text("Anfitrión: $it", style = MaterialTheme.typography.bodySmall)
            }
            if (canCancel && !w.isPast) {
                OutlinedButton(onClick = onCancel, enabled = !busy) { Text("Cancelar") }
            }
        }
    }
}
