package mx.nexara.mobile.nativeapp.ui.console.more

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import mx.nexara.mobile.nativeapp.ui.console.activities.PersonAvatar
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSearchField
import mx.nexara.mobile.nativeapp.ui.enterprise.NxScreenScaffold
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSkeletonList
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone

/**
 * Organigrama (`/erp/organigrama`) en el teléfono.
 *
 * **Por qué no es el árbol de la web.** La web dibuja un lienzo con zoom y
 * líneas entre cajas. Eso necesita ancho: para ver tres niveles de NEXARA en
 * 375 px hay que alejar hasta que los nombres quedan en seis puntos, y entonces
 * el dibujo ya no dice quién reporta a quién — dice que hay muchas cajas. Con la
 * letra grande del sistema es todavía peor.
 *
 * **Lo que se hizo.** Se recorre como un explorador de carpetas: una persona a
 * la vez, con su equipo directo debajo en renglones de ancho completo, migas de
 * pan hasta la dirección para subir de un toque, y el botón de atrás del
 * teléfono subiendo un escalón en vez de cerrar la pantalla. Arriba, una
 * búsqueda sobre TODO el organigrama que enseña la cadena de mando de cada
 * resultado y salta a esa persona.
 *
 * **Qué se pierde y qué se gana.** Se pierde la foto completa de un vistazo, que
 * en un palmo de pantalla no existía. Se gana que cada renglón se lee, que hay
 * dónde poner el dedo, y las dos cosas que el lienzo hace mal: buscar, y saber
 * cuánta gente cuelga de alguien sin contarla a ojo.
 *
 * El recorrido y la búsqueda viven en [OrgchartRules], que se prueba sin Android.
 */
@Composable
fun OrgchartScreen(vm: OrgchartViewModel = viewModel()) {
    val state by vm.state.collectAsState()
    val focoId by vm.foco.collectAsState()
    val consulta by vm.consulta.collectAsState()

    LaunchedEffect(Unit) { vm.arrancar() }

    val indice = remember(state.datos) { OrgchartRules.construir(state.datos) }
    val vista = remember(indice, focoId) { OrgchartRules.vista(indice, focoId) }
    val resultados = remember(indice, consulta) { OrgchartRules.buscar(indice, consulta) }
    val buscando = consulta.isNotBlank()

    // El botón de atrás del teléfono sube un escalón mientras haya de dónde
    // subir; solo al llegar a la cúpula cierra la pantalla, como se espera.
    BackHandler(enabled = focoId != null || buscando) {
        if (buscando) vm.buscar("") else vm.subir(indice)
    }

    NxScreenScaffold(isRefreshing = state.refrescando, onRefresh = vm::refrescar) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            item(key = "buscar") {
                NxSearchField(
                    value = consulta,
                    onValueChange = vm::buscar,
                    placeholder = "Buscar por nombre, puesto o área",
                    enabled = !indice.vacio,
                )
            }

            state.avisoRefresco?.let { aviso ->
                item(key = "aviso") { MoreAvisoDesactualizado(aviso, onCerrar = vm::descartarAviso) }
            }

            if (state.cargando && !state.hayDatos) {
                item(key = "esqueleto") { NxSkeletonList(itemCount = 6, itemHeight = 68.dp) }
            }

            state.error?.takeIf { !state.hayDatos }?.let { error ->
                item(key = "error") { NxErrorBlock(error, onRetry = vm::reintentar) }
            }

            if (state.hayDatos && indice.vacio) {
                item(key = "vacio-total") {
                    NxEmptyState(
                        title = "El organigrama está vacío",
                        subtitle = "Todavía nadie tiene jefe asignado en esta empresa.",
                    )
                }
            }

            if (buscando) {
                item(key = "cabecera-busqueda") {
                    MoreCabecera(
                        titulo = "Resultados",
                        subtitulo = "En todo el organigrama, no solo en este nivel",
                        trailing = "${resultados.size}",
                    )
                }
                if (resultados.isEmpty()) {
                    item(key = "sin-resultados") {
                        NxEmptyState(
                            title = "Sin coincidencias",
                            subtitle = "Nadie del organigrama coincide con «$consulta».",
                            actionLabel = "Limpiar búsqueda",
                            onAction = { vm.buscar("") },
                        )
                    }
                } else {
                    items(resultados, key = { it.id }) { persona ->
                        FilaDePersona(
                            persona = persona,
                            // En la búsqueda, lo que sitúa a alguien es su cadena
                            // de mando, no cuánta gente tiene.
                            subtitulo = OrgchartRules.cadenaTexto(indice, persona),
                            onClick = { vm.enfocar(persona.id) },
                        )
                    }
                }
            } else if (!indice.vacio) {
                item(key = "migas") {
                    Migas(
                        migas = vista.migas,
                        foco = vista.foco,
                        onInicio = { vm.enfocar(null) },
                        onIr = { id -> vm.enfocar(id) },
                    )
                }

                vista.foco?.let { foco ->
                    item(key = "foco") {
                        FichaDelFoco(
                            persona = foco,
                            indice = indice,
                            laterales = vista.laterales,
                            onSubir = { vm.subir(indice) },
                        )
                    }
                }

                item(key = "cabecera-equipo") {
                    MoreCabecera(
                        titulo = if (vista.foco == null) "Dirección" else "Le reportan directo",
                        subtitulo = if (vista.foco == null) "Arriba del todo del organigrama" else null,
                        trailing = if (vista.equipo.isEmpty()) null else "${vista.equipo.size}",
                    )
                }

                if (vista.sinEquipo) {
                    item(key = "sin-equipo") {
                        NxEmptyState(
                            title = "Sin gente a su cargo",
                            subtitle = "${vista.foco?.nombre ?: "Esta persona"} no tiene a nadie reportándole.",
                            actionLabel = "Subir un nivel",
                            onAction = { vm.subir(indice) },
                        )
                    }
                } else {
                    items(vista.equipo, key = { it.id }) { persona ->
                        FilaDePersona(
                            persona = persona,
                            subtitulo = OrgchartRules.equipoTexto(persona),
                            onClick = { if (!persona.esHoja) vm.enfocar(persona.id) },
                            // Sin equipo no hay a dónde bajar: la fila se queda quieta.
                            navegable = !persona.esHoja,
                        )
                    }
                }
            }

            if (!indice.vacio) {
                item(key = "total") {
                    Text(
                        "${indice.total} personas en el organigrama",
                        style = MaterialTheme.typography.labelSmall,
                        color = NxColors.Muted,
                        modifier = Modifier.padding(horizontal = 4.dp),
                    )
                }
            }

            item(key = "alcance") { MoreNotaDeAlcance(OrgchartRules.LIMITE) }
        }
    }
}

/**
 * Las migas: «Todos › Christian › Ana». Se desplazan en horizontal porque una
 * cadena de cinco niveles no cabe, y cortar el principio dejaría sin salida.
 */
@Composable
private fun Migas(
    migas: List<OrgchartRules.Persona>,
    foco: OrgchartRules.Persona?,
    onInicio: () -> Unit,
    onIr: (Long) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        TextButton(onClick = onInicio) {
            Text(
                "Todos",
                style = MaterialTheme.typography.labelLarge,
                color = if (foco == null) NxColors.Brand else NxColors.Muted,
                fontWeight = if (foco == null) FontWeight.Bold else FontWeight.Normal,
            )
        }
        migas.forEach { persona ->
            Text("›", color = NxColors.Muted, style = MaterialTheme.typography.labelLarge)
            TextButton(onClick = { onIr(persona.id) }) {
                Text(
                    persona.nombre,
                    style = MaterialTheme.typography.labelLarge,
                    color = NxColors.Muted,
                    maxLines = 1,
                )
            }
        }
        foco?.let {
            Text("›", color = NxColors.Muted, style = MaterialTheme.typography.labelLarge)
            TextButton(onClick = {}, enabled = false) {
                Text(
                    it.nombre,
                    style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold),
                    color = NxColors.Brand,
                    maxLines = 1,
                )
            }
        }
    }
}

/** La persona que se está viendo: quién es, cuánta gente lleva y de quién depende. */
@Composable
private fun FichaDelFoco(
    persona: OrgchartRules.Persona,
    indice: OrgchartRules.Indice,
    laterales: List<OrgchartRules.Persona>,
    onSubir: () -> Unit,
) {
    val jefe = indice[persona.cadena.lastOrNull()]
    MoreTarjeta {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            PersonAvatar(persona.nombre, persona.avatarUrl, 56.dp)
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    persona.nombre,
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                    color = NxColors.Slate,
                )
                persona.puesto?.let {
                    Text(it, style = MaterialTheme.typography.bodySmall, color = NxColors.Muted)
                }
                Text(
                    OrgchartRules.equipoTexto(persona),
                    style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold),
                    color = NxColors.Brand,
                )
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
            persona.rol?.let { NxStatusChip(it, NxTone.Info) }
            persona.departamento?.let { NxStatusChip(it, NxTone.Neutral) }
        }

        if (laterales.isNotEmpty()) {
            Text(
                "Al lado: ${laterales.joinToString(", ") { it.nombre }}",
                style = MaterialTheme.typography.labelSmall,
                color = NxColors.Muted,
            )
        }

        if (jefe != null) {
            AssistChip(
                onClick = onSubir,
                label = { Text("Reporta a ${jefe.nombre}") },
                leadingIcon = {
                    Icon(Icons.Default.ArrowUpward, contentDescription = null, modifier = Modifier.size(16.dp))
                },
                colors = AssistChipDefaults.assistChipColors(labelColor = NxColors.Brand, leadingIconContentColor = NxColors.Brand),
            )
        } else {
            Text(
                "Arriba del todo del organigrama",
                style = MaterialTheme.typography.labelSmall,
                color = NxColors.Muted,
            )
        }
    }
}

/**
 * Un renglón de persona, de ancho completo. La flecha solo aparece si hay a
 * dónde bajar: una flecha que no lleva a ningún sitio es una promesa rota.
 */
@Composable
private fun FilaDePersona(
    persona: OrgchartRules.Persona,
    subtitulo: String,
    onClick: () -> Unit,
    navegable: Boolean = true,
) {
    MoreTarjeta(onClick = if (navegable) onClick else null) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            PersonAvatar(persona.nombre, persona.avatarUrl, 44.dp)
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    persona.nombre,
                    style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold),
                    color = NxColors.Slate,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                persona.puesto?.let {
                    Text(
                        it,
                        style = MaterialTheme.typography.bodySmall,
                        color = NxColors.Muted,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Text(subtitulo, style = MaterialTheme.typography.labelSmall, color = NxColors.Muted, maxLines = 2)
            }
            if (navegable) {
                Icon(
                    Icons.AutoMirrored.Filled.KeyboardArrowRight,
                    contentDescription = "Ver el equipo de ${persona.nombre}",
                    tint = NxColors.Brand,
                    modifier = Modifier.size(24.dp),
                )
            } else {
                Icon(
                    Icons.Default.Groups,
                    contentDescription = null,
                    tint = NxColors.Muted.copy(alpha = 0.4f),
                    modifier = Modifier.size(18.dp),
                )
            }
        }
    }
}
