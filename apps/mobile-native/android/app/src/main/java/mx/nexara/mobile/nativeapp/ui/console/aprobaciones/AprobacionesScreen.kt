package mx.nexara.mobile.nativeapp.ui.console.aprobaciones

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import mx.nexara.mobile.nativeapp.ui.console.more.MoreAvisoDesactualizado
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxDenseSectionHeader
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEstadoPantalla
import mx.nexara.mobile.nativeapp.ui.enterprise.NxFilterBar
import mx.nexara.mobile.nativeapp.ui.enterprise.NxFilterPill
import mx.nexara.mobile.nativeapp.ui.enterprise.NxMetricStrip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxScreenScaffold
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSkeletonList
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusDot
import mx.nexara.mobile.nativeapp.ui.enterprise.NxUi
import mx.nexara.mobile.nativeapp.ui.enterprise.nxEstadoPantalla

/**
 * Aprobaciones (`/erp/approvals`) en el teléfono.
 *
 * Es el módulo que más gana al salir de la computadora: quien autoriza casi
 * nunca está sentado. Todo lo de aquí sale de esa escena —de pie, con una mano,
 * a media calle:
 *
 *  · **Qué es, de quién y cuánto, antes de los botones.** Cada tarjeta contesta
 *    las tres preguntas y enseña la cadena de firmas, para que aprobar no sea
 *    un acto de fe. La celda del importe dirá «—» mientras el API no lo mande
 *    (`my-pending` no lo trae); un «$0.00» ahí sería una mentira barata.
 *  · **Un solo botón primario** (regla 4): «Aprobar». «Rechazar» va en gris con
 *    borde y a la izquierda. Rechazar cancela la solicitud entera, y un botón
 *    rojo llamativo justo debajo del pulgar es una trampa, no una advertencia.
 *  · **Difícil por accidente, fácil a propósito**: aprobar es un toque;
 *    rechazar abre un diálogo y pide motivo. Los dos botones miden 52 dp: se
 *    aciertan sin mirar y sin hacer zoom.
 *  · **La fila sale cuando el servidor confirma**, nunca antes, y si el
 *    servidor dice que no, se enseña su mensaje y se recarga.
 *
 * Los cuatro estados —cargando, error, vacío y contenido— los decide
 * [nxEstadoPantalla] y por construcción no pueden coincidir.
 *
 * Las reglas de qué se enseña viven en [AprobacionesRules], que se prueba sin
 * Android.
 */
@Composable
fun AprobacionesScreen(vm: AprobacionesViewModel = viewModel()) {
    val state by vm.state.collectAsState()
    val filtro by vm.filtro.collectAsState()

    // Qué se está rechazando. El motivo se pide en un diálogo y no en la
    // tarjeta: un campo de texto entre los dos botones es justo lo que hace que
    // se toque el que no era.
    var rechazando by remember { mutableStateOf<AprobacionesRules.Pendiente?>(null) }

    LaunchedEffect(Unit) { vm.arrancar() }

    val todas = state.filas
    val visibles = remember(todas, filtro) { AprobacionesRules.aplicar(todas, filtro) }
    val conteos = remember(todas) { AprobacionesRules.conteos(todas) }
    val metricas = remember(todas) { AprobacionesRules.metricas(todas) }

    // `hayDatos` es «hay filas», no «el servidor ya contestó»: una bandeja
    // limpia tiene que caer en VACIO y enseñar la buena noticia, no una barra
    // de filtros en ceros.
    val estado = nxEstadoPantalla(
        cargando = state.cargando,
        error = state.error,
        hayDatos = todas.isNotEmpty(),
    )

    NxScreenScaffold(isRefreshing = state.refrescando, onRefresh = vm::refrescar) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            // Estas dos cintas conviven con el contenido: no son estados de
            // pantalla, son avisos sobre lo que ya se ve.
            state.avisoRefresco?.let { aviso ->
                item(key = "aviso-refresco") {
                    MoreAvisoDesactualizado(aviso, onCerrar = vm::descartarAvisoRefresco)
                }
            }
            (state.errorDecision ?: state.avisoDecision)?.let { texto ->
                item(key = "aviso-decision") {
                    CintaDeDecision(
                        texto = texto,
                        fallo = state.errorDecision != null,
                        onCerrar = vm::descartarAvisoDecision,
                    )
                }
            }

            when (estado) {
                NxEstadoPantalla.CARGANDO -> item(key = "esqueleto") {
                    NxSkeletonList(itemCount = 3, itemHeight = 196.dp)
                }

                NxEstadoPantalla.ERROR -> item(key = "error") {
                    NxErrorBlock(state.error.orEmpty(), onRetry = vm::reintentar)
                }

                // El vacío aquí es una buena noticia y se dice como tal: nadie
                // está detenido esperándote.
                NxEstadoPantalla.VACIO -> item(key = "vacio") {
                    NxEmptyState(
                        title = "No hay nada esperándote",
                        subtitle = "Ninguna solicitud está detenida en tu firma. " +
                            "Cuando alguien te necesite, aparece aquí y te llega el aviso.",
                        actionLabel = "Volver a revisar",
                        onAction = vm::refrescar,
                    )
                }

                NxEstadoPantalla.CONTENIDO -> {
                    // Regla 7: la tira aparece porque hay filas que contar, no
                    // porque las cifras den distinto de cero.
                    item(key = "cifras") {
                        NxMetricStrip(
                            items = metricas,
                            seleccion = AprobacionesRules.metricaDeFiltro(filtro),
                            onSelect = { clave ->
                                AprobacionesRules.filtroDeMetrica(clave)?.let(vm::alternarFiltro)
                            },
                        )
                    }

                    // Regla 8: una sola fila de filtros, sin caja y sin fondo.
                    item(key = "filtros") {
                        NxFilterBar(contentPadding = PaddingValues(horizontal = 0.dp)) {
                            AprobacionesRules.Filtro.entries.forEach { opcion ->
                                NxFilterPill(
                                    label = opcion.etiqueta,
                                    count = conteos[opcion],
                                    color = AprobacionesRules.colorDeFiltro(opcion),
                                    selected = opcion == filtro,
                                    onClick = { vm.alternarFiltro(opcion) },
                                )
                            }
                        }
                    }

                    if (visibles.isEmpty()) {
                        item(key = "sin-coincidencias") {
                            NxEmptyState(
                                title = "Nada en «${filtro.etiqueta.lowercase()}»",
                                subtitle = when (filtro) {
                                    AprobacionesRules.Filtro.ATRASADAS ->
                                        "Ninguna lleva más de dos días parada. Vas al día."
                                    AprobacionesRules.Filtro.CIERRAN ->
                                        "Ninguna se cierra con tu firma: todas pasan a otro después de ti."
                                    AprobacionesRules.Filtro.TODAS ->
                                        "No hay nada en este filtro."
                                },
                                actionLabel = "Ver todas",
                                onAction = { vm.alternarFiltro(AprobacionesRules.Filtro.TODAS) },
                            )
                        }
                    } else {
                        item(key = "cabecera") {
                            NxDenseSectionHeader(
                                title = filtro.etiqueta,
                                hint = "Lo que lleva más tiempo parado, primero.",
                                trailing = {
                                    Text(
                                        visibles.size.toString(),
                                        style = MaterialTheme.typography.labelLarge
                                            .copy(fontWeight = FontWeight.Bold),
                                        color = NxUi.Fg2,
                                    )
                                },
                            )
                        }
                        items(visibles, key = { it.clave }) { fila ->
                            TarjetaDeAprobacion(
                                fila = fila,
                                enviando = state.decidiendo == fila.aprobacionId,
                                bloqueada = state.decidiendo != null,
                                onAprobar = { vm.aprobar(fila.aprobacionId) },
                                onRechazar = { rechazando = fila },
                            )
                        }
                    }
                }
            }
        }
    }

    rechazando?.let { fila ->
        DialogoDeRechazo(
            fila = fila,
            onCancelar = { rechazando = null },
            onConfirmar = { motivo ->
                rechazando = null
                vm.rechazar(fila.aprobacionId, motivo)
            },
        )
    }
}

// ── Una pendiente ────────────────────────────────────────────────────────────

/**
 * Una solicitud esperando tu firma.
 *
 * Regla 9: **una sola caja**. Dentro no hay tarjetas anidadas ni pastillas
 * dentro de paneles; la jerarquía la dan el aire y la tipografía.
 */
@Composable
private fun TarjetaDeAprobacion(
    fila: AprobacionesRules.Pendiente,
    enviando: Boolean,
    bloqueada: Boolean,
    onAprobar: () -> Unit,
    onRechazar: () -> Unit,
) {
    val forma = RoundedCornerShape(NxUi.RadiusLg)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(forma)
            .background(NxColors.Card)
            .border(1.dp, NxUi.Border, forma)
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        // ── QUÉ es ───────────────────────────────────────────────────────────
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.Top,
        ) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    fila.titulo,
                    fontSize = 17.sp,
                    fontWeight = FontWeight.Bold,
                    color = NxColors.Slate,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    fila.flujo,
                    fontSize = 12.5.sp,
                    color = NxUi.Fg2,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            // Regla 3: un punto y una palabra. Color solo cuando urge.
            NxStatusDot(
                text = fila.esperaTexto,
                color = if (fila.atrasada) AprobacionesRules.ROJO else null,
                maxLines = 2,
            )
        }

        // ── DE QUIÉN y CUÁNTO ────────────────────────────────────────────────
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.Top,
        ) {
            Dato(
                etiqueta = "Solicita",
                valor = fila.solicita,
                pie = fila.solicitaRol,
                modifier = Modifier.weight(1.3f),
            )
            Dato(
                etiqueta = "Importe",
                valor = fila.importe,
                // El importe es el dato por el que se abre esta pantalla:
                // se escribe más grande que lo que tiene al lado.
                destacado = true,
                modifier = Modifier.weight(1f),
            )
            Dato(
                etiqueta = "Recibida",
                valor = fila.recibida,
                modifier = Modifier.weight(1f),
            )
        }

        Text(
            fila.paso,
            fontSize = 12.5.sp,
            fontWeight = FontWeight.SemiBold,
            color = NxColors.Slate,
        )

        if (fila.cadena.isNotEmpty()) {
            CadenaDeFirmas(fila.cadena)
        }

        if (fila.cierraElFlujo) {
            NxStatusDot(
                text = "Tu firma cierra el flujo: después de ti no queda nadie.",
                color = AprobacionesRules.AMBAR,
                maxLines = 2,
            )
        }

        // ── Decidir ──────────────────────────────────────────────────────────
        //
        // Rechazar a la izquierda, en gris y con borde; Aprobar a la derecha,
        // más ancho y en marca. El pulgar derecho cae de forma natural sobre la
        // acción no destructiva, y la destructiva además pide confirmación.
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            OutlinedButton(
                onClick = onRechazar,
                enabled = !bloqueada,
                modifier = Modifier.weight(1f).heightIn(min = ALTO_BOTON),
                shape = RoundedCornerShape(NxUi.Radius),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = NxUi.Fg2),
            ) {
                Text("Rechazar", fontSize = 15.sp, fontWeight = FontWeight.Medium)
            }
            Button(
                onClick = onAprobar,
                enabled = !bloqueada,
                modifier = Modifier.weight(1.6f).heightIn(min = ALTO_BOTON),
                shape = RoundedCornerShape(NxUi.Radius),
                colors = ButtonDefaults.buttonColors(containerColor = NxColors.Brand),
            ) {
                if (enviando) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        strokeWidth = 2.dp,
                        color = Color.White,
                    )
                } else {
                    Text("Aprobar", fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}

/** Celda etiqueta/valor de la ficha. Sin caja: la caja ya es la tarjeta. */
@Composable
private fun Dato(
    etiqueta: String,
    valor: String,
    modifier: Modifier = Modifier,
    pie: String? = null,
    destacado: Boolean = false,
) {
    Column(
        modifier = modifier.clearAndSetSemantics {
            // Se lee como una frase; leer «SOLICITA», «Ana López», «Compras»
            // por separado obliga a reconstruirlo de memoria.
            contentDescription = listOfNotNull("$etiqueta: $valor", pie).joinToString(", ")
        },
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(
            etiqueta.uppercase(),
            fontSize = 11.sp,
            letterSpacing = 0.4.sp,
            fontWeight = FontWeight.Medium,
            color = NxColors.Muted,
            maxLines = 1,
        )
        Text(
            valor,
            fontSize = if (destacado) 17.sp else 14.sp,
            fontWeight = if (destacado) FontWeight.Bold else FontWeight.Medium,
            color = NxColors.Slate,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        pie?.takeIf { it.isNotBlank() }?.let {
            Text(
                it,
                fontSize = 11.sp,
                color = NxColors.Muted,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/**
 * Quién ya firmó, dónde estás tú y quién falta.
 *
 * «Paso 2 de 3» por sí solo no dice si el de arriba revisó de verdad. El punto
 * hueco marca los pasos que ni siquiera han empezado: el servidor crea las
 * aprobaciones de una en una, así que ahí todavía no hay nada que mirar.
 */
@Composable
private fun CadenaDeFirmas(pasos: List<AprobacionesRules.PasoCadena>) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        pasos.forEach { paso ->
            val color = when {
                paso.esElTuyo -> null // el tuyo se distingue por el texto, no por el color
                paso.estado == AprobacionesRules.EstadoPaso.APROBADO -> AprobacionesRules.VERDE
                paso.estado == AprobacionesRules.EstadoPaso.RECHAZADO -> AprobacionesRules.ROJO
                paso.estado == AprobacionesRules.EstadoPaso.PENDIENTE -> AprobacionesRules.AMBAR
                else -> AprobacionesRules.GRIS
            }
            val situacion = when {
                paso.esElTuyo -> "te toca a ti"
                paso.estado == AprobacionesRules.EstadoPaso.APROBADO ->
                    paso.decidioNombre?.let { "aprobó $it" } ?: "aprobado"
                paso.estado == AprobacionesRules.EstadoPaso.RECHAZADO -> "rechazado"
                paso.estado == AprobacionesRules.EstadoPaso.PENDIENTE -> "pendiente"
                else -> "aún no le toca"
            }
            if (paso.estado == AprobacionesRules.EstadoPaso.EN_ESPERA) {
                PasoEnEspera("${paso.numero}. ${paso.aprobador} · $situacion")
            } else {
                NxStatusDot(
                    text = "${paso.numero}. ${paso.aprobador} · $situacion",
                    color = color,
                    fontWeight = if (paso.esElTuyo) FontWeight.Bold else FontWeight.Medium,
                    maxLines = 2,
                )
            }
        }
    }
}

/**
 * Un paso que todavía no empieza: mismo renglón, punto hueco.
 *
 * No se usa [NxStatusDot] porque su punto siempre va relleno, y rellenar el de
 * un paso que no ha ocurrido lo hace parecer un estado más del flujo.
 */
@Composable
private fun PasoEnEspera(texto: String) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Box(
            Modifier
                .size(6.dp)
                .clip(CircleShape)
                .border(1.dp, NxUi.BorderStrong, CircleShape),
        )
        Text(
            texto,
            fontSize = 12.5.sp,
            fontWeight = FontWeight.Medium,
            color = NxColors.Muted,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

// ── Cinta del resultado de la decisión ───────────────────────────────────────

/**
 * Qué pasó con lo último que se firmó.
 *
 * Cuando el servidor dice que no —«Esta aprobación ya fue decidida», «No eres
 * el aprobador de este paso»— su texto se enseña tal cual: es la única pista de
 * por qué no pasó nada al pulsar, y traducirlo a un «no se pudo» genérico
 * dejaría a alguien pulsando otra vez.
 */
@Composable
private fun CintaDeDecision(texto: String, fallo: Boolean, onCerrar: () -> Unit) {
    val forma = RoundedCornerShape(NxUi.RadiusLg)
    val fondo = if (fallo) NxColors.DangerSoft else NxColors.SuccessSoft
    val tinta = if (fallo) NxColors.Danger else NxColors.Success
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(forma)
            .background(fondo)
            .padding(start = 14.dp, top = 10.dp, bottom = 10.dp, end = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                if (fallo) "La decisión no se registró" else "Listo",
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                color = tinta,
            )
            Text(texto, fontSize = 12.5.sp, color = NxColors.Slate)
        }
        TextButton(onClick = onCerrar) {
            Text("Cerrar", fontSize = 13.sp, color = NxUi.Fg2)
        }
    }
}

// ── Diálogo de rechazo ───────────────────────────────────────────────────────

/**
 * Rechazar cancela la instancia entera y le manda una notificación al
 * solicitante con el motivo. Por eso van las dos cosas: confirmación aparte del
 * botón, y motivo obligatorio. Quien recibe un «no» tiene derecho a saber por
 * qué, y sin el motivo la notificación llega vacía y esa persona acaba
 * preguntando a alguien.
 *
 * El diálogo repite qué y de quién es: quien lo abre acaba de dejar de mirar la
 * tarjeta, y confirmar sobre un texto que solo dice «¿seguro?» no confirma nada.
 */
@Composable
private fun DialogoDeRechazo(
    fila: AprobacionesRules.Pendiente,
    onCancelar: () -> Unit,
    onConfirmar: (String) -> Unit,
) {
    var motivo by remember(fila.aprobacionId) { mutableStateOf("") }
    val valido = AprobacionesRules.motivoValido(motivo)

    AlertDialog(
        onDismissRequest = onCancelar,
        title = { Text("¿Rechazar ${fila.titulo}?") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(
                    "La solicitud de ${fila.solicita} queda cancelada —no pasa al " +
                        "siguiente paso— y se le avisa con el motivo que escribas.",
                    fontSize = 13.sp,
                    color = NxUi.Fg2,
                )
                if (fila.importeCentavos != null) {
                    Text(
                        "Importe: ${fila.importe}",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = NxColors.Slate,
                    )
                }
                OutlinedTextField(
                    value = motivo,
                    onValueChange = { motivo = it },
                    label = { Text("Motivo") },
                    placeholder = { Text("Ej. falta la factura del proveedor") },
                    minLines = 2,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = {
            TextButton(onClick = { onConfirmar(motivo.trim()) }, enabled = valido) {
                Text(
                    "Rechazar",
                    fontWeight = FontWeight.Bold,
                    color = if (valido) NxColors.Danger else NxColors.Muted,
                )
            }
        },
        dismissButton = {
            TextButton(onClick = onCancelar) { Text("Cancelar", color = NxUi.Fg2) }
        },
        containerColor = NxColors.Card,
    )
}

/**
 * Alto de los dos botones de decisión.
 *
 * 52 dp, no los 44 de [NxUi.TouchH]: aquí se pulsa caminando y equivocarse
 * cuesta cancelar la solicitud de otra persona.
 */
private val ALTO_BOTON = 52.dp
