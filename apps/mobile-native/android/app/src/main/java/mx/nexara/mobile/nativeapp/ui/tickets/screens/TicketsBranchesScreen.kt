package mx.nexara.mobile.nativeapp.ui.tickets.screens



import android.app.Application

import androidx.compose.foundation.background

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

import androidx.compose.material3.ExperimentalMaterial3Api

import androidx.compose.material3.MaterialTheme

import androidx.compose.material3.OutlinedButton

import androidx.compose.material3.Text

import androidx.compose.material3.pulltorefresh.PullToRefreshBox

import androidx.compose.runtime.Composable

import androidx.compose.runtime.collectAsState

import androidx.compose.runtime.getValue

import androidx.compose.ui.Modifier

import androidx.compose.ui.text.font.FontWeight

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

import mx.nexara.mobile.nativeapp.data.api.ClientBranchDto

import mx.nexara.mobile.nativeapp.data.realtime.refreshOnModels

import mx.nexara.mobile.nativeapp.data.tickets.TicketsRepository

import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors

import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState

import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock

import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock

import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell

import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip

import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone



data class TicketsBranchesUiState(

    val isLoading: Boolean = true,

    val isRefreshing: Boolean = false,

    val error: String? = null,

    val branches: List<ClientBranchDto> = emptyList(),

)



class TicketsBranchesViewModel(app: Application) : AndroidViewModel(app) {

    private val repo = TicketsRepository(app.applicationContext)

    private val _state = MutableStateFlow(TicketsBranchesUiState())

    val state: StateFlow<TicketsBranchesUiState> = _state



    init {

        refresh(initial = true)

        refreshOnModels(

            models = setOf("ServiceClientBranch", "ServiceClient"),

            refresh = { refresh(initial = false) },

        )

    }



    fun refresh(initial: Boolean = false) {

        _state.update {

            if (initial) it.copy(isLoading = true, error = null)

            else it.copy(isRefreshing = true, error = null)

        }

        viewModelScope.launch {

            try {

                val branches = withContext(Dispatchers.IO) { repo.branches() }

                _state.update { it.copy(isLoading = false, isRefreshing = false, branches = branches, error = null) }

            } catch (e: Exception) {

                _state.update {

                    it.copy(

                        isLoading = false,

                        isRefreshing = false,

                        error = e.message?.takeIf { m -> m.isNotBlank() } ?: "No se pudieron cargar sucursales",

                    )

                }

            }

        }

    }

}



@OptIn(ExperimentalMaterial3Api::class)

@Composable

fun TicketsBranchesScreen(

    onBack: () -> Unit,

    onCreate: () -> Unit,

    onEdit: (Long) -> Unit,

    modifier: Modifier = Modifier,

) {

    val vm: TicketsBranchesViewModel = viewModel()

    val state by vm.state.collectAsState()



    Column(modifier = modifier.fillMaxSize()) {

        Row(

            horizontalArrangement = Arrangement.spacedBy(8.dp),

            modifier = Modifier

                .fillMaxWidth()

                .padding(horizontal = 16.dp, vertical = 16.dp),

        ) {

            OutlinedButton(onClick = onBack, modifier = Modifier.weight(1f)) { Text("Volver") }

            OutlinedButton(onClick = { vm.refresh(initial = false) }, modifier = Modifier.weight(1f)) { Text("Actualizar") }

            Button(onClick = onCreate, modifier = Modifier.weight(1f)) { Text("+ Nueva") }

        }



        if (state.isLoading) {

            NxLoadingBlock("Cargando sucursales…")

            return@Column

        }



        PullToRefreshBox(

            isRefreshing = state.isRefreshing,

            onRefresh = { vm.refresh(initial = false) },

            modifier = Modifier.fillMaxSize(),

        ) {

            LazyColumn(

                modifier = Modifier

                    .fillMaxSize()

                    .background(NxColors.Surface)

                    .padding(horizontal = 16.dp),

                verticalArrangement = Arrangement.spacedBy(10.dp),

            ) {

                item {

                    Text("Mis sucursales", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)

                    Text(

                        "Administra ubicaciones y accesos del portal",

                        style = MaterialTheme.typography.bodySmall,

                        color = MaterialTheme.colorScheme.onSurfaceVariant,

                    )

                }



                if (!state.error.isNullOrBlank()) {

                    item {

                        NxErrorBlock(state.error!!) { vm.refresh(initial = true) }

                    }

                }



                if (state.branches.isEmpty() && state.error.isNullOrBlank()) {

                    item {

                        NxEmptyState(

                            title = "Sin sucursales",

                            subtitle = "Registra tu primera sucursal para habilitar el portal por ubicación.",

                            actionLabel = "+ Nueva sucursal",

                            onAction = onCreate,

                        )

                    }

                } else {

                    items(state.branches, key = { it.id }) { b ->

                        NxPanelShell(contentPadding = PaddingValues(12.dp)) {

                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {

                                Text(b.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))

                                val active = b.isActive

                                if (active != null) {

                                    NxStatusChip(

                                        if (active) "Activa" else "Inactiva",

                                        if (active) NxTone.Success else NxTone.Neutral,

                                    )

                                }

                            }

                            val meta = buildList {

                                b.branchNumber?.takeIf { it.isNotBlank() }?.let { add("Sucursal: $it") }

                                b.city?.takeIf { it.isNotBlank() }?.let { c ->

                                    val st = b.state?.takeIf { it.isNotBlank() }

                                    add(if (st != null) "$c, $st" else c)

                                }

                                b.address?.takeIf { it.isNotBlank() }?.let { add(it) }

                            }.joinToString(" · ")

                            if (meta.isNotBlank()) {

                                Text(meta, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)

                            }

                            Spacer(Modifier.height(4.dp))

                            OutlinedButton(onClick = { onEdit(b.id) }) { Text("Editar") }

                        }

                    }

                }



                item { Spacer(Modifier.height(8.dp)) }

            }

        }

    }

}


