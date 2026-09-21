package mx.nexara.mobile.nativeapp.ui.console.cotizaciones

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.PictureAsPdf
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import mx.nexara.mobile.nativeapp.data.api.CotizacionDetalleDto
import mx.nexara.mobile.nativeapp.data.api.CotizacionGrupoDto
import mx.nexara.mobile.nativeapp.data.api.CotizacionPartidaDto
import mx.nexara.mobile.nativeapp.ui.console.more.MoreAvisoDesactualizado
import mx.nexara.mobile.nativeapp.ui.console.more.MoreCabecera
import mx.nexara.mobile.nativeapp.ui.console.more.MoreNotaDeAlcance
import mx.nexara.mobile.nativeapp.ui.console.more.MoreTarjeta
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxScreenScaffold
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSkeletonList
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone

/**
 * Una cotización por dentro.
 *
 * El editor de la web tiene cinco secciones (portada, objetivo, alcance, planos
 * y partidas) porque ahí se **arma** la propuesta. Aquí se consulta, así que el
 * orden es otro: primero de quién es y cuánto, luego en qué se va ese dinero
 * —las partidas agrupadas en Equipos, Materiales y Mano de obra, que es la
 * pregunta que hace un cliente delante—, después lo que se prometió (términos)
 * y quién respondió por ella. Y arriba del todo, el PDF: el documento que el
 * cliente ya tiene, para enseñarlo o reenviarlo desde donde estés.
 */
@Composable
fun CotizacionDetalleScreen(
    cotizacionId: Long,
    vm: CotizacionDetalleViewModel = viewModel(),
) {
    val state by vm.state.collectAsState()

    LaunchedEffect(cotizacionId) { vm.cargar(cotizacionId) }

    NxScreenScaffold(isRefreshing = state.refrescando, onRefresh = vm::refrescar) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            state.avisoRefresco?.let { aviso ->
                item(key = "aviso") { MoreAvisoDesactualizado(aviso, onCerrar = vm::descartarAviso) }
            }

            if (state.cargando && !state.hayDatos) {
                item(key = "esqueleto") { NxSkeletonList(itemCount = 3, itemHeight = 150.dp) }
            }

            // Error y vacío nunca coinciden: el error solo se pinta cuando no
            // hay detalle cargado, y el vacío solo cuando sí lo hay.
            state.error?.takeIf { !state.hayDatos }?.let { error ->
                item(key = "error") { NxErrorBlock(error, onRetry = { vm.cargar(cotizacionId) }) }
            }

            val cotizacion = state.cotizacion
            if (cotizacion != null) {
                item(key = "cabeza") { CabezaDeCotizacion(cotizacion) }

                item(key = "pdf") {
                    BotonDePdf(
                        descargando = state.descargandoPdf,
                        error = state.errorPdf,
                        onAbrir = vm::abrirPdf,
                        onDescartarError = vm::limpiarErrorPdf,
                    )
                }

                item(key = "importes") { ImportesDeCotizacion(cotizacion) }

                partidasDeCotizacion(cotizacion)

                terminosDeCotizacion(cotizacion)

                participantesDeCotizacion(cotizacion)
            }

            item(key = "alcance") { MoreNotaDeAlcance(CotizacionesRules.LIMITE) }
        }
    }
}

/** Folio, estado, cliente y proyecto: de quién es esta cotización. */
@Composable
private fun CabezaDeCotizacion(cotizacion: CotizacionDetalleDto) {
    val estado = CotizacionesRules.estado(cotizacion.estado)

    MoreTarjeta {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.Top,
        ) {
            Text(
                cotizacion.folio?.trim()?.ifEmpty { null } ?: "Sin folio",
                style = MaterialTheme.typography.titleSmall.copy(
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace,
                ),
                color = NxColors.Slate,
                modifier = Modifier.weight(1f),
                overflow = TextOverflow.Ellipsis,
            )
            NxStatusChip(CotizacionesRules.etiquetaEstado(cotizacion), estado.tono())
        }

        cotizacion.clientCompany?.trim()?.ifEmpty { null }?.let { empresa ->
            Text(
                empresa,
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                color = NxColors.Slate,
            )
        }
        Linea("Contacto", cotizacion.clientName)
        Linea("Proyecto", cotizacion.projectName)
        Linea("Segmento", cotizacion.segmentoEtiqueta)
        Linea("Emisión", CotizacionesRules.fechaLarga(cotizacion.issueDate))
        Linea("Vigente hasta", CotizacionesRules.fechaLarga(cotizacion.validUntil))
        Linea("Enviada", CotizacionesRules.fechaLarga(cotizacion.sentAt))
        Linea("Al correo", cotizacion.sentToEmail)
        Linea("Elaboró", cotizacion.elaboro?.nombre)

        CotizacionesRules.asignacionTexto(cotizacion)?.let { asignacion ->
            Text(asignacion, style = MaterialTheme.typography.labelMedium, color = NxColors.Brand)
        }
        cotizacion.asignadoNota?.trim()?.ifEmpty { null }?.let { nota ->
            Text("«$nota»", style = MaterialTheme.typography.bodySmall, color = NxColors.Muted)
        }
        CotizacionesRules.rechazoTexto(cotizacion)?.let { rechazo ->
            Text(
                rechazo,
                style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.SemiBold),
                color = NxColors.Danger,
            )
        }
    }
}

/** «Etiqueta — valor» en una fila; no se pinta nada si el valor está vacío. */
@Composable
private fun Linea(etiqueta: String, valor: String?) {
    val texto = valor?.trim()?.ifEmpty { null } ?: return
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Text(
            etiqueta,
            style = MaterialTheme.typography.labelMedium,
            color = NxColors.Muted,
            modifier = Modifier.weight(0.42f),
        )
        Text(
            texto,
            style = MaterialTheme.typography.bodySmall,
            color = NxColors.Slate,
            modifier = Modifier.weight(0.58f),
        )
    }
}

/**
 * El PDF de la propuesta.
 *
 * Es lo único que esta pantalla «hace», y por eso vive arriba: quien abre una
 * cotización en el teléfono casi siempre está delante del cliente o a punto de
 * reenviársela. Mientras baja, el botón se bloquea y lo dice; si falla, el
 * aviso va aparte y no toca el detalle que se está leyendo.
 */
@Composable
private fun BotonDePdf(
    descargando: Boolean,
    error: String?,
    onAbrir: () -> Unit,
    onDescartarError: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Button(
            onClick = onAbrir,
            enabled = !descargando,
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.buttonColors(containerColor = NxColors.Brand),
        ) {
            if (descargando) {
                CircularProgressIndicator(
                    modifier = Modifier.size(16.dp),
                    strokeWidth = 2.dp,
                    color = NxColors.Card,
                )
                Spacer(Modifier.size(10.dp))
                Text("Bajando el PDF…")
            } else {
                Icon(Icons.Default.PictureAsPdf, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.size(8.dp))
                Text("Abrir el PDF de la propuesta")
            }
        }
        if (error != null) {
            NxErrorBlock(error, onRetry = { onDescartarError(); onAbrir() })
        }
    }
}

/** Subtotal, impuestos y total, con el total destacado. */
@Composable
private fun ImportesDeCotizacion(cotizacion: CotizacionDetalleDto) {
    val moneda = cotizacion.currency?.trim()?.uppercase()?.takeIf { it.isNotEmpty() && it != "MXN" }

    MoreTarjeta {
        FilaImporte("Subtotal", CotizacionesRules.pesos(cotizacion.subtotal))
        FilaImporte("Impuestos", CotizacionesRules.pesos(cotizacion.taxTotal))
        HorizontalDivider(color = NxColors.Surface)
        FilaImporte(
            etiqueta = "Total",
            valor = CotizacionesRules.pesos(cotizacion.total) + (moneda?.let { " $it" } ?: ""),
            destacado = true,
        )
        cotizacion.totalesPorGrupo?.let { porGrupo ->
            Text(
                "Por grupo: " + listOfNotNull(
                    porGrupo.equipos?.let { "equipos ${CotizacionesRules.pesos(it)}" },
                    porGrupo.materiales?.let { "materiales ${CotizacionesRules.pesos(it)}" },
                    porGrupo.manoDeObra?.let { "mano de obra ${CotizacionesRules.pesos(it)}" },
                ).joinToString(" · "),
                style = MaterialTheme.typography.labelSmall,
                color = NxColors.Muted,
            )
        }
        if (cotizacion.incluyeInstalacion == false) {
            Text(
                "Solo suministro: esta propuesta no cobra instalación.",
                style = MaterialTheme.typography.labelSmall,
                color = NxColors.Muted,
            )
        }
    }
}

@Composable
private fun FilaImporte(etiqueta: String, valor: String, destacado: Boolean = false) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            etiqueta,
            style = if (destacado) {
                MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Bold)
            } else {
                MaterialTheme.typography.bodySmall
            },
            color = if (destacado) NxColors.Slate else NxColors.Muted,
            modifier = Modifier.weight(1f),
        )
        Text(
            valor,
            style = if (destacado) {
                MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold)
            } else {
                MaterialTheme.typography.bodySmall
            },
            color = NxColors.Slate,
            textAlign = TextAlign.End,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

/**
 * Las partidas, agrupadas como en la propuesta técnica.
 *
 * Los grupos llegan abiertos: quien entra quiere ver en qué se va el dinero, y
 * obligarle a tocar tres veces para saberlo sería esconderlo. Se pueden cerrar
 * para llegar antes al total cuando la propuesta tiene veinte conceptos.
 *
 * Es una extensión de `LazyListScope` (y no un composable suelto) para que cada
 * partida sea su propio elemento de la lista: con dos docenas de conceptos, una
 * columna dentro de un solo `item` se compone entera en cada recomposición.
 */
private fun androidx.compose.foundation.lazy.LazyListScope.partidasDeCotizacion(
    cotizacion: CotizacionDetalleDto,
) {
    val grupos = CotizacionesRules.gruposConPartidas(cotizacion)

    item(key = "partidas-cabecera") {
        MoreCabecera(
            titulo = "Partidas",
            subtitulo = "Equipos, materiales y mano de obra",
            trailing = CotizacionesRules.totalPartidas(cotizacion).takeIf { it > 0 }?.toString(),
        )
    }

    if (grupos.isEmpty()) {
        item(key = "partidas-vacio") {
            NxEmptyState(
                title = "Sin partidas",
                subtitle = "Esta cotización todavía no tiene conceptos capturados. " +
                    "Se agregan desde la computadora.",
            )
        }
        return
    }

    // La clave lleva el índice además del grupo: dos grupos con la misma clave
    // (o sin ninguna) reventarían la lista con claves repetidas.
    grupos.forEachIndexed { indice, grupo ->
        item(key = "grupo-$indice-${grupo.grupo.orEmpty()}") {
            GrupoDePartidas(grupo)
        }
    }
}

@Composable
private fun GrupoDePartidas(grupo: CotizacionGrupoDto) {
    var abierto by remember(grupo.grupo) { mutableStateOf(true) }
    val partidas = grupo.partidas.orEmpty()

    // Solo la cabecera abre y cierra: si toda la tarjeta fuera el interruptor,
    // intentar leer una partida larga la cerraría de un dedazo.
    MoreTarjeta {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { abierto = !abierto },
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    CotizacionesRules.etiquetaGrupo(grupo),
                    style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                    color = NxColors.Slate,
                )
                Text(
                    if (partidas.size == 1) "1 concepto" else "${partidas.size} conceptos",
                    style = MaterialTheme.typography.labelSmall,
                    color = NxColors.Muted,
                )
            }
            Text(
                CotizacionesRules.pesos(grupo.subtotal),
                style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Bold),
                color = NxColors.Slate,
            )
            Icon(
                if (abierto) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                contentDescription = if (abierto) "Cerrar el grupo" else "Abrir el grupo",
                tint = NxColors.Muted,
                modifier = Modifier.size(20.dp),
            )
        }

        if (abierto) {
            partidas.forEachIndexed { indice, partida ->
                if (indice > 0) HorizontalDivider(color = NxColors.Surface)
                FilaDePartida(partida)
            }
        }
    }
}

@Composable
private fun FilaDePartida(partida: CotizacionPartidaDto) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                CotizacionesRules.partidaTitulo(partida),
                style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.SemiBold),
                color = NxColors.Slate,
            )
            partida.description?.trim()?.ifEmpty { null }?.let { descripcion ->
                Text(
                    descripcion,
                    style = MaterialTheme.typography.labelSmall,
                    color = NxColors.Muted,
                    maxLines = 4,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            CotizacionesRules.partidaCantidadTexto(partida)?.let { cantidad ->
                Text(cantidad, style = MaterialTheme.typography.labelSmall, color = NxColors.Muted)
            }
        }
        Text(
            CotizacionesRules.partidaImporteTexto(partida),
            style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.SemiBold),
            color = NxColors.Slate,
            textAlign = TextAlign.End,
        )
    }
}

/** Términos y condiciones: cerrados, porque es texto largo que no se lee de pie. */
private fun androidx.compose.foundation.lazy.LazyListScope.terminosDeCotizacion(
    cotizacion: CotizacionDetalleDto,
) {
    val partes = cotizacion.terminos?.partes.orEmpty().filter { !it.texto.isNullOrBlank() }
    if (partes.isEmpty()) return

    item(key = "terminos") {
        var abierto by remember { mutableStateOf(false) }
        MoreTarjeta {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { abierto = !abierto },
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        cotizacion.terminos?.titulo?.trim()?.ifEmpty { null } ?: "Términos y condiciones",
                        style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                        color = NxColors.Slate,
                    )
                    Text(
                        "Lo que se le prometió al cliente · ${partes.size}",
                        style = MaterialTheme.typography.labelSmall,
                        color = NxColors.Muted,
                    )
                }
                Icon(
                    if (abierto) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                    contentDescription = if (abierto) "Cerrar los términos" else "Abrir los términos",
                    tint = NxColors.Muted,
                    modifier = Modifier.size(20.dp),
                )
            }
            if (abierto) {
                partes.forEach { parte ->
                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(
                            parte.titulo?.trim()?.ifEmpty { null } ?: "Condición",
                            style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold),
                            color = NxColors.Slate,
                        )
                        Text(
                            parte.texto.orEmpty(),
                            style = MaterialTheme.typography.bodySmall,
                            color = NxColors.Muted,
                        )
                    }
                    Spacer(Modifier.height(2.dp))
                }
            }
        }
    }
}

/**
 * Quién respondió por esta cotización.
 *
 * No es un adorno: el folio lleva las siglas de quienes intervinieron, y esta
 * lista es la que lo explica — quién la revisó, quién la aprobó y quién la
 * mandó.
 */
private fun androidx.compose.foundation.lazy.LazyListScope.participantesDeCotizacion(
    cotizacion: CotizacionDetalleDto,
) {
    val participantes = cotizacion.participantes.orEmpty().filter { !it.nombre.isNullOrBlank() }
    if (participantes.isEmpty()) return

    item(key = "participantes") {
        MoreTarjeta {
            Text(
                "Quién intervino",
                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                color = NxColors.Slate,
            )
            cotizacion.cadenaParticipantes?.trim()?.ifEmpty { null }?.let { cadena ->
                Text(
                    cadena,
                    style = MaterialTheme.typography.labelSmall.copy(fontFamily = FontFamily.Monospace),
                    color = NxColors.Muted,
                )
            }
            participantes.forEach { persona ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            persona.nombre.orEmpty(),
                            style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.SemiBold),
                            color = NxColors.Slate,
                        )
                        listOfNotNull(
                            persona.puesto?.trim()?.ifEmpty { null },
                            CotizacionesRules.fechaCorta(persona.at),
                        ).joinToString(" · ").ifEmpty { null }?.let { pie ->
                            Text(pie, style = MaterialTheme.typography.labelSmall, color = NxColors.Muted)
                        }
                    }
                    NxStatusChip(
                        persona.rolEtiqueta?.trim()?.ifEmpty { null } ?: persona.rol.orEmpty(),
                        NxTone.Neutral,
                    )
                }
            }
        }
    }
}
