package mx.nexara.mobile.nativeapp.ui.integra.vehicles

import android.app.Application
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
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
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
import mx.nexara.mobile.nativeapp.data.integra.vehicles.Dueno
import mx.nexara.mobile.nativeapp.data.integra.vehicles.FiltroDueno
import mx.nexara.mobile.nativeapp.data.integra.vehicles.FiltrosVehiculos
import mx.nexara.mobile.nativeapp.data.integra.vehicles.IntegraVehiclesRepository
import mx.nexara.mobile.nativeapp.data.integra.vehicles.PersonaResumen
import mx.nexara.mobile.nativeapp.data.integra.vehicles.PlacaLimites
import mx.nexara.mobile.nativeapp.data.integra.vehicles.ValidacionPlaca
import mx.nexara.mobile.nativeapp.data.integra.vehicles.Vehiculo
import mx.nexara.mobile.nativeapp.data.integra.vehicles.avisoDuplicado
import mx.nexara.mobile.nativeapp.data.integra.vehicles.contarSinDueno
import mx.nexara.mobile.nativeapp.data.integra.vehicles.etiquetaPersona
import mx.nexara.mobile.nativeapp.data.integra.vehicles.filtrarVehiculos
import mx.nexara.mobile.nativeapp.data.integra.vehicles.hayFiltroVehiculos
import mx.nexara.mobile.nativeapp.data.integra.vehicles.placaDuplicada
import mx.nexara.mobile.nativeapp.data.integra.vehicles.resolverDueno
import mx.nexara.mobile.nativeapp.data.integra.vehicles.validarPlaca
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxFormTextField
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSearchField
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone

/**
 * Inventario de placas de INTEGRA — paridad con
 * `apps/web/app/(panels)/integra/vehicles/page.tsx`.
 *
 * Lo que esta pantalla protege, y por qué existe casi todo su código: el alta
 * del servidor es un `upsert` sobre la placa despojada de todo lo que no sea
 * letra o número. Guardar «ABC-123» cuando ya existe «ABC 123» **no da error**:
 * pisa la ficha anterior en silencio, dueño incluido. Así que aquí se detecta
 * antes, se dice con todas las letras, y el botón de guardar se apaga.
 */

data class IntegraVehiclesUiState(
    val loading: Boolean = true,
    val isRefreshing: Boolean = false,
    val error: String? = null,
    /** El padrón puede fallar sin que falle el inventario: son dos peticiones. */
    val errorPadron: String? = null,
    val syncNote: String? = null,
    val items: List<Vehiculo> = emptyList(),
    val personas: List<PersonaResumen> = emptyList(),
    val filtros: FiltrosVehiculos = FiltrosVehiculos(),
    val formAbierto: Boolean = false,
    /** `null` con el formulario abierto = alta. Con id = edición. */
    val editandoId: String? = null,
    val placa: String = "",
    val personaId: String = "",
    val tocado: Boolean = false,
    val guardando: Boolean = false,
    val mensaje: String? = null,
    val mensajeEsError: Boolean = false,
    val porBorrar: Vehiculo? = null,
    val borrando: Boolean = false,
) {
    val validacion: ValidacionPlaca get() = validarPlaca(placa)

    val duplicado: Vehiculo?
        get() = if (validacion.valida) {
            placaDuplicada(validacion.normalizada, items, editandoId)
        } else {
            null
        }

    val filtrados: List<Vehiculo> get() = filtrarVehiculos(items, filtros)
    val conFiltro: Boolean get() = hayFiltroVehiculos(filtros)
    val sinDueno: Int get() = contarSinDueno(items)
    val enEdicion: Vehiculo? get() = editandoId?.let { id -> items.firstOrNull { it.id == id } }
    val puedeGuardar: Boolean get() = validacion.valida && duplicado == null && !guardando
}

class IntegraVehiclesViewModel(app: Application) : AndroidViewModel(app) {

    private val repo = IntegraVehiclesRepository(app.applicationContext)
    private val _state = MutableStateFlow(IntegraVehiclesUiState())
    val state: StateFlow<IntegraVehiclesUiState> = _state

    init { refresh() }

    fun setQuery(v: String) = _state.update { it.copy(filtros = it.filtros.copy(q = v)) }

    fun setFiltroDueno(v: FiltroDueno) =
        _state.update { it.copy(filtros = it.filtros.copy(dueno = v)) }

    fun limpiarFiltros() = _state.update { it.copy(filtros = FiltrosVehiculos()) }

    fun setPlaca(v: String) = _state.update { it.copy(placa = v, mensaje = null) }

    fun setPersonaId(v: String) = _state.update { it.copy(personaId = v, mensaje = null) }

    fun marcarTocado() = _state.update { it.copy(tocado = true) }

    fun abrirAlta() = _state.update {
        it.copy(
            formAbierto = true,
            editandoId = null,
            placa = "",
            personaId = "",
            tocado = false,
            mensaje = null,
        )
    }

    fun empezarEdicion(v: Vehiculo) = _state.update {
        it.copy(
            formAbierto = true,
            editandoId = v.id,
            placa = v.plate,
            personaId = v.personId.orEmpty(),
            tocado = false,
            mensaje = null,
        )
    }

    fun cancelarForm() = _state.update {
        it.copy(
            formAbierto = false,
            editandoId = null,
            placa = "",
            personaId = "",
            tocado = false,
            mensaje = null,
        )
    }

    fun pedirBorrado(v: Vehiculo) = _state.update { it.copy(porBorrar = v) }

    fun cancelarBorrado() = _state.update { it.copy(porBorrar = null) }

    fun refresh(initial: Boolean = true) {
        _state.update {
            it.copy(
                loading = initial && it.items.isEmpty(),
                isRefreshing = !initial,
                error = null,
            )
        }
        viewModelScope.launch {
            try {
                val inv = withContext(Dispatchers.IO) { repo.vehiculos() }
                _state.update {
                    it.copy(
                        loading = false,
                        isRefreshing = false,
                        items = inv.items,
                        syncNote = inv.syncNote,
                    )
                }
            } catch (e: Exception) {
                val d = IntegraVehiclesRepository.diagnosticar(
                    e,
                    "No se pudo cargar el inventario de placas",
                )
                _state.update {
                    it.copy(loading = false, isRefreshing = false, error = d.mensaje)
                }
            }

            // El padrón va aparte a propósito: que no haya personas no puede
            // impedir ver ni dar de alta placas.
            try {
                val personas = withContext(Dispatchers.IO) { repo.personas() }
                _state.update { it.copy(personas = personas, errorPadron = null) }
            } catch (e: Exception) {
                val d = IntegraVehiclesRepository.diagnosticar(
                    e,
                    "No se pudo cargar el padrón de personas",
                )
                _state.update { it.copy(personas = emptyList(), errorPadron = d.mensaje) }
            }
        }
    }

    /**
     * Guarda el alta o la edición.
     *
     * En el alta se vuelve a pedir el inventario justo antes del `POST`. No es
     * paranoia: entre que se cargó la lista y se pulsa «Agregar», otro operador
     * puede haber dado de alta esa misma placa, y el servidor no devolvería
     * error — borraría su ficha. Una petición de más es barata comparada con
     * perder el dueño de un coche.
     */
    fun guardar() {
        val s = _state.value
        if (!s.puedeGuardar) return
        val placa = s.validacion.normalizada
        val editandoId = s.editandoId

        _state.update { it.copy(guardando = true, mensaje = null) }
        viewModelScope.launch {
            try {
                if (editandoId != null) {
                    withContext(Dispatchers.IO) {
                        repo.editarVehiculo(
                            vehicleId = editandoId,
                            placaNormalizada = placa,
                            // Cadena vacía = «quita al dueño». Ver el repositorio.
                            personId = s.personaId,
                        )
                    }
                } else {
                    val frescos = withContext(Dispatchers.IO) { repo.vehiculos().items }
                    val choque = placaDuplicada(placa, frescos, null)
                    if (choque != null) {
                        _state.update {
                            it.copy(
                                guardando = false,
                                items = frescos,
                                mensaje = avisoDuplicado(choque),
                                mensajeEsError = true,
                            )
                        }
                        return@launch
                    }
                    withContext(Dispatchers.IO) {
                        repo.altaVehiculo(
                            placaNormalizada = placa,
                            personId = s.personaId.ifBlank { null },
                        )
                    }
                }
                _state.update {
                    it.copy(
                        guardando = false,
                        formAbierto = false,
                        editandoId = null,
                        placa = "",
                        personaId = "",
                        tocado = false,
                        mensaje = if (editandoId != null) {
                            "Cambios guardados en $placa."
                        } else {
                            "Placa $placa dada de alta."
                        },
                        mensajeEsError = false,
                    )
                }
                refresh(initial = false)
            } catch (e: Exception) {
                val d = IntegraVehiclesRepository.diagnosticar(
                    e,
                    if (editandoId != null) {
                        "No se pudieron guardar los cambios del vehículo"
                    } else {
                        "No se pudo dar de alta la placa"
                    },
                )
                _state.update {
                    it.copy(guardando = false, mensaje = d.mensaje, mensajeEsError = true)
                }
            }
        }
    }

    fun confirmarBorrado() {
        val v = _state.value.porBorrar ?: return
        _state.update { it.copy(borrando = true) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.borrarVehiculo(v.id) }
                _state.update {
                    it.copy(
                        borrando = false,
                        porBorrar = null,
                        mensaje = "Placa ${v.plate} eliminada.",
                        mensajeEsError = false,
                        formAbierto = if (it.editandoId == v.id) false else it.formAbierto,
                        editandoId = if (it.editandoId == v.id) null else it.editandoId,
                    )
                }
                refresh(initial = false)
            } catch (e: Exception) {
                val d = IntegraVehiclesRepository.diagnosticar(e, "No se pudo eliminar el vehículo")
                _state.update {
                    it.copy(
                        borrando = false,
                        porBorrar = null,
                        mensaje = d.mensaje,
                        mensajeEsError = true,
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun IntegraVehiclesScreen(vm: IntegraVehiclesViewModel = viewModel()) {
    val s by vm.state.collectAsState()

    s.porBorrar?.let { v ->
        AlertDialog(
            onDismissRequest = { if (!s.borrando) vm.cancelarBorrado() },
            title = { Text("Eliminar placa") },
            text = {
                Text(
                    "Se va a eliminar la placa ${v.plate}" +
                        (v.personName?.let { ", asignada a $it" } ?: "") +
                        ". Esta acción no se puede deshacer.",
                )
            },
            confirmButton = {
                Button(
                    onClick = { vm.confirmarBorrado() },
                    enabled = !s.borrando,
                    colors = ButtonDefaults.buttonColors(containerColor = NxColors.Danger),
                ) { Text(if (s.borrando) "Eliminando…" else "Eliminar placa") }
            },
            dismissButton = {
                TextButton(onClick = { vm.cancelarBorrado() }, enabled = !s.borrando) {
                    Text("Cancelar")
                }
            },
        )
    }

    if (s.formAbierto) {
        FormularioPlaca(s = s, vm = vm)
        return
    }

    PullToRefreshBox(
        isRefreshing = s.isRefreshing,
        onRefresh = { vm.refresh(initial = false) },
        modifier = Modifier.fillMaxSize(),
    ) {
        when {
            s.loading -> NxLoadingBlock("Cargando el inventario de placas…")

            s.error != null && s.items.isEmpty() ->
                NxErrorBlock(s.error.orEmpty()) { vm.refresh() }

            else -> LazyColumn(
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                item { Cabecera(s = s, vm = vm) }

                s.mensaje?.let { msg ->
                    item {
                        Text(
                            msg,
                            style = MaterialTheme.typography.bodySmall,
                            color = if (s.mensajeEsError) NxColors.Danger else NxColors.Success,
                        )
                    }
                }

                s.error?.let { msg ->
                    item { NxErrorBlock(msg) { vm.refresh() } }
                }

                s.syncNote?.let { nota ->
                    item { Aviso(nota) }
                }

                when {
                    s.items.isEmpty() && s.error == null -> item {
                        NxEmptyState(
                            title = "Todavía no hay ninguna placa registrada",
                            subtitle = "Este es el padrón de vehículos del sitio: sirve para " +
                                "saber de quién es un coche cuando aparece en la caseta o en " +
                                "un evento. Ojo: las placas se guardan en NEXARA, no se " +
                                "empujan a las cámaras.",
                            actionLabel = "Dar de alta la primera",
                            onAction = { vm.abrirAlta() },
                        )
                    }

                    s.filtrados.isEmpty() -> item {
                        NxEmptyState(
                            title = "Ninguna placa cumple este filtro",
                            subtitle = "Hay ${s.items.size} placas registradas, pero ninguna " +
                                "cuadra con lo que has pedido.",
                            actionLabel = "Quitar filtros",
                            onAction = { vm.limpiarFiltros() },
                        )
                    }

                    else -> items(s.filtrados, key = { it.id }) { v ->
                        FilaVehiculo(
                            vehiculo = v,
                            personas = s.personas,
                            padronVacio = s.personas.isEmpty(),
                            onEditar = { vm.empezarEdicion(v) },
                            onBorrar = { vm.pedirBorrado(v) },
                        )
                    }
                }

                item { Spacer(Modifier.height(16.dp)) }
            }
        }
    }
}

@Composable
private fun Cabecera(s: IntegraVehiclesUiState, vm: IntegraVehiclesViewModel) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            NxSearchField(
                value = s.filtros.q,
                onValueChange = vm::setQuery,
                placeholder = "Placa o persona…",
                modifier = Modifier.weight(1f),
            )
            TextButton(onClick = { vm.abrirAlta() }) { Text("+ Alta") }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FiltroDueno.entries.forEach { f ->
                FilterChip(
                    selected = s.filtros.dueno == f,
                    onClick = { vm.setFiltroDueno(f) },
                    label = {
                        Text(
                            when (f) {
                                FiltroDueno.TODAS -> "Todas"
                                FiltroDueno.CON -> "Con dueño"
                                FiltroDueno.SIN -> "Sin dueño"
                            },
                        )
                    },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = NxColors.TealSoft,
                        selectedLabelColor = NxColors.Teal,
                    ),
                )
            }
        }

        Text(
            buildString {
                append("${s.filtrados.size} de ${s.items.size} placas")
                if (s.conFiltro) append(" tras filtrar")
                if (s.sinDueno > 0) append(" · ${s.sinDueno} sin dueño")
            },
            style = MaterialTheme.typography.bodySmall,
            color = NxColors.Muted,
        )

        s.errorPadron?.let { msg ->
            Text(
                "$msg — puedes ver y guardar placas, pero no asignar dueño hasta que " +
                    "cargue el padrón.",
                style = MaterialTheme.typography.labelSmall,
                color = NxColors.Warning,
            )
        }
    }
}

@Composable
private fun Aviso(texto: String) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = NxColors.WarningSoft),
    ) {
        Text(
            texto,
            modifier = Modifier.padding(12.dp),
            style = MaterialTheme.typography.bodySmall,
            color = NxColors.Slate,
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FilaVehiculo(
    vehiculo: Vehiculo,
    personas: List<PersonaResumen>,
    padronVacio: Boolean,
    onEditar: () -> Unit,
    onBorrar: () -> Unit,
) {
    val dueno = resolverDueno(vehiculo, personas)
    Card(
        onClick = onEditar,
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = NxColors.Card),
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    vehiculo.plate.ifBlank { "(sin placa)" },
                    style = MaterialTheme.typography.titleMedium.copy(
                        fontWeight = FontWeight.Bold,
                    ),
                    color = NxColors.Slate,
                )
                when (dueno) {
                    is Dueno.SinDueno -> NxStatusChip("Sin asignar", NxTone.Neutral)
                    is Dueno.Conocido -> NxStatusChip("Con dueño", NxTone.Success)
                    is Dueno.Ausente -> NxStatusChip("Dueño ausente", NxTone.Warning)
                }
            }

            when (dueno) {
                is Dueno.SinDueno -> Text(
                    "Sin persona asignada",
                    style = MaterialTheme.typography.bodySmall,
                    color = NxColors.Muted,
                )

                is Dueno.Conocido -> Text(
                    etiquetaPersona(dueno.persona),
                    style = MaterialTheme.typography.bodySmall,
                    color = NxColors.Slate,
                )

                is Dueno.Ausente -> Column {
                    Text(
                        dueno.nombre ?: dueno.id,
                        style = MaterialTheme.typography.bodySmall,
                        color = NxColors.Slate,
                    )
                    Text(
                        if (padronVacio) {
                            "El padrón no cargó: no se pudo comprobar."
                        } else {
                            "Ya no está en el padrón de personas del sitio."
                        },
                        style = MaterialTheme.typography.labelSmall,
                        color = NxColors.Warning,
                    )
                }
            }

            Text(
                "Identificador ${vehiculo.id}",
                style = MaterialTheme.typography.labelSmall,
                color = NxColors.Muted,
            )

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = onEditar, modifier = Modifier.weight(1f)) {
                    Text("Editar")
                }
                OutlinedButton(onClick = onBorrar, modifier = Modifier.weight(1f)) {
                    Text("Eliminar", color = NxColors.Danger)
                }
            }
        }
    }
}

@Composable
private fun FormularioPlaca(s: IntegraVehiclesUiState, vm: IntegraVehiclesViewModel) {
    val validacion = s.validacion
    val duplicado = s.duplicado
    val errorPlaca = if (s.tocado) validacion.error else null
    val errorDuplicado = duplicado?.let { avisoDuplicado(it) }

    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Text(
                if (s.editandoId != null) "Editar vehículo" else "Alta de placa",
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                color = NxColors.Slate,
            )
        }

        s.enEdicion?.let { v ->
            item {
                Text(
                    "Editando ${v.plate}",
                    style = MaterialTheme.typography.bodySmall,
                    color = NxColors.Muted,
                )
            }
        }

        item {
            NxFormTextField(
                value = s.placa,
                onValueChange = vm::setPlaca,
                label = "Placa (máx. ${PlacaLimites.MAX})",
                error = errorPlaca ?: errorDuplicado,
                imeAction = ImeAction.Done,
                onImeAction = { vm.marcarTocado(); vm.guardar() },
            )
        }

        item {
            val pista = when {
                errorPlaca != null || errorDuplicado != null -> null
                validacion.aviso != null -> validacion.aviso
                validacion.valida && validacion.normalizada != s.placa ->
                    "Se guardará como ${validacion.normalizada}"
                else -> "Letras, números, espacios y guiones. Se guarda en mayúsculas."
            }
            if (pista != null) {
                Text(
                    pista,
                    style = MaterialTheme.typography.labelSmall,
                    color = if (validacion.aviso != null) NxColors.Warning else NxColors.Muted,
                )
            }
        }

        item { SelectorPersona(s = s, vm = vm) }

        if (s.personas.isEmpty()) {
            item {
                Text(
                    if (s.errorPadron != null) {
                        "${s.errorPadron}: puedes guardar la placa, pero no asignarle dueño " +
                            "hasta que cargue el padrón."
                    } else {
                        "No hay personas dadas de alta en este sitio, así que no hay a quién " +
                            "asignar la placa."
                    },
                    style = MaterialTheme.typography.labelSmall,
                    color = NxColors.Muted,
                )
            }
        }

        s.mensaje?.let { msg ->
            item {
                Text(
                    msg,
                    style = MaterialTheme.typography.bodySmall,
                    color = if (s.mensajeEsError) NxColors.Danger else NxColors.Success,
                )
            }
        }

        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(
                    onClick = { vm.cancelarForm() },
                    enabled = !s.guardando,
                    modifier = Modifier.weight(1f),
                ) { Text("Cancelar") }
                Button(
                    onClick = { vm.marcarTocado(); vm.guardar() },
                    enabled = s.puedeGuardar,
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(containerColor = NxColors.Teal),
                ) {
                    Text(
                        when {
                            s.guardando -> "Guardando…"
                            s.editandoId != null -> "Guardar cambios"
                            else -> "Agregar placa"
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun SelectorPersona(s: IntegraVehiclesUiState, vm: IntegraVehiclesViewModel) {
    var abierto by remember { mutableStateOf(false) }
    val actual = s.personas.firstOrNull { it.id == s.personaId }
    val etiqueta = when {
        s.personaId.isBlank() -> "Sin asignar"
        actual != null -> etiquetaPersona(actual)
        // Se está editando una ficha cuyo dueño ya no está en el padrón: se dice.
        else -> "Persona ${s.personaId} (ya no está en el padrón)"
    }

    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(
            "Persona dueña",
            style = MaterialTheme.typography.labelMedium,
            color = NxColors.Muted,
        )
        Box {
            OutlinedButton(
                onClick = { abierto = true },
                enabled = s.personas.isNotEmpty() || s.personaId.isNotBlank(),
                modifier = Modifier.fillMaxWidth(),
            ) { Text(etiqueta) }

            DropdownMenu(
                expanded = abierto,
                onDismissRequest = { abierto = false },
                modifier = Modifier.heightIn(max = 360.dp),
            ) {
                DropdownMenuItem(
                    text = { Text("Sin asignar") },
                    onClick = { vm.setPersonaId(""); abierto = false },
                )
                s.personas.forEach { p ->
                    DropdownMenuItem(
                        text = { Text(etiquetaPersona(p)) },
                        onClick = { vm.setPersonaId(p.id); abierto = false },
                    )
                }
            }
        }
    }
}
