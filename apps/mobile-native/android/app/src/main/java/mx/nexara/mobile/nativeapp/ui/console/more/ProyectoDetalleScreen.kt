package mx.nexara.mobile.nativeapp.ui.console.more

import android.app.Application
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.ProyectoDetalleDto
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.console.CoreExtrasRepository
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxFilterBar
import mx.nexara.mobile.nativeapp.ui.enterprise.NxFilterPill
import mx.nexara.mobile.nativeapp.ui.enterprise.NxScreenScaffold
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSecondaryButton
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSkeletonList
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone
import mx.nexara.mobile.nativeapp.ui.enterprise.NxUi

data class ProyectoDetalleUiState(
    val cargando: Boolean = true,
    val refrescando: Boolean = false,
    val error: String? = null,
    val proyecto: ProyectoDetalleDto? = null,
    val cambiando: Boolean = false,
    val errorCambio: String? = null,
)

class ProyectoDetalleViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = CoreExtrasRepository(app.applicationContext)
    private val auth = AuthRepository(app.applicationContext)

    private val _state = MutableStateFlow(ProyectoDetalleUiState())
    val state: StateFlow<ProyectoDetalleUiState> = _state

    /** Lo mismo que pide el servidor para cambiar el estado; si no tiene, ni se ofrece. */
    val puedeCambiarEstado: Boolean
        get() = auth.loadSession()?.let { u -> u.isSuperAdmin || "activities.manage" in u.permissions } ?: false

    fun cargar(id: Long, refresco: Boolean = false) {
        _state.update { if (refresco) it.copy(refrescando = true) else it.copy(cargando = true, error = null) }
        viewModelScope.launch {
            try {
                val p = repo.proyecto(id)
                _state.update { it.copy(cargando = false, refrescando = false, proyecto = p, error = null) }
            } catch (e: Throwable) {
                _state.update {
                    it.copy(cargando = false, refrescando = false, error = e.toUserMessage("No se pudo abrir el proyecto"))
                }
            }
        }
    }

    fun cambiarEstado(id: Long, estado: String, motivo: String?) {
        if (_state.value.cambiando) return
        _state.update { it.copy(cambiando = true, errorCambio = null) }
        viewModelScope.launch {
            try {
                val p = repo.cambiarEstadoProyecto(id, estado, motivo)
                _state.update { it.copy(cambiando = false, proyecto = p) }
            } catch (e: Throwable) {
                _state.update { it.copy(cambiando = false, errorCambio = e.toUserMessage("No se pudo cambiar el estado")) }
            }
        }
    }
}

/** Un proyecto completo. Cada actividad abre su detalle. */
@Composable
fun ProyectoDetalleScreen(
    proyectoId: Long,
    onOpenActivity: (Long, String?) -> Unit,
    vm: ProyectoDetalleViewModel = viewModel(),
) {
    val state by vm.state.collectAsState()
    var seccionNombre by rememberSaveable { mutableStateOf(ProyectoDetalleRules.Seccion.RESUMEN.name) }
    var cambiando by remember { mutableStateOf(false) }

    LaunchedEffect(proyectoId) { vm.cargar(proyectoId) }

    NxScreenScaffold(isRefreshing = state.refrescando, onRefresh = { vm.cargar(proyectoId, refresco = true) }) {
        val p = state.proyecto
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            when {
                p == null && state.cargando -> item(key = "esqueleto") { NxSkeletonList(itemCount = 4) }
                p == null -> item(key = "error") {
                    NxErrorBlock(state.error ?: "No se pudo abrir el proyecto", onRetry = { vm.cargar(proyectoId) })
                }
                else -> {
                    val secciones = ProyectoDetalleRules.secciones(p)
                    val seccion = secciones.firstOrNull { it.name == seccionNombre } ?: ProyectoDetalleRules.Seccion.RESUMEN
                    item(key = "cabecera") {
                        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text(
                                p.title?.trim()?.ifEmpty { null } ?: "Proyecto sin título",
                                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                                color = NxColors.Slate,
                            )
                            p.client?.name?.let { Text(it, fontSize = 13.sp, color = NxUi.Fg2) }
                        }
                    }
                    if (secciones.size > 1) {
                        item(key = "secciones") {
                            NxFilterBar(contentPadding = PaddingValues(horizontal = 0.dp)) {
                                secciones.forEach { s ->
                                    NxFilterPill(
                                        label = s.etiqueta,
                                        count = null,
                                        selected = s == seccion,
                                        onClick = { seccionNombre = s.name },
                                    )
                                }
                            }
                        }
                    }
                    when (seccion) {
                        ProyectoDetalleRules.Seccion.RESUMEN -> item(key = "resumen") {
                            Resumen(
                                p = p,
                                puedeCambiar = vm.puedeCambiarEstado,
                                ocupado = state.cambiando,
                                error = state.errorCambio,
                                onCambiar = { cambiando = true },
                            )
                        }
                        ProyectoDetalleRules.Seccion.CRONOGRAMA ->
                            items(ProyectoDetalleRules.etapasEnOrden(p.milestones), key = { "etapa-${it.id}" }) { e ->
                                Renglon(
                                    titulo = e.name.orEmpty(),
                                    detalle = listOfNotNull(
                                        ProyectosRules.fechaCorta(e.actualDate ?: e.plannedDate),
                                        e.responsable?.nombre,
                                    ).joinToString(" · "),
                                    estado = ProyectoDetalleRules.etiquetaEtapa(e.status),
                                )
                            }
                        ProyectoDetalleRules.Seccion.ALCANCE -> {
                            ProyectoDetalleRules.alcancePorTipo(p.scopeItems).forEach { (titulo, renglones) ->
                                item(key = "alcance-$titulo") { Subtitulo(titulo) }
                                items(renglones, key = { "alcance-${it.id}" }) { r ->
                                    Renglon(titulo = r.titulo.orEmpty(), detalle = r.detalle.orEmpty())
                                }
                            }
                            if (!p.requirements.isNullOrEmpty()) {
                                item(key = "req-titulo") { Subtitulo("Requerimientos") }
                                items(p.requirements, key = { "req-${it.id}" }) { r ->
                                    Renglon(
                                        titulo = r.titulo.orEmpty(),
                                        detalle = listOfNotNull(ProyectosRules.fechaCorta(r.dueDate), r.responsable?.nombre).joinToString(" · "),
                                        estado = ProyectoDetalleRules.etiquetaRequerimiento(r.status),
                                    )
                                }
                            }
                        }
                        ProyectoDetalleRules.Seccion.EQUIPO ->
                            items(p.members.orEmpty(), key = { "miembro-${it.id}" }) { m ->
                                Renglon(
                                    titulo = m.user?.nombre.orEmpty(),
                                    detalle = ProyectoDetalleRules.etiquetaRol(m.rolEtiqueta, m.role),
                                )
                            }
                        ProyectoDetalleRules.Seccion.DOCUMENTOS ->
                            items(p.documents.orEmpty(), key = { "doc-${it.id}" }) { d ->
                                Renglon(titulo = d.nombre.orEmpty(), detalle = "Se abre desde la computadora")
                            }
                        ProyectoDetalleRules.Seccion.ACTIVIDADES ->
                            items(p.activities.orEmpty(), key = { "act-${it.id}" }) { a ->
                                Renglon(
                                    titulo = a.titulo?.trim()?.ifEmpty { null } ?: a.anNumber.orEmpty(),
                                    detalle = listOfNotNull(a.responsable?.nombre, a.branchName, ProyectosRules.fechaCorta(a.fechaEntregaEsperada)).joinToString(" · "),
                                    estado = a.estatus,
                                    onClick = a.id?.let { id -> { onOpenActivity(id, null) } },
                                )
                            }
                    }
                }
            }
        }
    }

    val abierto = state.proyecto
    if (cambiando && abierto != null) {
        DialogoCambiarEstado(
            actual = abierto.status,
            onCancelar = { cambiando = false },
            onConfirmar = { estado, motivo ->
                cambiando = false
                vm.cambiarEstado(proyectoId, estado, motivo)
            },
        )
    }
}

@Composable
private fun Subtitulo(texto: String) {
    Text(texto, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = NxUi.Fg2)
}

@Composable
private fun Resumen(p: ProyectoDetalleDto, puedeCambiar: Boolean, ocupado: Boolean, error: String?, onCambiar: () -> Unit) {
    MoreTarjeta {
        NxStatusChip(ProyectoDetalleRules.etiquetaEstado(p.status), if (p.status == "CANCELLED") NxTone.Danger else NxTone.Info)
        p.resumen?.avance?.porcentaje?.let { Dato("Avance", "$it %") }
        Dato("Etapas", (p.milestones?.size ?: 0).toString())
        ProyectosRules.fechaCorta(p.startDate)?.let { Dato("Inicio", it) }
        ProyectosRules.fechaCorta(p.actualEndDate ?: p.endDate)?.let { Dato("Fin", it) }
        p.responsable?.nombre?.let { Dato("Responsable", it) }
        p.objective?.trim()?.takeIf { it.isNotEmpty() }?.let { Dato("Objetivo", it) }
        p.description?.trim()?.takeIf { it.isNotEmpty() }?.let { Dato("Descripción", it) }
        p.cancelReason?.trim()?.takeIf { it.isNotEmpty() }?.let { Dato("Por qué se canceló", it) }
        error?.let { Text(it, fontSize = 13.sp, color = NxColors.Danger) }
        if (puedeCambiar) {
            NxSecondaryButton(text = "Cambiar estado", onClick = onCambiar, enabled = !ocupado)
        }
    }
}

@Composable
private fun Dato(etiqueta: String, valor: String) {
    Column {
        Text(etiqueta, fontSize = 12.5.sp, color = NxUi.Fg2)
        Text(valor, fontSize = 14.sp, color = NxColors.Slate)
    }
}

@Composable
private fun Renglon(titulo: String, detalle: String = "", estado: String? = null, onClick: (() -> Unit)? = null) {
    MoreTarjeta(modifier = if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.Top,
        ) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(titulo, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = NxColors.Slate)
                if (detalle.isNotBlank()) Text(detalle, fontSize = 12.5.sp, color = NxUi.Fg2)
            }
            estado?.takeIf { it.isNotBlank() }?.let { Text(it, fontSize = 12.5.sp, color = NxUi.Fg2) }
        }
    }
}

@Composable
private fun DialogoCambiarEstado(
    actual: String?,
    onCancelar: () -> Unit,
    onConfirmar: (String, String?) -> Unit,
) {
    var elegido by remember { mutableStateOf<String?>(null) }
    var motivo by remember { mutableStateOf("") }
    val valido = elegido?.let { ProyectoDetalleRules.motivoValido(it, motivo) } == true

    AlertDialog(
        onDismissRequest = onCancelar,
        title = { Text("Cambiar estado") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                ProyectoDetalleRules.estadosPosibles(actual).forEach { e ->
                    Text(
                        (if (e == elegido) "● " else "○ ") + ProyectoDetalleRules.etiquetaEstado(e),
                        fontSize = 15.sp,
                        color = NxColors.Slate,
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { elegido = e }
                            .padding(vertical = 10.dp),
                    )
                }
                if (elegido?.let(ProyectoDetalleRules::pideMotivo) == true) {
                    OutlinedTextField(
                        value = motivo,
                        onValueChange = { motivo = it },
                        label = { Text("Motivo") },
                        minLines = 2,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
        },
        confirmButton = {
            TextButton(onClick = { elegido?.let { onConfirmar(it, motivo) } }, enabled = valido) {
                Text("Cambiar", fontWeight = FontWeight.Bold, color = if (valido) NxColors.Brand else NxColors.Muted)
            }
        },
        dismissButton = { TextButton(onClick = onCancelar) { Text("Cancelar", color = NxUi.Fg2) } },
        containerColor = NxColors.Card,
    )
}
