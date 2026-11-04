package mx.nexara.mobile.nativeapp.ui.console.viaticos

import android.app.Application
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.api.TeamBoardOpenActivityDto
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.console.ConsoleRepository
import mx.nexara.mobile.nativeapp.data.console.CoreActivitiesRepository
import mx.nexara.mobile.nativeapp.data.viaticos.ViaticosRepository
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxFormTextField
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPrimaryButton
import mx.nexara.mobile.nativeapp.ui.enterprise.NxScreenScaffold
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader
import mx.nexara.mobile.nativeapp.ui.enterprise.NxUi

data class AsignarViaticoUiState(
    val personas: List<Pair<Long, String>> = emptyList(),
    val cargandoActividades: Boolean = false,
    val actividades: List<TeamBoardOpenActivityDto> = emptyList(),
    val enviando: Boolean = false,
    val error: String? = null,
)

class AsignarViaticoViewModel(app: Application) : AndroidViewModel(app) {
    private val usuarios = ConsoleRepository(app.applicationContext)
    private val tablero = CoreActivitiesRepository(app.applicationContext)
    private val viaticos = ViaticosRepository(app.applicationContext)

    private val _state = MutableStateFlow(AsignarViaticoUiState())
    val state: StateFlow<AsignarViaticoUiState> = _state

    init {
        viewModelScope.launch {
            try {
                val lista = withContext(Dispatchers.IO) { usuarios.usersFetch() }
                _state.update { s -> s.copy(personas = lista.map { it.id to it.nombre }.sortedBy { it.second }) }
            } catch (e: Throwable) {
                _state.update { it.copy(error = e.toUserMessage("No se pudo cargar al personal")) }
            }
        }
    }

    fun elegirPersona(id: Long) {
        _state.update { it.copy(cargandoActividades = true, actividades = emptyList(), error = null) }
        viewModelScope.launch {
            try {
                val abiertas = withContext(Dispatchers.IO) { tablero.boardUser(id) }.openActivities.orEmpty()
                _state.update { it.copy(cargandoActividades = false, actividades = abiertas) }
            } catch (e: Throwable) {
                _state.update { it.copy(cargandoActividades = false, error = e.toUserMessage("No se pudieron leer sus actividades")) }
            }
        }
    }

    fun asignar(personaId: Long, actividadId: Long, centavos: Long, categoria: String, motivo: String, onListo: () -> Unit) {
        if (_state.value.enviando) return
        _state.update { it.copy(enviando = true, error = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { viaticos.asignar(personaId, actividadId, centavos, categoria, motivo) }
                _state.update { it.copy(enviando = false) }
                onListo()
            } catch (e: Throwable) {
                _state.update { it.copy(enviando = false, error = e.toUserMessage("No se pudo asignar el viático")) }
            }
        }
    }
}

/** Dirección le asigna un viático a alguien, ligado a una de sus actividades abiertas. */
@Composable
fun AsignarViaticoScreen(onCreado: () -> Unit, vm: AsignarViaticoViewModel = viewModel()) {
    val state by vm.state.collectAsState()
    var consulta by remember { mutableStateOf("") }
    var personaId by remember { mutableStateOf<Long?>(null) }
    var actividadId by remember { mutableStateOf<Long?>(null) }
    var importe by remember { mutableStateOf("") }
    var categoria by remember { mutableStateOf(CATEGORIAS_VIATICO.first().first) }
    var motivo by remember { mutableStateOf("") }

    val centavos = Dinero.parsearCentavos(importe) ?: 0L
    val persona = state.personas.firstOrNull { it.first == personaId }
    val completo = AsignarViaticoRules.completo(personaId, actividadId, centavos, motivo)

    LaunchedEffect(personaId) {
        actividadId = null
        personaId?.let(vm::elegirPersona)
    }

    NxScreenScaffold {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            item(key = "quien") { NxSectionHeader(title = "¿A quién?") }
            if (persona != null) {
                item(key = "persona") {
                    FilterChip(
                        selected = true,
                        onClick = { personaId = null },
                        label = { Text(persona.second) },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            } else {
                item(key = "buscar") {
                    NxFormTextField(
                        value = consulta,
                        onValueChange = { consulta = it },
                        label = "Buscar persona",
                        singleLine = true,
                        imeAction = ImeAction.Search,
                    )
                }
                items(AsignarViaticoRules.filtrarPersonas(state.personas, consulta), key = { "p-${it.first}" }) { (id, nombre) ->
                    Text(
                        nombre,
                        fontSize = 15.sp,
                        color = NxColors.Slate,
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { personaId = id }
                            .padding(vertical = 10.dp),
                    )
                }
            }

            if (persona != null) {
                item(key = "actividad") { NxSectionHeader(title = "¿Para qué actividad?") }
                when {
                    state.cargandoActividades -> item(key = "cargando") {
                        Text("Buscando sus actividades…", fontSize = 13.sp, color = NxUi.Fg2)
                    }
                    state.actividades.isEmpty() -> item(key = "sin-actividades") {
                        Text(AsignarViaticoRules.avisoSinActividades(persona.second), fontSize = 13.sp, color = NxUi.Fg2)
                    }
                    else -> items(state.actividades, key = { "a-${it.id}" }) { a ->
                        FilterChip(
                            selected = a.id == actividadId,
                            onClick = { actividadId = a.id },
                            label = { Text(a.titulo?.trim()?.ifEmpty { null } ?: "Actividad ${a.id}") },
                            modifier = Modifier.fillMaxWidth().heightIn(min = 44.dp),
                        )
                    }
                }
                item(key = "importe") {
                    CampoImporte(
                        valor = importe,
                        onValorChange = { importe = it },
                        label = "¿Cuánto?",
                        enabled = !state.enviando,
                    )
                }
                item(key = "categoria") {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        NxSectionHeader(title = "¿En qué?")
                        CATEGORIAS_VIATICO.forEach { (clave, etiqueta) ->
                            FilterChip(
                                selected = categoria == clave,
                                onClick = { categoria = clave },
                                label = { Text(etiqueta) },
                                modifier = Modifier.fillMaxWidth().heightIn(min = 44.dp),
                            )
                        }
                    }
                }
                item(key = "motivo") {
                    NxFormTextField(
                        value = motivo,
                        onValueChange = { motivo = it },
                        label = "Concepto",
                        singleLine = false,
                        minLines = 2,
                        imeAction = ImeAction.Done,
                    )
                }
            }
            state.error?.let { e -> item(key = "error") { Text(e, fontSize = 13.sp, color = NxColors.Danger) } }
            if (persona != null) {
                item(key = "enviar") {
                    NxPrimaryButton(
                        text = "Asignar viático",
                        enabled = completo && !state.enviando,
                        loading = state.enviando,
                        onClick = {
                            val p = personaId
                            val a = actividadId
                            if (p != null && a != null) vm.asignar(p, a, centavos, categoria, motivo, onCreado)
                        },
                    )
                }
            }
        }
    }
}
