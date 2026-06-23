package mx.nexara.mobile.nativeapp.ui.modules

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.extra.ExtraRepository
import mx.nexara.mobile.nativeapp.ui.common.SimpleListScreen
import mx.nexara.mobile.nativeapp.ui.common.SimpleRow

/**
 * Estado genérico para las pantallas de módulos que listan datos planos.
 */
data class ModuleListUiState(
    val loading: Boolean = false,
    val rows: List<SimpleRow>? = null,
    val error: String? = null,
)

/**
 * ViewModel base: dispara un loader que devuelve filas ya mapeadas.
 */
class SimpleListViewModel : ViewModel() {
    private val _state = MutableStateFlow(ModuleListUiState())
    val state: StateFlow<ModuleListUiState> = _state

    private var loader: (suspend () -> List<SimpleRow>)? = null

    fun configure(loader: suspend () -> List<SimpleRow>) {
        this.loader = loader
    }

    fun load() {
        val fn = loader ?: return
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            try {
                val rows = withContext(Dispatchers.IO) { fn() }
                _state.update { it.copy(loading = false, rows = rows, error = null) }
            } catch (t: Throwable) {
                _state.update { it.copy(loading = false, error = t.message ?: "Error inesperado") }
            }
        }
    }
}

/**
 * Pantalla genérica: crea un VM, configura el loader y muestra SimpleListScreen.
 */
@Composable
fun GenericListModuleScreen(
    title: String,
    loader: suspend (ExtraRepository) -> List<SimpleRow>,
) {
    val context = LocalContext.current
    val repo = remember(context) { ExtraRepository(context) }
    val vm: SimpleListViewModel = viewModel()
    val state by vm.state.collectAsState()

    LaunchedEffect(Unit) {
        vm.configure { loader(repo) }
        vm.load()
    }

    SimpleListScreen(
        title = title,
        rows = state.rows,
        loading = state.loading,
        error = state.error,
        onRetry = { vm.load() },
    )
}
