package mx.nexara.mobile.nativeapp.ui.console.herramientas

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import java.time.Instant
import java.time.LocalDate
import mx.nexara.mobile.nativeapp.data.api.KitAsignacionDto
import mx.nexara.mobile.nativeapp.data.api.PrestamoHerramientaDto
import mx.nexara.mobile.nativeapp.ui.console.more.MoreTarjeta
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone
import mx.nexara.mobile.nativeapp.ui.enterprise.bg
import mx.nexara.mobile.nativeapp.ui.enterprise.fg

/**
 * Las piezas visuales de Herramientas: la tarjeta del kit, la del préstamo y el
 * diálogo de prórroga.
 *
 * Viven aparte de la pantalla porque la pantalla ya tiene bastante con decidir
 * qué lista enseñar; aquí no se decide nada, solo se dibuja lo que
 * [HerramientasRules] ya resolvió.
 */

/** Alto mínimo de cualquier cosa que se toque: guantes y sol de mediodía. */
internal val AlturaToque = 48.dp

/** El tono de las reglas, traducido al del design system. */
internal fun HerramientasRules.Tono.nx(): NxTone = when (this) {
    HerramientasRules.Tono.NEUTRO -> NxTone.Neutral
    HerramientasRules.Tono.EXITO -> NxTone.Success
    HerramientasRules.Tono.AVISO -> NxTone.Warning
    HerramientasRules.Tono.PELIGRO -> NxTone.Danger
    HerramientasRules.Tono.INFO -> NxTone.Info
    HerramientasRules.Tono.MARCA -> NxTone.Brand
}

/**
 * Una herramienta del kit.
 *
 * El kit no es un préstamo: es lo que la persona trae siempre y de lo que
 * responde. Por eso lo que manda en la tarjeta es la identificación de la pieza
 * —el código interno es el que lleva pegado en la etiqueta— y lo que reclama
 * atención: un daño que nadie ha dictaminado o una revisión pasada de fecha.
 */
@Composable
internal fun TarjetaKit(
    asignacion: KitAsignacionDto,
    hoy: LocalDate,
) {
    val titulo = HerramientasRules.tituloPieza(asignacion)
    val identificacion = HerramientasRules.identificacionPieza(asignacion)
    val abiertos = HerramientasRules.eventosAbiertos(asignacion)
    val revisionVencida = HerramientasRules.revisionVencida(asignacion, hoy)
    val estadoPieza = HerramientasRules.etiquetaEstadoPieza(asignacion.inventoryItem?.status)
    val desdeCuando = HerramientasRules.fechaCorta(asignacion.assignedAt)
    val plazoRevision = HerramientasRules.textoPlazo(asignacion.proximaInspeccion, hoy)

    // La tarjeta se lee de una sola vez con lector de pantalla: los chips sueltos
    // sonarían a lista de palabras sin sujeto.
    val descripcion = buildString {
        append("$titulo. $identificacion. $estadoPieza. ")
        if (desdeCuando.isNotEmpty()) append("Asignada desde el $desdeCuando. ")
        if (abiertos > 0) append("$abiertos daños sin resolver. ")
        plazoRevision?.let { append("Revisión: $it. ") }
    }

    MoreTarjeta(modifier = Modifier.clearAndSetSemantics { contentDescription = descripcion }) {
        Text(
            titulo,
            style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold),
            color = NxColors.Slate,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        Text(
            identificacion,
            style = MaterialTheme.typography.labelMedium,
            color = NxColors.Muted,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        if (desdeCuando.isNotEmpty()) {
            Text(
                "Asignada desde el $desdeCuando",
                style = MaterialTheme.typography.labelSmall,
                color = NxColors.Muted,
            )
        }

        Row(
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            NxStatusChip(estadoPieza, HerramientasRules.tonoEstadoPieza(asignacion.inventoryItem?.status).nx())
            if (abiertos > 0) {
                NxStatusChip(
                    if (abiertos == 1) "1 daño sin cerrar" else "$abiertos daños sin cerrar",
                    NxTone.Danger,
                )
            }
            if (revisionVencida) NxStatusChip("Revisión vencida", NxTone.Warning)
        }

        // El plazo de revisión solo se enseña cuando hay revisión programada:
        // recordar una fecha que nadie fijó sería inventarse una obligación.
        if (!revisionVencida && plazoRevision != null) {
            Text(
                "Próxima revisión: ${HerramientasRules.fechaCorta(asignacion.proximaInspeccion)} · $plazoRevision",
                style = MaterialTheme.typography.labelSmall,
                color = NxColors.Muted,
            )
        }

        // El último parte abierto, con sus palabras: un «1 daño sin cerrar» sin
        // decir cuál obliga a llamar a alguien para saber de qué se trata.
        asignacion.events.orEmpty()
            .firstOrNull { it.resolvedAt == null }
            ?.description
            ?.trim()
            ?.takeIf { it.isNotEmpty() }
            ?.let { parte ->
                Text(
                    parte,
                    style = MaterialTheme.typography.bodySmall,
                    color = NxColors.Slate,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(NxTone.Danger.bg(), RoundedCornerShape(8.dp))
                        .padding(horizontal = 10.dp, vertical = 8.dp),
                )
            }

        asignacion.notes?.trim()?.takeIf { it.isNotEmpty() }?.let { nota ->
            Text(nota, style = MaterialTheme.typography.bodySmall, color = NxColors.Muted, maxLines = 3)
        }
    }
}

/**
 * Un préstamo.
 *
 * Lo primero que busca alguien que abre esto parado en la ventanilla del almacén
 * es el código de recolección, así que cuando sirve se enseña grande y aparte,
 * no escondido en una línea de metadatos.
 */
@Composable
internal fun TarjetaPrestamo(
    prestamo: PrestamoHerramientaDto,
    hoy: LocalDate,
    ahora: Instant,
    onRenovar: () -> Unit,
) {
    val titulo = HerramientasRules.tituloPrestamo(prestamo)
    val identificacion = HerramientasRules.identificacionPrestamo(prestamo)
    val estado = HerramientasRules.etiquetaEstado(prestamo.status)
    val plazo = HerramientasRules.textoPlazo(prestamo.expectedReturnDate, hoy)
        ?.takeIf { HerramientasRules.estaAbierto(prestamo) }
    val codigo = prestamo.pickupCode?.trim().orEmpty()
    val codigoVigente = HerramientasRules.codigoVigente(prestamo, ahora)
    val devolver = HerramientasRules.fechaCorta(prestamo.expectedReturnDate)

    val descripcion = buildString {
        append("$titulo. $identificacion. $estado. ")
        if (devolver.isNotEmpty()) append("Devolver el $devolver. ")
        plazo?.let { append("$it. ") }
        if (codigoVigente) append("Código de recolección $codigo. ")
    }

    MoreTarjeta {
        Column(
            verticalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.clearAndSetSemantics { contentDescription = descripcion },
        ) {
            Text(
                titulo,
                style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold),
                color = NxColors.Slate,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                identificacion,
                style = MaterialTheme.typography.labelMedium,
                color = NxColors.Muted,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )

            Row(
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                NxStatusChip(estado, HerramientasRules.tonoEstado(prestamo.status).nx())
                plazo?.let {
                    NxStatusChip(it, HerramientasRules.tonoPlazo(prestamo.expectedReturnDate, hoy).nx())
                }
                (prestamo.renewalCount ?: 0).takeIf { it > 0 }?.let { veces ->
                    NxStatusChip(if (veces == 1) "1 prórroga" else "$veces prórrogas", NxTone.Info)
                }
            }

            if (devolver.isNotEmpty() && HerramientasRules.estaAbierto(prestamo)) {
                Text(
                    "Devolver el $devolver",
                    style = MaterialTheme.typography.labelSmall,
                    color = NxColors.Muted,
                )
            }

            if (codigoVigente) {
                CodigoDeRecoleccion(codigo, HerramientasRules.fechaCorta(prestamo.pickupExpiresAt))
            }

            prestamo.reason?.trim()?.takeIf { it.isNotEmpty() }?.let { motivo ->
                Text(
                    motivo,
                    style = MaterialTheme.typography.bodySmall,
                    color = NxColors.Muted,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis,
                )
            }

            // Lo que dijo quien decidió: si te la rechazaron o la recibieron con
            // daño, el porqué importa más que el estado.
            listOfNotNull(
                prestamo.damageDescription?.trim()?.takeIf { it.isNotEmpty() },
                prestamo.adminNotes?.trim()?.takeIf { it.isNotEmpty() },
            ).forEach { nota ->
                Text(
                    nota,
                    style = MaterialTheme.typography.bodySmall,
                    color = NxColors.Slate,
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(NxTone.Neutral.bg(), RoundedCornerShape(8.dp))
                        .padding(horizontal = 10.dp, vertical = 8.dp),
                )
            }
        }

        if (HerramientasRules.sePuedeRenovar(prestamo)) {
            OutlinedButton(
                onClick = onRenovar,
                modifier = Modifier.heightIn(min = AlturaToque),
            ) {
                Text("Pedir más plazo", color = NxColors.Brand, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

/**
 * El código que el almacén teclea al entregar.
 *
 * Va con espacios cada tres caracteres y en cuerpo grande porque se lee en voz
 * alta a través de una ventanilla, muchas veces con el teléfono en una mano y
 * una escalera en la otra.
 */
@Composable
private fun CodigoDeRecoleccion(codigo: String, caduca: String) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(NxTone.Info.bg(), RoundedCornerShape(10.dp))
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(
            "Código para recoger en almacén",
            style = MaterialTheme.typography.labelSmall,
            color = NxColors.Muted,
        )
        Text(
            codigo.chunked(3).joinToString(" "),
            style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold),
            color = NxTone.Info.fg(),
        )
        if (caduca.isNotEmpty()) {
            Text(
                "Sirve hasta el $caduca",
                style = MaterialTheme.typography.labelSmall,
                color = NxColors.Muted,
            )
        }
    }
}

/**
 * Pedir más plazo.
 *
 * No hay selector de calendario a propósito: en campo se piensa en «una semana
 * más», no en «el 14 de octubre». Las tres opciones salen de [HerramientasRules.fechasSugeridas],
 * que cuenta desde la fecha vigente del préstamo —o desde hoy si ya venció, para
 * que nadie pida una prórroga que nace vencida— y debajo se enseña la fecha
 * exacta que se va a mandar, que es lo que la persona tiene que reconocer.
 */
@Composable
internal fun DialogoRenovar(
    prestamo: PrestamoHerramientaDto,
    hoy: LocalDate,
    enviando: Boolean,
    error: String?,
    onCerrar: () -> Unit,
    onConfirmar: (LocalDate, String?) -> Unit,
) {
    val opciones = remember(prestamo.id, prestamo.expectedReturnDate) {
        HerramientasRules.fechasSugeridas(prestamo, hoy)
    }
    var elegida by remember(prestamo.id) { mutableIntStateOf(0) }
    var motivo by remember(prestamo.id) { mutableStateOf("") }
    val fecha = opciones.getOrNull(elegida)?.second

    AlertDialog(
        onDismissRequest = { if (!enviando) onCerrar() },
        title = {
            Column {
                Text(
                    "MÁS PLAZO",
                    style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.ExtraBold),
                    color = NxColors.Muted,
                )
                Text(
                    HerramientasRules.tituloPrestamo(prestamo),
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                    color = NxColors.Slate,
                )
            }
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                HerramientasRules.textoPlazo(prestamo.expectedReturnDate, hoy)?.let { plazo ->
                    Text(
                        "Ahora la devuelves el ${HerramientasRules.fechaCorta(prestamo.expectedReturnDate)} · $plazo",
                        style = MaterialTheme.typography.bodySmall,
                        color = NxColors.Muted,
                    )
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    opciones.forEachIndexed { indice, (etiqueta, _) ->
                        FilterChip(
                            selected = indice == elegida,
                            onClick = { elegida = indice },
                            enabled = !enviando,
                            label = { Text(etiqueta) },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = NxColors.BrandSoft,
                                selectedLabelColor = NxColors.BrandDark,
                            ),
                        )
                    }
                }
                fecha?.let {
                    Text(
                        "La pedirías hasta el ${HerramientasRules.fechaCorta(it)}",
                        style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
                        color = NxColors.Slate,
                    )
                }
                OutlinedTextField(
                    value = motivo,
                    onValueChange = { motivo = it.take(500) },
                    label = { Text("¿Por qué? (opcional)") },
                    placeholder = { Text("Ej. La obra se alargó una semana.") },
                    enabled = !enviando,
                    minLines = 2,
                    modifier = Modifier.fillMaxWidth(),
                )
                Text(
                    "Queda pendiente: alguien de almacén tiene que autorizarla.",
                    style = MaterialTheme.typography.labelSmall,
                    color = NxColors.Muted,
                )
                error?.let {
                    Text(it, style = MaterialTheme.typography.bodySmall, color = NxColors.Danger)
                }
            }
        },
        confirmButton = {
            Button(
                onClick = { fecha?.let { onConfirmar(it, motivo.trim().takeIf { t -> t.isNotEmpty() }) } },
                enabled = !enviando && fecha != null,
                colors = ButtonDefaults.buttonColors(containerColor = NxColors.Brand),
                modifier = Modifier.heightIn(min = AlturaToque),
            ) {
                Text(if (enviando) "Enviando…" else "Pedir prórroga", fontWeight = FontWeight.Bold)
            }
        },
        dismissButton = {
            TextButton(onClick = onCerrar, enabled = !enviando) { Text("Mejor no") }
        },
    )
}
