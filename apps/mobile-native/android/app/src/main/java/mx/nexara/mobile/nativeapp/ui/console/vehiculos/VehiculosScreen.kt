package mx.nexara.mobile.nativeapp.ui.console.vehiculos

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import mx.nexara.mobile.nativeapp.data.api.AsignacionActivaDto
import mx.nexara.mobile.nativeapp.data.api.SolicitudResumenDto
import mx.nexara.mobile.nativeapp.data.api.VehiculoFlotaDto
import mx.nexara.mobile.nativeapp.ui.console.activities.DateTimePickerField
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxFormTextField
import mx.nexara.mobile.nativeapp.ui.enterprise.NxListRow
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell
import mx.nexara.mobile.nativeapp.ui.enterprise.NxScreenScaffold
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSnackbarHost
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone
import mx.nexara.mobile.nativeapp.ui.enterprise.rememberNxSnackbarHostState

/**
 * «Vehículos» de Core en la app: lo que traigo asignado, mis solicitudes y la
 * flota libre. Salida y regreso pasan por [ChecklistVehiculoFlow] — siete fotos
 * con cámara en vivo, nunca galería.
 */
@Composable
fun VehiculosScreen() {
    val vm: VehiculosViewModel = viewModel()
    val state by vm.state.collectAsState()
    val snackbar = rememberNxSnackbarHostState()
    var solicitando by remember { mutableStateOf<VehiculoFlotaDto?>(null) }

    LaunchedEffect(state.mensaje) {
        val msg = state.mensaje ?: return@LaunchedEffect
        vm.limpiarMensaje()
        snackbar.showSnackbar(msg)
    }

    val flujo = state.flujo
    if (flujo != null) {
        NxScreenScaffold {
            ChecklistVehiculoFlow(
                titulo = flujo.titulo,
                vehiculo = flujo.vehiculo,
                kmInicio = flujo.kmInicio,
                enviando = state.enviando,
                error = state.accionError,
                onCancelar = vm::cerrarChecklist,
                onEnviar = vm::enviarChecklist,
            )
        }
        return
    }

    NxScreenScaffold(isRefreshing = state.refreshing, onRefresh = { vm.load(refresh = true) }) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (state.loading) {
                item { NxLoadingBlock("Cargando tus vehículos…") }
            }
            state.error?.let { msg ->
                item { NxErrorBlock(msg, onRetry = { vm.load(refresh = true) }) }
            }
            state.activa?.let { activa ->
                item { AsignacionActivaCard(activa = activa, onAccion = vm::abrirChecklist) }
            }
            if (state.solicitudes.isNotEmpty()) {
                item { NxSectionHeader(title = "Mis solicitudes") }
                items(state.solicitudes, key = { it.id ?: 0L }) { s -> SolicitudRow(s) }
            }
            if (state.disponibles.isNotEmpty()) {
                item { NxSectionHeader(title = "Disponibles") }
                items(state.disponibles, key = { it.id ?: 0L }) { v ->
                    DisponibleRow(
                        vehiculo = v,
                        onSolicitar = { solicitando = v },
                        onSalida = {
                            vm.abrirChecklist(
                                FlujoChecklist(
                                    id = v.id ?: 0L,
                                    vehiculo = v.etiqueta(),
                                    devolucion = false,
                                    inventario = true,
                                ),
                            )
                        },
                    )
                }
            }
            if (!state.loading && state.error == null && state.vacio) {
                item {
                    NxEmptyState(
                        title = "Sin vehículos",
                        subtitle = "No traes asignación ni hay unidades libres.",
                    )
                }
            }
            item { Spacer(Modifier.height(16.dp)) }
        }
        NxSnackbarHost(snackbar, modifier = Modifier.align(Alignment.BottomCenter))
    }

    solicitando?.let { vehiculo ->
        SolicitarDialog(
            vehiculo = vehiculo,
            state = state,
            enviando = state.enviando,
            error = state.accionError,
            onCerrar = {
                solicitando = null
                vm.limpiarAccionError()
            },
            onSolicitar = { actividadId, motivo, inicio, fin ->
                vm.solicitar(
                    actividadId = actividadId,
                    vehicleId = vehiculo.id ?: 0L,
                    motivoUso = motivo,
                    fechaInicio = inicio,
                    fechaFin = fin,
                    onListo = { solicitando = null },
                )
            },
        )
    }
}

internal fun VehiculoFlotaDto.etiqueta(): String =
    listOfNotNull(nombre?.takeIf { it.isNotBlank() }, placas?.takeIf { it.isNotBlank() })
        .joinToString(" · ")
        .ifBlank { "Vehículo" }

@Composable
private fun AsignacionActivaCard(
    activa: AsignacionActivaDto,
    onAccion: (FlujoChecklist) -> Unit,
) {
    val nombre = listOfNotNull(
        activa.vehiculo?.nombre?.takeIf { it.isNotBlank() },
        activa.vehiculo?.placas?.takeIf { it.isNotBlank() },
    ).joinToString(" · ").ifBlank { "Vehículo asignado" }

    NxPanelShell {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(nombre, fontWeight = FontWeight.Bold, color = NxColors.Slate)
            NxStatusChip(if (activa.esInventario) "Inventario" else "Solicitud", NxTone.Brand)
        }
        val fechas = listOfNotNull(
            activa.inicio?.take(16)?.replace('T', ' '),
            activa.fin?.take(16)?.replace('T', ' '),
        ).joinToString(" → ")
        if (fechas.isNotBlank()) {
            Text(fechas, fontSize = 12.5.sp, color = NxColors.Muted)
        }
        val salida = listOfNotNull(
            activa.odometroInicio?.let { "Km salida $it" },
            activa.combustibleInicioPct?.let { "Combustible $it%" },
        ).joinToString(" · ")
        if (salida.isNotBlank()) {
            Text(salida, fontSize = 12.5.sp, color = NxColors.Muted)
        }
        Spacer(Modifier.height(10.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (activa.pideSalida) {
                Button(
                    onClick = {
                        onAccion(
                            FlujoChecklist(
                                id = activa.id ?: 0L,
                                vehiculo = nombre,
                                devolucion = false,
                                inventario = activa.esInventario,
                            ),
                        )
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = NxColors.Brand),
                    modifier = Modifier.weight(1f).heightIn(min = 46.dp),
                ) { Text("Salida") }
            }
            if (activa.pideDevolucion) {
                Button(
                    onClick = {
                        onAccion(
                            FlujoChecklist(
                                id = activa.id ?: 0L,
                                vehiculo = nombre,
                                devolucion = true,
                                inventario = activa.esInventario,
                                kmInicio = activa.odometroInicio,
                            ),
                        )
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = NxColors.Success),
                    modifier = Modifier.weight(1f).heightIn(min = 46.dp),
                ) { Text("Regreso") }
            }
        }
    }
}

@Composable
private fun SolicitudRow(solicitud: SolicitudResumenDto) {
    val estatus = solicitud.estatusAprobacion.orEmpty()
    val tono = when (estatus.uppercase()) {
        "APROBADA", "APROBADO" -> NxTone.Success
        "RECHAZADA", "RECHAZADO" -> NxTone.Danger
        else -> NxTone.Warning
    }
    NxListRow(
        title = listOfNotNull(
            solicitud.nombreVehiculo?.takeIf { it.isNotBlank() },
            solicitud.placasVehiculo?.takeIf { it.isNotBlank() },
        ).joinToString(" · ").ifBlank { "Solicitud" },
        subtitle = listOfNotNull(
            solicitud.fechaInicioSolicitada?.take(16)?.replace('T', ' '),
            solicitud.fechaFinSolicitada?.take(16)?.replace('T', ' '),
        ).joinToString(" → ").ifBlank { null },
        meta = solicitud.entregaEstatus?.takeIf { it.isNotBlank() },
        chipText = estatus.ifBlank { "Pendiente" },
        chipTone = tono,
    )
}

@Composable
private fun DisponibleRow(
    vehiculo: VehiculoFlotaDto,
    onSolicitar: () -> Unit,
    onSalida: () -> Unit,
) {
    NxListRow(
        title = vehiculo.etiqueta(),
        subtitle = listOfNotNull(
            vehiculo.odometroUltimo?.let { "Km $it" },
            vehiculo.combustibleUltimoPct?.let { "$it%" },
        ).joinToString(" · ").ifBlank { null },
        meta = vehiculo.estatus?.takeIf { it.isNotBlank() },
        trailing = {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                OutlinedButton(
                    onClick = onSolicitar,
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                ) { Text("Solicitar", fontSize = 13.sp) }
                Button(
                    onClick = onSalida,
                    colors = ButtonDefaults.buttonColors(containerColor = NxColors.Brand),
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                ) { Text("Salida", fontSize = 13.sp) }
            }
        },
    )
}

@Composable
private fun SolicitarDialog(
    vehiculo: VehiculoFlotaDto,
    state: VehiculosUiState,
    enviando: Boolean,
    error: String?,
    onCerrar: () -> Unit,
    onSolicitar: (actividadId: Long, motivo: String, inicio: String, fin: String) -> Unit,
) {
    var actividadId by remember { mutableStateOf<Long?>(null) }
    var menuAbierto by remember { mutableStateOf(false) }
    var motivo by remember { mutableStateOf("") }
    var inicio by remember { mutableStateOf("") }
    var fin by remember { mutableStateOf("") }

    val actividad = state.actividades.firstOrNull { it.id == actividadId }
    val listo = actividadId != null && motivo.isNotBlank() && inicio.isNotBlank() && fin.isNotBlank()

    AlertDialog(
        onDismissRequest = { if (!enviando) onCerrar() },
        title = { Text("Solicitar ${vehiculo.etiqueta()}") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Box {
                    OutlinedButton(
                        onClick = { menuAbierto = true },
                        enabled = !enviando && state.actividades.isNotEmpty(),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(
                            actividad?.let { a ->
                                listOfNotNull(a.anNumber, a.titulo).joinToString(" · ").ifBlank { "Actividad ${a.id}" }
                            } ?: if (state.actividades.isEmpty()) "Sin actividades abiertas" else "Elegir actividad",
                            fontSize = 13.sp,
                        )
                    }
                    DropdownMenu(expanded = menuAbierto, onDismissRequest = { menuAbierto = false }) {
                        state.actividades.forEach { a ->
                            DropdownMenuItem(
                                text = {
                                    Text(listOfNotNull(a.anNumber, a.titulo).joinToString(" · ").ifBlank { "Actividad ${a.id}" })
                                },
                                onClick = {
                                    actividadId = a.id
                                    menuAbierto = false
                                },
                            )
                        }
                    }
                }
                NxFormTextField(
                    value = motivo,
                    onValueChange = { motivo = it.take(300) },
                    label = "Motivo",
                )
                DateTimePickerField(label = "Desde", value = inicio, onValueChange = { inicio = it })
                DateTimePickerField(label = "Hasta", value = fin, onValueChange = { fin = it })
                error?.let { Text(it, color = NxColors.Danger, fontSize = 12.5.sp) }
            }
        },
        confirmButton = {
            Button(
                onClick = { onSolicitar(actividadId ?: return@Button, motivo, inicio, fin) },
                enabled = listo && !enviando,
                colors = ButtonDefaults.buttonColors(containerColor = NxColors.Brand),
            ) { Text(if (enviando) "Enviando…" else "Solicitar") }
        },
        dismissButton = {
            TextButton(onClick = onCerrar, enabled = !enviando) { Text("Cancelar") }
        },
    )
}
