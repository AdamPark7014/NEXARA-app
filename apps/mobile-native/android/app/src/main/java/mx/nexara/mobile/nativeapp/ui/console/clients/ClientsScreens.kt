package mx.nexara.mobile.nativeapp.ui.console.clients

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
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import mx.nexara.mobile.nativeapp.access.ClientSector
import mx.nexara.mobile.nativeapp.data.api.ClientDto
import mx.nexara.mobile.nativeapp.ui.console.activities.DatePickerField
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxFormTextField
import mx.nexara.mobile.nativeapp.ui.enterprise.NxListRow
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSearchField
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone

/**
 * Clientes de NEXARA Core — las tres pantallas de
 * `apps/web/app/(panels)/erp/clientes`: padrón por sector, ficha con datos
 * fiscales y proyectos, y alta con consulta de RFC.
 */

private fun ClientDto.subtitleLine(): String =
    listOfNotNull(taxId?.takeIf { it.isNotBlank() }, legalName?.takeIf { it.isNotBlank() })
        .joinToString(" · ")
        .ifBlank { "Sin datos fiscales" }

// ── Padrón ──────────────────────────────────────────────────────────────────

@Composable
fun ClientsListScreen(
    onOpenClient: (Long) -> Unit,
    onNewClient: (ClientSector?) -> Unit,
    contentPadding: PaddingValues = PaddingValues(16.dp),
) {
    val vm: ClientsListViewModel = viewModel()
    val state by vm.state.collectAsState()

    if (state.allowedSectors.isEmpty()) {
        NxEmptyState(
            title = "Sin acceso al padrón",
            subtitle = "Tu correo no tiene sectores de clientes asignados.",
        )
        return
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(contentPadding),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            NxSectionHeader(
                title = "Clientes",
                subtitle = "Un padrón, tres usos. Cambia de sector sin salir de aquí.",
                trailing = {
                    Button(onClick = { onNewClient(state.sector) }) { Text("Nuevo") }
                },
            )
        }

        if (state.allowedSectors.size > 1) {
            item {
                Row(
                    Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    state.allowedSectors.forEach { sector ->
                        FilterChip(
                            selected = state.sector == sector,
                            onClick = { vm.selectSector(sector) },
                            label = { Text("${sector.emoji} ${sector.shortLabel}") },
                        )
                    }
                }
            }
        }

        item {
            NxSearchField(
                value = state.query,
                onValueChange = vm::setQuery,
                placeholder = "Buscar nombre, RFC…",
            )
        }

        state.sector?.let { sector ->
            item {
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        sector.help,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.weight(1f).padding(end = 8.dp),
                    )
                    Text(
                        if (state.loading) "…" else "${state.visible.size}",
                        style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.SemiBold),
                    )
                }
            }
        }

        state.error?.let { err ->
            item { NxErrorBlock(err) { vm.load() } }
        }

        when {
            state.loading -> item { NxLoadingBlock("Cargando clientes…") }
            state.visible.isEmpty() -> item {
                NxEmptyState(
                    title = "Nadie en este sector todavía",
                    subtitle = "Da de alta el primer cliente del sector.",
                    actionLabel = "Crear el primero",
                    onAction = { onNewClient(state.sector) },
                )
            }
            else -> items(state.visible, key = { it.id }) { client ->
                NxListRow(
                    title = client.name.orEmpty().ifBlank { "Sin nombre" },
                    subtitle = client.subtitleLine(),
                    meta = client.sectorNames
                        .mapNotNull { ClientSector.fromApi(it)?.shortLabel }
                        .joinToString(" · ")
                        .ifBlank { null },
                    chipText = if (state.showOwner) {
                        client.owner?.nombre?.split(Regex("\\s+"))?.take(2)?.joinToString(" ")
                            ?: "Sin encargado"
                    } else {
                        "Ver"
                    },
                    onClick = { onOpenClient(client.id) },
                )
            }
        }

        item { Spacer(Modifier.height(16.dp)) }
    }
}

// ── Ficha ───────────────────────────────────────────────────────────────────

@Composable
fun ClientDetailScreen(
    clientId: Long,
    onBack: () -> Unit,
    contentPadding: PaddingValues = PaddingValues(16.dp),
) {
    val app = LocalContext.current.applicationContext as Application
    val vm: ClientDetailViewModel = viewModel(
        key = "client-$clientId",
        factory = ClientDetailViewModel.factory(app, clientId),
    )
    val state by vm.state.collectAsState()
    val client = state.client

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(contentPadding),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            TextButton(onClick = onBack) { Text("← Clientes") }
        }

        if (state.loading && client == null) {
            item { NxLoadingBlock("Cargando cliente…") }
        }

        state.error?.let { err ->
            item { NxErrorBlock(err) { vm.load() } }
        }

        if (client != null) {
            item {
                NxSectionHeader(
                    title = client.name.orEmpty().ifBlank { "Sin nombre" },
                    subtitle = "Encargado: ${client.owner?.nombre ?: "—"}",
                )
            }

            item {
                NxPanelShell {
                    Text("Fiscal", fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.height(6.dp))
                    ClientFactRow("Razón social", client.legalName)
                    ClientFactRow("RFC", client.taxId)
                    ClientFactRow("Dirección", client.fiscalAddress)
                    ClientFactRow(
                        "CP / régimen",
                        listOfNotNull(
                            client.fiscalZipCode?.takeIf { it.isNotBlank() },
                            client.fiscalRegime?.takeIf { it.isNotBlank() },
                        ).joinToString(" · "),
                    )
                    ClientFactRow(
                        "Contacto",
                        listOfNotNull(
                            client.billingEmail?.takeIf { it.isNotBlank() },
                            client.billingPhone?.takeIf { it.isNotBlank() },
                        ).joinToString(" · "),
                    )
                }
            }

            item {
                NxPanelShell {
                    Text("Sectores", fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.height(8.dp))
                    Row(
                        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        state.clientSectors.forEach { sector ->
                            NxStatusChip("${sector.emoji} ${sector.shortLabel}", NxTone.Brand)
                        }
                    }
                    if (state.addableSectors.isNotEmpty()) {
                        Spacer(Modifier.height(8.dp))
                        Row(
                            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            state.addableSectors.forEach { sector ->
                                OutlinedButton(
                                    onClick = { vm.addSector(sector) },
                                    enabled = !state.busy,
                                ) { Text("+ ${sector.shortLabel}") }
                            }
                        }
                    }
                }
            }

            if (state.hasProyecto) {
                item {
                    NxPanelShell {
                        Text("Proyectos (${state.projects.size})", fontWeight = FontWeight.SemiBold)
                        Spacer(Modifier.height(6.dp))
                        if (client.serviceClientId == null) {
                            Text(
                                "Falta puente operativo.",
                                style = MaterialTheme.typography.bodySmall,
                            )
                        } else {
                            if (state.projects.isEmpty()) {
                                Text(
                                    "Sin proyectos aún.",
                                    style = MaterialTheme.typography.bodySmall,
                                )
                            } else {
                                state.projects.forEach { project ->
                                    NxListRow(
                                        title = project.title.orEmpty().ifBlank { "Proyecto ${project.id}" },
                                        subtitle = project.status,
                                    )
                                    Spacer(Modifier.height(6.dp))
                                }
                            }
                            if (state.canCreateProject) {
                                Spacer(Modifier.height(8.dp))
                                NxFormTextField(
                                    value = state.projectTitle,
                                    onValueChange = vm::setProjectTitle,
                                    label = "Nombre del proyecto",
                                )
                                Spacer(Modifier.height(8.dp))
                                DatePickerField(
                                    label = "Inicio",
                                    value = state.projectStart,
                                    onValueChange = vm::setProjectStart,
                                )
                                Spacer(Modifier.height(8.dp))
                                Button(
                                    onClick = { vm.createProject() },
                                    enabled = !state.busy,
                                    modifier = Modifier.fillMaxWidth(),
                                ) { Text("Crear proyecto") }
                            }
                        }
                    }
                }
            }
        }

        item { Spacer(Modifier.height(16.dp)) }
    }
}

@Composable
private fun ClientFactRow(label: String, value: String?) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = 3.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(label, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(end = 10.dp))
        Text(
            value?.takeIf { it.isNotBlank() } ?: "—",
            style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
        )
    }
}

// ── Alta ────────────────────────────────────────────────────────────────────

@Composable
fun NewClientScreen(
    presetSector: ClientSector?,
    onBack: () -> Unit,
    onCreated: (Long) -> Unit,
    contentPadding: PaddingValues = PaddingValues(16.dp),
) {
    val app = LocalContext.current.applicationContext as Application
    val vm: NewClientViewModel = viewModel(factory = NewClientViewModel.factory(app, presetSector))
    val state by vm.state.collectAsState()

    LaunchedEffect(state.createdId) {
        state.createdId?.let(onCreated)
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(contentPadding),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item { TextButton(onClick = onBack) { Text("← Clientes") } }
        item { NxSectionHeader(title = "Nuevo cliente", subtitle = "Datos fiscales y sectores.") }

        item {
            Column {
                Text("Sectores", fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(6.dp))
                Row(
                    Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    state.allowedSectors.forEach { sector ->
                        FilterChip(
                            selected = sector in state.sectors,
                            onClick = { vm.toggleSector(sector) },
                            label = { Text("${sector.emoji} ${sector.shortLabel}") },
                        )
                    }
                }
            }
        }

        item {
            NxFormTextField(
                value = state.name,
                onValueChange = { vm.setField("name", it) },
                label = "Nombre comercial *",
            )
        }
        item {
            NxFormTextField(
                value = state.legalName,
                onValueChange = { vm.setField("legalName", it) },
                label = "Razón social *",
            )
        }
        item {
            Column {
                NxFormTextField(
                    value = state.taxId,
                    onValueChange = { vm.setField("taxId", it) },
                    label = "RFC",
                )
                Spacer(Modifier.height(6.dp))
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    OutlinedButton(onClick = { vm.lookupRfc() }, enabled = !state.lookupBusy) {
                        Text(if (state.lookupBusy) "Consultando…" else "Consultar RFC")
                    }
                    state.lookupMessage?.let {
                        Text(it, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
        item {
            NxFormTextField(
                value = state.fiscalRegime,
                onValueChange = { vm.setField("fiscalRegime", it) },
                label = "Régimen fiscal",
            )
        }
        item {
            NxFormTextField(
                value = state.fiscalAddress,
                onValueChange = { vm.setField("fiscalAddress", it) },
                label = "Dirección fiscal",
            )
        }
        item {
            NxFormTextField(
                value = state.fiscalZipCode,
                onValueChange = { vm.setField("fiscalZipCode", it) },
                label = "CP fiscal",
            )
        }
        item {
            NxFormTextField(
                value = state.billingEmail,
                onValueChange = { vm.setField("billingEmail", it) },
                label = "Email de facturación",
            )
        }
        item {
            NxFormTextField(
                value = state.billingPhone,
                onValueChange = { vm.setField("billingPhone", it) },
                label = "Teléfono",
            )
        }
        item {
            NxFormTextField(
                value = state.notes,
                onValueChange = { vm.setField("notes", it) },
                label = "Notas",
                singleLine = false,
                minLines = 2,
            )
        }

        state.error?.let { err ->
            item { NxErrorBlock(err) }
        }

        item {
            Button(
                onClick = { vm.create() },
                enabled = !state.saving,
                modifier = Modifier.fillMaxWidth(),
            ) { Text(if (state.saving) "Guardando…" else "Crear cliente") }
        }

        item { Spacer(Modifier.height(16.dp)) }
    }
}
