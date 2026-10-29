package mx.nexara.mobile.nativeapp.ui.chat

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Assignment
import androidx.compose.material.icons.automirrored.outlined.OpenInNew
import androidx.compose.material.icons.automirrored.outlined.ReceiptLong
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.outlined.AccountTree
import androidx.compose.material.icons.outlined.Business
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.FlightTakeoff
import androidx.compose.material.icons.outlined.HowToReg
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.PhotoCamera
import androidx.compose.material.icons.outlined.SmartToy
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import mx.nexara.mobile.nativeapp.data.api.ChatPropuestaAsistenteDto
import mx.nexara.mobile.nativeapp.data.api.ChatRespuestaAsistenteDto
import mx.nexara.mobile.nativeapp.data.api.ChatTarjetaLigaDto
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone

// Tarjetas de las ligas de un mensaje y panel del asistente de #general — paridad con
// `apps/web/components/chat/EntityCards.tsx` y `AsistentePanel.tsx`.

/** Turno con el asistente: solo vive en este teléfono y solo lo ve quien preguntó. */
data class TurnoAsistente(
    val id: String,
    /** Lo que se escribió, con la mención al asistente. */
    val pregunta: String,
    val estado: EstadoTurno,
    val respuesta: ChatRespuestaAsistenteDto? = null,
    val error: String? = null,
)

enum class EstadoTurno { ESPERANDO, LISTO, ERROR }

/** Qué pasó con una propuesta de «asígnale a…». */
sealed class CreacionPropuesta {
    data object Creando : CreacionPropuesta()
    data class Creada(val id: Long, val anNumber: String?) : CreacionPropuesta()
    /** Sin señal: la cola la manda al volver la red. */
    data object EnCola : CreacionPropuesta()
    data class Fallo(val mensaje: String) : CreacionPropuesta()
    data object Descartada : CreacionPropuesta()
}

/** Clave de una propuesta: turno + posición, como la web. */
fun clavePropuesta(turnoId: String, indice: Int): String = "$turnoId-$indice"

/** Lista de cada tipo en la web, para la tarjeta de un folio que no pudo cargarse. */
private fun listaDeTipo(tipo: TipoLiga): String = when (tipo) {
    TipoLiga.ACTIVIDAD, TipoLiga.EVIDENCIA -> "/erp/actividades"
    TipoLiga.COTIZACION -> "/erp/cotizaciones"
    TipoLiga.CLIENTE -> "/erp/clientes"
    TipoLiga.PROYECTO -> "/erp/proyectos"
    TipoLiga.ASISTENCIA -> "/erp/asistencias"
    TipoLiga.VIATICO -> "/erp/finance/viatics"
    TipoLiga.FACTURA -> "/erp/invoicing"
}

private fun iconoDeTipo(tipo: TipoLiga): ImageVector = when (tipo) {
    TipoLiga.ACTIVIDAD -> Icons.AutoMirrored.Outlined.Assignment
    TipoLiga.EVIDENCIA -> Icons.Outlined.PhotoCamera
    TipoLiga.COTIZACION -> Icons.Outlined.Description
    TipoLiga.CLIENTE -> Icons.Outlined.Business
    TipoLiga.PROYECTO -> Icons.Outlined.AccountTree
    TipoLiga.ASISTENCIA -> Icons.Outlined.HowToReg
    TipoLiga.VIATICO -> Icons.Outlined.FlightTakeoff
    TipoLiga.FACTURA -> Icons.AutoMirrored.Outlined.ReceiptLong
}

private fun toneDe(tono: TonoEstado): NxTone = when (tono) {
    TonoEstado.PROCESO -> NxTone.Info
    TonoEstado.VALIDACION -> NxTone.Warning
    TonoEstado.FINALIZADA -> NxTone.Success
    TonoEstado.ALERTA -> NxTone.Danger
    TonoEstado.NEUTRO -> NxTone.Neutral
}

/** Icono de la pestaña del selector «Ligar». */
internal fun iconoDeKind(kind: String): ImageVector =
    ChatLigas.tipoDeKind(kind)?.let(::iconoDeTipo) ?: Icons.Outlined.Person

/**
 * Tarjetas de las ligas que trae el cuerpo de un mensaje (hasta tres): pastillas `[…](/erp/…)` y
 * folios escritos sueltos. Los datos llegan del caché del chat ([tarjetas], pedido en lote); sin
 * dato todavía se pinta «Cargando…».
 */
@Composable
internal fun ChatLigaCards(
    body: String,
    tarjetas: Map<String, ChatTarjetaLigaDto>,
    onOpen: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val refs = remember(body) { ChatLigas.refsDelMensaje(body) }
    if (refs.isEmpty()) return
    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        refs.forEach { ref -> ChatLigaCard(ref = ref, tarjeta = tarjetas[ref.ref], onOpen = onOpen) }
    }
}

@Composable
private fun ChatLigaCard(
    ref: RefLiga,
    tarjeta: ChatTarjetaLigaDto?,
    onOpen: (String) -> Unit,
) {
    val tipo = TipoLiga.deClave(tarjeta?.tipo) ?: ref.tipo
    val folio = tarjeta?.folio ?: ref.folio
    val href = tarjeta?.href?.takeIf { it.isNotBlank() }
        ?: ref.ref.takeIf { it.startsWith("/") }
        ?: listaDeTipo(tipo)
    val franja = if (tipo.esDeMarca) NxColors.Brand else NxColors.Info
    val titulo = tarjeta?.titulo?.takeIf { it.isNotBlank() } ?: ChatLigas.tituloGenerico(tipo, folio)
    val descripcion = buildString {
        append(tipo.etiqueta)
        folio?.let { append(" $it") }
        if (tarjeta != null && tarjeta.acceso) append(": ${tarjeta.titulo}")
        tarjeta?.estado?.let { append(", $it") }
        if (tarjeta != null && !tarjeta.acceso) tarjeta.motivo?.let { append(", $it") }
        append(". Toca para abrir.")
    }

    Surface(
        shape = RoundedCornerShape(12.dp),
        color = Color.White,
        border = BorderStroke(1.dp, NxColors.Muted.copy(alpha = 0.18f)),
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .clickable { onOpen(href) }
            .semantics(mergeDescendants = true) { contentDescription = descripcion },
    ) {
        Row(Modifier.height(IntrinsicSize.Min)) {
            Box(
                Modifier
                    .width(3.dp)
                    .fillMaxHeight()
                    .background(franja),
            )
            Column(
                Modifier
                    .weight(1f)
                    .padding(horizontal = 10.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(3.dp),
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Icon(iconoDeTipo(tipo), contentDescription = null, tint = franja, modifier = Modifier.size(14.dp))
                    Text(
                        tipo.etiqueta,
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.SemiBold,
                        color = NxColors.Muted,
                    )
                    if (!folio.isNullOrBlank()) {
                        Text(
                            folio,
                            style = MaterialTheme.typography.labelSmall,
                            color = NxColors.Slate,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f, fill = false),
                        )
                    }
                    Spacer(Modifier.weight(1f))
                    val estado = tarjeta?.estado?.takeIf { tarjeta.acceso && it.isNotBlank() }
                    if (estado != null) {
                        NxStatusChip(estado, toneDe(ChatLigas.tonoDeEstado(estado)))
                    }
                }
                when {
                    tarjeta == null -> Text(
                        "Cargando…",
                        style = MaterialTheme.typography.bodySmall,
                        color = NxColors.Muted,
                    )
                    !tarjeta.acceso -> Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            tarjeta.motivo?.takeIf { it.isNotBlank() } ?: ChatLigas.SIN_ACCESO,
                            style = MaterialTheme.typography.bodySmall,
                            color = NxColors.Muted,
                            modifier = Modifier.weight(1f),
                        )
                        AbrirLiga()
                    }
                    else -> {
                        Text(
                            titulo,
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = NxColors.Slate,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                        )
                        if (tarjeta.detalle.isNotEmpty()) {
                            Text(
                                tarjeta.detalle.joinToString(" · "),
                                style = MaterialTheme.typography.bodySmall,
                                color = NxColors.Muted,
                                maxLines = 3,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            val monto = tarjeta.monto
                            if (monto != null) {
                                Text(
                                    ChatLigas.formatoMonto(monto.total, monto.moneda),
                                    style = MaterialTheme.typography.labelLarge,
                                    fontWeight = FontWeight.Bold,
                                    color = NxColors.Slate,
                                )
                                Text(
                                    " ${monto.moneda?.uppercase() ?: "MXN"}",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = NxColors.Muted,
                                )
                            }
                            Spacer(Modifier.weight(1f))
                            AbrirLiga()
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun AbrirLiga() {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(
            "Abrir",
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
            color = NxColors.Brand,
        )
        Icon(
            Icons.AutoMirrored.Outlined.OpenInNew,
            contentDescription = null,
            tint = NxColors.Brand,
            modifier = Modifier.size(13.dp),
        )
    }
}

// ── Asistente ───────────────────────────────────────────────────────────────

/**
 * Conversación con el asistente dentro de #general, encima del redactor. Solo la ve quien pregunta y
 * se borra al salir de la app: el canal no recibe nada. Las propuestas de «asígnale a…» se crean una
 * por una con «Crear», nunca solas.
 */
@Composable
internal fun ChatAsistentePanel(
    turnos: List<TurnoAsistente>,
    tarjetas: Map<String, ChatTarjetaLigaDto>,
    propuestas: Map<String, CreacionPropuesta>,
    onSugerencia: (String) -> Unit,
    onCrear: (turnoId: String, indice: Int, propuesta: ChatPropuestaAsistenteDto) -> Unit,
    onDescartar: (turnoId: String, indice: Int) -> Unit,
    onOpenLink: (String) -> Unit,
    onCerrar: () -> Unit,
) {
    if (turnos.isEmpty()) return
    val scroll = rememberScrollState()
    val ultimo = turnos.last()
    LaunchedEffect(turnos.size, ultimo.estado) { scroll.animateScrollTo(scroll.maxValue) }

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 12.dp, end = 12.dp, top = 4.dp),
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surface,
        shadowElevation = 2.dp,
        border = BorderStroke(1.dp, NxColors.Brand.copy(alpha = 0.25f)),
    ) {
        Column {
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(start = 12.dp, end = 4.dp, top = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Box(
                    Modifier
                        .size(26.dp)
                        .clip(CircleShape)
                        .background(NxColors.BrandSoft),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Outlined.SmartToy, contentDescription = null, tint = NxColors.Brand, modifier = Modifier.size(16.dp))
                }
                Text("Asistente NEXARA", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                Text(
                    "Solo tú lo ves",
                    style = MaterialTheme.typography.labelSmall,
                    color = NxColors.BrandDark,
                    modifier = Modifier
                        .background(NxColors.BrandSoft, RoundedCornerShape(8.dp))
                        .padding(horizontal = 8.dp, vertical = 2.dp),
                )
                Spacer(Modifier.weight(1f))
                IconButton(onClick = onCerrar) {
                    Icon(Icons.Default.Close, contentDescription = "Cerrar el asistente", tint = NxColors.Muted)
                }
            }
            Column(
                Modifier
                    .fillMaxWidth()
                    .heightIn(max = 300.dp)
                    .verticalScroll(scroll)
                    .padding(start = 12.dp, end = 12.dp, bottom = 12.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                turnos.forEach { turno ->
                    TurnoAsistenteView(
                        turno = turno,
                        tarjetas = tarjetas,
                        propuestas = propuestas,
                        onSugerencia = onSugerencia,
                        onCrear = onCrear,
                        onDescartar = onDescartar,
                        onOpenLink = onOpenLink,
                    )
                }
            }
        }
    }
}

@Composable
private fun TurnoAsistenteView(
    turno: TurnoAsistente,
    tarjetas: Map<String, ChatTarjetaLigaDto>,
    propuestas: Map<String, CreacionPropuesta>,
    onSugerencia: (String) -> Unit,
    onCrear: (String, Int, ChatPropuestaAsistenteDto) -> Unit,
    onDescartar: (String, Int) -> Unit,
    onOpenLink: (String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            Text(
                ChatAsistente.preguntaVisible(turno.pregunta).ifBlank { "…" },
                style = MaterialTheme.typography.bodyMedium,
                color = NxColors.Slate,
                modifier = Modifier
                    .widthIn(max = 280.dp)
                    .background(NxColors.BrandTint, RoundedCornerShape(12.dp))
                    .padding(horizontal = 10.dp, vertical = 6.dp),
            )
        }
        when (turno.estado) {
            EstadoTurno.ESPERANDO -> Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                CircularProgressIndicator(Modifier.size(14.dp), strokeWidth = 2.dp, color = NxColors.Brand)
                Text("Buscando…", style = MaterialTheme.typography.bodySmall, color = NxColors.Muted)
            }
            EstadoTurno.ERROR -> Text(
                turno.error ?: "El asistente no respondió: intenta de nuevo.",
                style = MaterialTheme.typography.bodySmall,
                color = NxColors.Danger,
                modifier = Modifier
                    .fillMaxWidth()
                    .background(NxColors.DangerSoft, RoundedCornerShape(10.dp))
                    .padding(horizontal = 10.dp, vertical = 6.dp),
            )
            EstadoTurno.LISTO -> turno.respuesta?.let { r ->
                ChatMessageBodyText(
                    body = r.texto,
                    primaryColor = MaterialTheme.colorScheme.onSurface,
                    linkColor = NxColors.Brand,
                    mentionColor = NxColors.Brand,
                    onOpenEntityLink = onOpenLink,
                )
                ChatLigaCards(body = r.texto, tarjetas = tarjetas, onOpen = onOpenLink)
                r.accion?.propuestas?.forEachIndexed { i, p ->
                    PropuestaView(
                        propuesta = p,
                        estado = propuestas[clavePropuesta(turno.id, i)],
                        onCrear = { onCrear(turno.id, i, p) },
                        onDescartar = { onDescartar(turno.id, i) },
                        onOpenLink = onOpenLink,
                    )
                }
                if (r.sugerencias.isNotEmpty()) {
                    Row(
                        Modifier.horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        r.sugerencias.forEach { s ->
                            Text(
                                s,
                                style = MaterialTheme.typography.labelMedium,
                                color = NxColors.BrandDark,
                                modifier = Modifier
                                    .clip(RoundedCornerShape(16.dp))
                                    .background(NxColors.BrandSoft)
                                    .clickable { onSugerencia(s) }
                                    .padding(horizontal = 12.dp, vertical = 8.dp),
                            )
                        }
                    }
                }
                Text(
                    ChatAsistente.etiquetaFuente(r.fuente),
                    style = MaterialTheme.typography.labelSmall,
                    color = NxColors.Muted,
                )
            }
        }
    }
}

@Composable
private fun PropuestaView(
    propuesta: ChatPropuestaAsistenteDto,
    estado: CreacionPropuesta?,
    onCrear: () -> Unit,
    onDescartar: () -> Unit,
    onOpenLink: (String) -> Unit,
) {
    if (estado is CreacionPropuesta.Descartada) return
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = NxColors.BrandTint,
        border = BorderStroke(1.dp, NxColors.Brand.copy(alpha = 0.2f)),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(propuesta.titulo, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
            Text(
                listOfNotNull(
                    propuesta.responsable?.let { "Para $it" } ?: "Sin responsable",
                    propuesta.cuando,
                ).joinToString(" · "),
                style = MaterialTheme.typography.bodySmall,
                color = NxColors.Muted,
            )
            if (propuesta.faltantes.isNotEmpty()) {
                Text(
                    "Falta: ${propuesta.faltantes.joinToString(", ")}. Complétala en Mi equipo › Asignar.",
                    style = MaterialTheme.typography.bodySmall,
                    color = NxColors.Danger,
                )
            }
            propuesta.avisos.forEach { aviso ->
                Text(aviso, style = MaterialTheme.typography.bodySmall, color = NxColors.Muted)
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                when (estado) {
                    is CreacionPropuesta.Creada -> TextButton(onClick = { onOpenLink("/erp/actividades/${estado.id}") }) {
                        Text("Creada ${estado.anNumber.orEmpty()} · Abrir".replace("  ", " "), color = NxColors.Brand)
                    }
                    is CreacionPropuesta.EnCola -> Text(
                        "Sin señal: se creará al volver la conexión.",
                        style = MaterialTheme.typography.bodySmall,
                        color = NxColors.Muted,
                    )
                    else -> {
                        val creando = estado is CreacionPropuesta.Creando
                        TextButton(onClick = onCrear, enabled = !creando && propuesta.faltantes.isEmpty()) {
                            Text(if (creando) "Creando…" else "Crear", fontWeight = FontWeight.SemiBold)
                        }
                        TextButton(onClick = onDescartar, enabled = !creando) {
                            Text("Descartar", color = NxColors.Muted)
                        }
                    }
                }
            }
            if (estado is CreacionPropuesta.Fallo) {
                Text(estado.mensaje, style = MaterialTheme.typography.bodySmall, color = NxColors.Danger)
            }
        }
    }
}
