package mx.nexara.mobile.nativeapp.ui.console.viaticos

import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.Badge
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import mx.nexara.mobile.nativeapp.data.api.ViaticoDto
import mx.nexara.mobile.nativeapp.ui.enterprise.NxAlert
import mx.nexara.mobile.nativeapp.ui.enterprise.NxAlertBanner
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell
import mx.nexara.mobile.nativeapp.ui.enterprise.NxScreenScaffold
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSkeletonList
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSnackbarHost
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone
import mx.nexara.mobile.nativeapp.ui.enterprise.rememberNxSnackbarHostState

/**
 * «Mis viáticos»: qué pedí, en qué va y cuánto queda del anticipo. Quien
 * autoriza tiene además la pestaña de su gente, con los que esperan decisión.
 *
 * Un fallo de red se enseña como aviso **encima** de la lista, nunca en su
 * lugar: el técnico que abre esto en un sótano sigue viendo lo último bueno.
 */
@Composable
fun ViaticosScreen(
    onAbrirViatico: (Long) -> Unit,
    onNuevoViatico: () -> Unit,
    /** Se pone a true al volver del alta, para releer del servidor. */
    recargar: Boolean = false,
    onRecargaConsumida: () -> Unit = {},
) {
    val vm: ViaticosViewModel = viewModel()
    val state by vm.state.collectAsState()
    val snackbar = rememberNxSnackbarHostState()
    var pestana by remember { mutableIntStateOf(0) }

    LaunchedEffect(recargar) {
        if (recargar) {
            vm.cargar(refresh = true)
            onRecargaConsumida()
        }
    }

    LaunchedEffect(state.mensaje) {
        val msg = state.mensaje ?: return@LaunchedEffect
        vm.limpiarMensaje()
        snackbar.showSnackbar(msg)
    }

    val hayEquipo = state.puedeAutorizar && state.delEquipo.isNotEmpty()
    val lista = if (hayEquipo && pestana == 1) state.delEquipo else state.mios

    NxScreenScaffold(isRefreshing = state.refreshing, onRefresh = { vm.cargar(refresh = true) }) {
        Column(Modifier.fillMaxSize()) {
            if (hayEquipo) {
                TabRow(selectedTabIndex = pestana, containerColor = Color.White) {
                    Tab(
                        selected = pestana == 0,
                        onClick = { pestana = 0 },
                        modifier = Modifier.heightIn(min = AlturaToque),
                        text = { Text("Míos") },
                    )
                    Tab(
                        selected = pestana == 1,
                        onClick = { pestana = 1 },
                        modifier = Modifier.heightIn(min = AlturaToque),
                        text = {
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text("Del equipo")
                                if (state.porAutorizar > 0) {
                                    Badge { Text("${state.porAutorizar}") }
                                }
                            }
                        },
                    )
                }
            }

            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 96.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                state.error?.let { msg ->
                    item {
                        NxAlertBanner(
                            NxAlert(
                                id = "viaticos-error",
                                title = msg,
                                subtitle = if (state.vacio) null else "Abajo sigue lo último que se pudo leer.",
                                tone = NxTone.Danger,
                                actionLabel = "Reintentar",
                                onAction = { vm.cargar(refresh = true) },
                            ),
                        )
                    }
                }

                if (state.loading && state.vacio) {
                    item { NxSkeletonList(itemCount = 4, itemHeight = 96.dp) }
                }

                items(lista, key = { it.id }) { viatico ->
                    TarjetaViatico(
                        viatico = viatico,
                        mostrarPersona = hayEquipo && pestana == 1,
                        onClick = { onAbrirViatico(viatico.id) },
                    )
                }

                if (!state.loading && lista.isEmpty()) {
                    item {
                        if (hayEquipo && pestana == 1) {
                            NxEmptyState(
                                title = "Nada por autorizar",
                                subtitle = "Tu equipo no tiene viáticos esperando decisión.",
                            )
                        } else {
                            NxEmptyState(
                                title = "Todavía no pides viáticos",
                                subtitle = "Pon la gasolina, toma la foto del ticket y pídelo aquí mismo. " +
                                    "No hace falta esperar a llegar a una computadora.",
                                actionLabel = "Pedir un viático",
                                onAction = onNuevoViatico,
                            )
                        }
                    }
                }

                item { Spacer(Modifier.height(8.dp)) }
            }
        }

        // Pedir es la acción de esta pantalla: siempre a la mano del pulgar.
        //
        // Salvo cuando la lista está vacía y el propio estado vacío ya ofrece el
        // mismo botón: ahí eran dos primarios a la vez para una sola acción
        // (regla 4), uno encima del otro y con distinta etiqueta —«Pedir un
        // viático» y «Pedir viático»— como si fueran cosas distintas.
        val vacioYaInvita = !state.loading && lista.isEmpty() && !(hayEquipo && pestana == 1)
        if (!vacioYaInvita) {
            ExtendedFloatingActionButton(
                onClick = onNuevoViatico,
                icon = { Icon(Icons.Default.Add, contentDescription = null) },
                text = { Text("Pedir viático", fontWeight = FontWeight.SemiBold) },
                containerColor = NxColors.Brand,
                contentColor = Color.White,
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(16.dp)
                    .heightIn(min = 56.dp),
            )
        }

        NxSnackbarHost(
            snackbar,
            modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 72.dp),
        )
    }
}

/**
 * Un viático en la lista: la cifra manda, el estado la acompaña.
 *
 * Toda la tarjeta es un solo objetivo de toque y se lee de una sola vez con
 * lector de pantalla; los chips sueltos sonarían a lista de palabras.
 */
@Composable
private fun TarjetaViatico(
    viatico: ViaticoDto,
    mostrarPersona: Boolean,
    onClick: () -> Unit,
) {
    val solicitado = Dinero.deApi(viatico.montoSolicitado)
    val vigente = Dinero.deApi(viatico.montoVigente())
    val recortado = viatico.montoAprobado != null && vigente != solicitado
    val titulo = viatico.motivo?.trim()?.takeIf { it.isNotEmpty() }
        ?: etiquetaCategoria(viatico.categoria)
    val persona = viatico.usuario?.nombre?.trim().orEmpty()
    val fecha = viatico.fechaSolicitud?.take(10).orEmpty()
    val actividad = viatico.actividad?.anNumber?.trim().orEmpty()

    val descripcion = buildString {
        if (mostrarPersona && persona.isNotEmpty()) append("$persona. ")
        append("$titulo. ")
        append("${Dinero.pesos(vigente)}. ")
        append("${viatico.estatus ?: "sin estado"}. ")
        resumenLiquidacion(viatico.liquidacion)?.let { append("${it.first}. ") }
    }

    NxPanelShell(
        onClick = onClick,
        modifier = Modifier.heightIn(min = AlturaToque).clearAndSetSemantics {
            contentDescription = descripcion
        },
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.Top,
            ) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    if (mostrarPersona && persona.isNotEmpty()) {
                        Text(
                            persona,
                            style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold),
                            color = NxColors.Brand,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    Text(
                        titulo,
                        style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold),
                        color = NxColors.Slate,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        listOf(etiquetaCategoria(viatico.categoria), fecha, actividad)
                            .filter { it.isNotBlank() }
                            .joinToString(" · "),
                        style = MaterialTheme.typography.labelMedium,
                        color = NxColors.Muted,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        Dinero.pesos(vigente),
                        style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold),
                        color = NxColors.Slate,
                        maxLines = 1,
                    )
                    if (recortado) {
                        // El jefe recortó la cifra: se dice, no se esconde.
                        Text(
                            "pediste ${Dinero.pesos(solicitado)}",
                            style = MaterialTheme.typography.labelSmall,
                            color = NxColors.Muted,
                        )
                    }
                }
            }
            ChipsDeViatico(viatico)
        }
    }
}
