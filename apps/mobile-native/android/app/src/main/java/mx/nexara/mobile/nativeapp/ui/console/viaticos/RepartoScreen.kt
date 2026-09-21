package mx.nexara.mobile.nativeapp.ui.console.viaticos

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import mx.nexara.mobile.nativeapp.ui.enterprise.NxAlert
import mx.nexara.mobile.nativeapp.ui.enterprise.NxAlertBanner
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell
import mx.nexara.mobile.nativeapp.ui.enterprise.NxScreenScaffold
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone

/** Una fila de la pantalla: la actividad y lo que se le carga, tal como se teclea. */
private data class FilaReparto(
    val actividadId: Long,
    val etiqueta: String,
    /** Texto crudo del campo de importe (dígitos y a lo sumo un punto). */
    val texto: String,
)

/**
 * Repartir un viático entre varias actividades.
 *
 * Un mismo viaje cubre dos servicios de clientes distintos y la gasolina es una
 * sola: sin esto, el costo entero cae sobre una actividad, un proyecto paga de
 * más y el otro de menos, y el P&L miente sin que nada avise.
 *
 * **El cuadre manda**: la suma tiene que ser exactamente el total, al centavo.
 * La pantalla no pelea con eso, ayuda a lograrlo — enseña en vivo cuánto falta
 * o sobra y ofrece acomodar el resto de un toque. Todo se cuenta en centavos
 * enteros ([RepartoViatico]), igual que el servidor.
 *
 * El total es el **monto solicitado**, no el autorizado: es contra ése que
 * `setReparto` valida del otro lado. Si el jefe recortó la cifra, el reparto
 * sigue siendo del costo que se pidió.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RepartoViaticoScreen(
    viaticoId: Long,
    onListo: () -> Unit,
) {
    val vm: ViaticoDetalleViewModel = viewModel()
    val state by vm.state.collectAsState()
    val filas = remember { mutableStateListOf<FilaReparto>() }
    var precargado by remember { mutableStateOf(false) }
    var agregando by remember { mutableStateOf(false) }

    LaunchedEffect(viaticoId) {
        vm.cargar(viaticoId)
        vm.cargarActividades()
    }

    val viatico = state.viatico

    // Se precarga una sola vez: un refresco en segundo plano no puede borrar lo
    // que la persona lleva tecleado.
    LaunchedEffect(viatico?.id) {
        val v = viatico ?: return@LaunchedEffect
        if (precargado) return@LaunchedEffect
        precargado = true
        val existentes = v.repartos.orEmpty().mapNotNull { parte ->
            val id = parte.actividadId ?: return@mapNotNull null
            FilaReparto(
                actividadId = id,
                etiqueta = parte.actividad?.let { a ->
                    listOfNotNull(a.anNumber, a.titulo).firstOrNull { it.isNotBlank() }
                } ?: "Actividad #$id",
                texto = Dinero.formatear(Dinero.deApi(parte.monto)).replace(",", ""),
            )
        }
        filas.addAll(existentes)
        if (existentes.isEmpty()) {
            // Sin reparto previo: se arranca con la actividad del viático y el
            // total encima, que es el punto de partida real de cualquier reparto.
            val propia = v.actividadId ?: v.actividad?.id
            if (propia != null && propia > 0L) {
                filas.add(
                    FilaReparto(
                        actividadId = propia,
                        etiqueta = v.actividad?.anNumber?.takeIf { it.isNotBlank() }
                            ?: "Actividad #$propia",
                        texto = Dinero.formatear(Dinero.deApi(v.montoSolicitado)).replace(",", ""),
                    ),
                )
            }
        }
    }

    val totalCentavos = Dinero.deApi(viatico?.montoSolicitado)
    val partes = filas.map {
        ParteReparto(actividadId = it.actividadId, centavos = Dinero.parsearCentavos(it.texto) ?: 0L)
    }
    val sumaCentavos = partes.sumOf { it.centavos }
    val cuadre = RepartoViatico.revisar(partes, totalCentavos)
    val aviso = RepartoViatico.mensaje(cuadre)

    fun aplicar(nuevos: List<ParteReparto>) {
        nuevos.forEachIndexed { i, parte ->
            filas[i] = filas[i].copy(texto = Dinero.formatear(parte.centavos).replace(",", ""))
        }
    }

    NxScreenScaffold {
        Column(Modifier.fillMaxSize()) {
            LazyColumn(
                modifier = Modifier.weight(1f),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                state.error?.let { msg ->
                    item {
                        NxAlertBanner(
                            NxAlert(
                                id = "reparto-error",
                                title = msg,
                                tone = NxTone.Danger,
                                actionLabel = "Reintentar",
                                onAction = { vm.cargar(viaticoId, refresh = true) },
                            ),
                        )
                    }
                }

                if (viatico == null) {
                    if (state.loading) item { NxLoadingBlock("Abriendo el viático…") }
                    return@LazyColumn
                }

                item { Marcador(totalCentavos = totalCentavos, sumaCentavos = sumaCentavos, cuadre = cuadre) }

                items(filas, key = { it.actividadId }) { fila ->
                    val indice = filas.indexOfFirst { it.actividadId == fila.actividadId }
                    FilaDeReparto(
                        fila = fila,
                        habilitado = !state.enviando,
                        onTexto = { texto ->
                            if (indice >= 0) filas[indice] = fila.copy(texto = texto)
                        },
                        onQuitar = { if (indice >= 0) filas.removeAt(indice) },
                    )
                }

                item {
                    OutlinedButton(
                        onClick = { agregando = true },
                        enabled = !state.enviando && filas.size < RepartoViatico.MAX_PARTES,
                        modifier = Modifier.fillMaxWidth().heightIn(min = AlturaToque),
                    ) {
                        Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.size(8.dp))
                        Text("Agregar actividad")
                    }
                }

                if (filas.size >= 2) {
                    item {
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            OutlinedButton(
                                onClick = {
                                    val trozos = RepartoViatico
                                        .repartirEnPartesIguales(totalCentavos, filas.size)
                                    aplicar(
                                        filas.mapIndexed { i, f ->
                                            ParteReparto(f.actividadId, trozos.getOrElse(i) { 0L })
                                        },
                                    )
                                },
                                enabled = !state.enviando && totalCentavos > 0L,
                                modifier = Modifier.weight(1f).heightIn(min = AlturaToque),
                            ) { Text("Partes iguales") }
                            Button(
                                onClick = { aplicar(RepartoViatico.cuadrarResto(partes, totalCentavos)) },
                                enabled = !state.enviando && totalCentavos > 0L && sumaCentavos != totalCentavos,
                                colors = ButtonDefaults.buttonColors(containerColor = NxColors.Brand),
                                modifier = Modifier.weight(1f).heightIn(min = AlturaToque),
                            ) {
                                Text(
                                    when (cuadre) {
                                        is CuadreReparto.Sobra -> "Quitar lo que sobra"
                                        else -> "Repartir el resto"
                                    },
                                )
                            }
                        }
                    }
                }

                if (!viatico.repartos.isNullOrEmpty()) {
                    item {
                        TextButton(
                            onClick = { vm.guardarReparto(emptyList(), onListo) },
                            enabled = !state.enviando,
                            modifier = Modifier.fillMaxWidth().heightIn(min = AlturaToque),
                        ) { Text("Quitar el reparto", color = NxColors.Danger) }
                    }
                }

                state.accionError?.let { msg ->
                    item { NxErrorBlock(msg) }
                }

                item { Spacer(Modifier.height(8.dp)) }
            }

            // El botón vive abajo, fijo: con una mano y el teclado abierto no se
            // puede exigir que alguien baje a buscarlo.
            if (viatico != null) {
                HorizontalDivider()
                Column(Modifier.background(Color.White).padding(16.dp)) {
                    if (aviso != null) {
                        Text(
                            aviso,
                            style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
                            color = if (cuadre is CuadreReparto.Falta) NxColors.Warning else NxColors.Danger,
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(bottom = 10.dp)
                                // Que el lector de pantalla cante el desfase al
                                // momento; si no, se teclea a ciegas.
                                .semantics { liveRegion = LiveRegionMode.Polite },
                        )
                    }
                    Button(
                        onClick = { vm.guardarReparto(partes, onListo) },
                        enabled = !state.enviando && cuadre.puedeGuardarse && filas.isNotEmpty(),
                        colors = ButtonDefaults.buttonColors(containerColor = NxColors.Brand),
                        modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp),
                    ) {
                        if (state.enviando) {
                            CircularProgressIndicator(
                                color = Color.White,
                                strokeWidth = 2.dp,
                                modifier = Modifier.size(20.dp),
                            )
                        } else {
                            Text("Guardar reparto", fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }
    }

    if (agregando) {
        val yaPuestas = filas.map { it.actividadId }.toSet()
        val candidatas = state.actividades.filter { it.id !in yaPuestas }
        ModalBottomSheet(onDismissRequest = { agregando = false }) {
            Column(Modifier.fillMaxWidth().padding(bottom = 24.dp)) {
                Text(
                    "¿Qué actividad cubrió el viaje?",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(horizontal = 24.dp, vertical = 10.dp),
                )
                HorizontalDivider()
                if (candidatas.isEmpty()) {
                    Text(
                        if (state.cargandoActividades) {
                            "Buscando tus actividades…"
                        } else {
                            "No te quedan actividades abiertas por agregar."
                        },
                        style = MaterialTheme.typography.bodyMedium,
                        color = NxColors.Muted,
                        modifier = Modifier.padding(24.dp),
                    )
                } else {
                    LazyColumn(Modifier.heightIn(max = 420.dp)) {
                        items(candidatas, key = { it.id }) { item ->
                            TextButton(
                                onClick = {
                                    filas.add(
                                        FilaReparto(
                                            actividadId = item.id,
                                            etiqueta = listOfNotNull(item.anNumber, item.titulo)
                                                .firstOrNull { it.isNotBlank() }
                                                ?: "Actividad #${item.id}",
                                            // Entra vacía a propósito: «repartir el
                                            // resto» sabe darle lo que falta.
                                            texto = "",
                                        ),
                                    )
                                    agregando = false
                                },
                                modifier = Modifier.fillMaxWidth().heightIn(min = AlturaToque),
                            ) {
                                Column(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp)) {
                                    Text(
                                        item.titulo?.takeIf { it.isNotBlank() } ?: "Actividad #${item.id}",
                                        style = MaterialTheme.typography.bodyLarge,
                                        color = NxColors.Slate,
                                        maxLines = 2,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                    Text(
                                        listOfNotNull(item.anNumber, item.cliente)
                                            .filter { it.isNotBlank() }
                                            .joinToString(" · "),
                                        style = MaterialTheme.typography.labelMedium,
                                        color = NxColors.Muted,
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

/**
 * El marcador: total, repartido y lo que falta o sobra, en vivo.
 *
 * Es lo primero que se ve y lo único que hay que mirar mientras se teclea: el
 * color cambia a verde en cuanto cuadra, sin tener que interpretar cifras.
 */
@Composable
private fun Marcador(totalCentavos: Long, sumaCentavos: Long, cuadre: CuadreReparto) {
    val diferencia = totalCentavos - sumaCentavos
    val tono = when {
        cuadre is CuadreReparto.Cuadra -> NxColors.Success
        diferencia > 0L -> NxColors.Warning
        else -> NxColors.Danger
    }
    val color by animateColorAsState(tono, label = "tonoCuadre")
    val estado = when {
        cuadre is CuadreReparto.Cuadra -> "Cuadra exacto"
        diferencia > 0L -> "Faltan ${Dinero.pesos(diferencia)}"
        else -> "Sobran ${Dinero.pesos(-diferencia)}"
    }

    NxPanelShell {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            NxSectionHeader(
                title = "Total a repartir",
                subtitle = "Es el monto solicitado; la suma tiene que dar esto, al centavo.",
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                Importe("Total", totalCentavos, NxTone.Neutral, Modifier.weight(1f))
                Importe("Repartido", sumaCentavos, NxTone.Neutral, Modifier.weight(1f))
            }
            Text(
                estado,
                style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                color = color,
                modifier = Modifier
                    .fillMaxWidth()
                    .background(color.copy(alpha = 0.10f), RoundedCornerShape(10.dp))
                    .padding(horizontal = 14.dp, vertical = 12.dp)
                    .clearAndSetSemantics {
                        contentDescription = "$estado. Repartido ${Dinero.pesos(sumaCentavos)} " +
                            "de ${Dinero.pesos(totalCentavos)}."
                        liveRegion = LiveRegionMode.Polite
                    },
            )
        }
    }
}

/** Una actividad y lo que carga. El importe usa el mismo campo que todo el módulo. */
@Composable
private fun FilaDeReparto(
    fila: FilaReparto,
    habilitado: Boolean,
    onTexto: (String) -> Unit,
    onQuitar: () -> Unit,
) {
    NxPanelShell {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    fila.etiqueta,
                    style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold),
                    color = NxColors.Slate,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                IconButton(
                    onClick = onQuitar,
                    enabled = habilitado,
                    modifier = Modifier.size(AlturaToque),
                ) {
                    Icon(
                        Icons.Default.Close,
                        contentDescription = "Quitar ${fila.etiqueta} del reparto",
                        tint = NxColors.Muted,
                    )
                }
            }
            CampoImporte(
                valor = fila.texto,
                onValorChange = onTexto,
                label = "Carga esta actividad",
                enabled = habilitado,
                imeAction = ImeAction.Next,
            )
        }
    }
}
