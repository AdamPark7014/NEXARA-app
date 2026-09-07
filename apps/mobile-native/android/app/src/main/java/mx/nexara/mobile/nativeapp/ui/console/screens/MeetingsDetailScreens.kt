package mx.nexara.mobile.nativeapp.ui.console.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import mx.nexara.mobile.nativeapp.data.api.MeetingCatalog
import mx.nexara.mobile.nativeapp.data.api.MeetingDetailDto
import mx.nexara.mobile.nativeapp.data.api.VisibleUserDto
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxListRow
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import java.time.LocalDate

/**
 * El acta completa y la convocatoria.
 *
 * Es lo que justifica el módulo. Sin estas dos pantallas «Reuniones» sería una
 * lista, y el proceso de la web —convocar con agenda, pasar lista, dejar los
 * acuerdos por escrito con dueño y fecha, y cerrar con minuta— quedaría
 * aplanado a un listado de solo lectura. Que es exactamente el problema que
 * esta revisión existe para corregir.
 */

@Composable
internal fun MeetingDetail(
    detail: MeetingDetailDto,
    canLead: Boolean,
    busy: Boolean,
    staff: List<VisibleUserDto>,
    message: String?,
    onBack: () -> Unit,
    onAddAgreement: (String, String, Long?, String) -> Unit,
    onAgreementStatus: (Long, String) -> Unit,
    onClose: (String) -> Unit,
    onAttendance: (Map<Long, Boolean>) -> Unit,
) {
    val meeting = detail.meeting
    var showRegistrar by remember { mutableStateOf(false) }
    var showCerrar by remember { mutableStateOf(false) }
    var showLista by remember { mutableStateOf(false) }

    var kind by remember { mutableStateOf(MeetingCatalog.AGREEMENT_KINDS.first().first) }
    var descripcion by remember { mutableStateOf("") }
    var ownerId by remember { mutableStateOf<Long?>(null) }
    var fechaCompromiso by remember { mutableStateOf("") }
    var minuta by remember(meeting.id) { mutableStateOf(meeting.notas) }

    // Copia local de la lista: se marcan varias casillas y se manda una sola
    // vez. Se siembra con lo que ya dice el acta para no perder lo guardado.
    val marks = remember(meeting.id, detail.asistentes.size) {
        mutableStateMapOf<Long, Boolean>().apply {
            detail.asistentes.forEach { put(it.userId, it.asistio) }
        }
    }

    LazyColumn(
        Modifier.fillMaxSize().background(NxColors.Surface).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item { OutlinedButton(onClick = onBack) { Text("← Volver a reuniones") } }

        item {
            NxPanelShell {
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(
                            meeting.titulo.ifBlank { meeting.tipoLabel },
                            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                            color = NxColors.Slate,
                        )
                        Text(meeting.whenLabel, style = MaterialTheme.typography.bodySmall, color = NxColors.Muted)
                    }
                    NxStatusChip(meeting.estadoLabel, meetingTone(meeting))
                }
                Spacer(Modifier.height(8.dp))
                MeetingDetailRow("Tipo", meeting.tipoLabel)
                MeetingDetailRow("Facilitador", meeting.facilitadorNombre.ifBlank { "—" })
                MeetingDetailRow("Asistencia", detail.attendanceLabel)
                if (meeting.agenda.isNotBlank()) {
                    Spacer(Modifier.height(8.dp))
                    Text("Agenda", fontWeight = FontWeight.SemiBold, color = NxColors.Slate)
                    Text(meeting.agenda, style = MaterialTheme.typography.bodySmall, color = NxColors.Slate)
                }
                if (meeting.notas.isNotBlank()) {
                    Spacer(Modifier.height(8.dp))
                    Text("Minuta", fontWeight = FontWeight.SemiBold, color = NxColors.Slate)
                    Text(meeting.notas, style = MaterialTheme.typography.bodySmall, color = NxColors.Slate)
                }
            }
        }

        message?.let { text ->
            item { Text(text, color = if (text.startsWith("✅")) NxColors.Success else NxColors.Danger) }
        }

        // ── Pasar lista ───────────────────────────────────────────────────
        if (detail.asistentes.isNotEmpty()) {
            item {
                NxPanelShell {
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            "Convocados (${detail.asistentes.size})",
                            fontWeight = FontWeight.SemiBold,
                            color = NxColors.Slate,
                        )
                        if (canLead) {
                            OutlinedButton(onClick = { showLista = !showLista }) {
                                Text(if (showLista) "Ocultar" else "Pasar lista")
                            }
                        }
                    }
                    Spacer(Modifier.height(6.dp))
                    if (canLead && showLista) {
                        detail.asistentes.forEach { person ->
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Checkbox(
                                    checked = marks[person.userId] ?: person.asistio,
                                    onCheckedChange = { marks[person.userId] = it },
                                    enabled = !busy,
                                )
                                Text(person.displayName, color = NxColors.Slate)
                            }
                        }
                        Spacer(Modifier.height(6.dp))
                        Button(
                            onClick = {
                                onAttendance(marks.toMap())
                                showLista = false
                            },
                            enabled = !busy,
                            colors = ButtonDefaults.buttonColors(containerColor = NxColors.Teal),
                        ) { Text(if (busy) "Guardando…" else "Guardar lista") }
                    } else {
                        Text(
                            detail.asistentes.joinToString(", ") {
                                if (it.asistio) "${it.displayName} ✓" else it.displayName
                            },
                            style = MaterialTheme.typography.bodySmall,
                            color = NxColors.Muted,
                        )
                    }
                }
            }
        }

        // ── Acuerdos, lecciones y riesgos ─────────────────────────────────
        item {
            NxSectionHeader(
                title = "Acuerdos, lecciones y riesgos (${detail.acuerdos.size})",
                subtitle = if (canLead) "Un acuerdo necesita responsable; una lección o un riesgo, no." else null,
                trailing = {
                    if (canLead) {
                        Button(
                            onClick = { showRegistrar = !showRegistrar },
                            colors = ButtonDefaults.buttonColors(containerColor = NxColors.Teal),
                        ) { Text(if (showRegistrar) "Cerrar" else "Registrar") }
                    }
                },
            )
        }

        if (showRegistrar && canLead) {
            item {
                NxPanelShell {
                    Text("Tipo de apunte", fontWeight = FontWeight.SemiBold, color = NxColors.Slate)
                    Row(
                        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        MeetingCatalog.AGREEMENT_KINDS.forEach { (key, label) ->
                            FilterChip(
                                selected = kind == key,
                                onClick = { kind = key },
                                label = { Text(label) },
                            )
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = descripcion,
                        onValueChange = { descripcion = it },
                        label = { Text("De qué se trata") },
                        minLines = 2,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    // Sólo el acuerdo pide dueño y fecha. Pedírselos a una
                    // lección aprendida es la manera segura de que nadie
                    // vuelva a escribir ninguna.
                    if (MeetingCatalog.requiresOwner(kind)) {
                        Spacer(Modifier.height(8.dp))
                        Text("Responsable", fontWeight = FontWeight.SemiBold, color = NxColors.Slate)
                        if (staff.isEmpty()) {
                            Text(
                                "No se pudo cargar la lista de personas. Vuelve a abrir el módulo para reintentarlo.",
                                style = MaterialTheme.typography.bodySmall,
                                color = NxColors.Muted,
                            )
                        }
                        Row(
                            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            staff.take(40).forEach { person ->
                                FilterChip(
                                    selected = ownerId == person.id,
                                    onClick = { ownerId = if (ownerId == person.id) null else person.id },
                                    label = { Text(person.nombre) },
                                )
                            }
                        }
                        Spacer(Modifier.height(8.dp))
                        OutlinedTextField(
                            value = fechaCompromiso,
                            onValueChange = { fechaCompromiso = it },
                            label = { Text("Fecha compromiso (AAAA-MM-DD, opcional)") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                    Spacer(Modifier.height(10.dp))
                    Button(
                        onClick = {
                            onAddAgreement(kind, descripcion, ownerId, fechaCompromiso)
                            descripcion = ""
                            fechaCompromiso = ""
                            ownerId = null
                        },
                        enabled = !busy,
                        colors = ButtonDefaults.buttonColors(containerColor = NxColors.Teal),
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text(if (busy) "Guardando…" else "Guardar apunte") }
                }
            }
        }

        if (detail.acuerdos.isEmpty()) {
            item {
                NxEmptyState(
                    title = "Sin apuntes",
                    subtitle = "De esta reunión todavía no salió ningún acuerdo, lección ni riesgo.",
                )
            }
        } else {
            items(detail.acuerdos, key = { it.rowKey }) { row ->
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    NxListRow(
                        title = row.descripcion,
                        subtitle = listOf(row.tipoLabel, row.responsableNombre, row.activityLabel)
                            .filter { it.isNotBlank() }
                            .joinToString(" · "),
                        meta = if (MeetingCatalog.requiresOwner(row.tipo)) row.dueLabel else null,
                        chipText = row.estadoLabel,
                        chipTone = agreementTone(row),
                    )
                    // Una lección y un riesgo no tienen estado que avanzar:
                    // son conocimiento, no compromisos.
                    if (canLead && row.isOpen && MeetingCatalog.requiresOwner(row.tipo)) {
                        Row(
                            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            MeetingCatalog.AGREEMENT_STATUSES
                                .filter { !it.first.equals(row.estado, ignoreCase = true) }
                                .forEach { (key, label) ->
                                    OutlinedButton(
                                        onClick = { onAgreementStatus(row.id, key) },
                                        enabled = !busy,
                                    ) { Text(label) }
                                }
                        }
                    }
                }
            }
        }

        // ── Cerrar la junta ───────────────────────────────────────────────
        if (canLead && !meeting.isClosed) {
            item {
                NxPanelShell {
                    Text("Cerrar la reunión", fontWeight = FontWeight.SemiBold, color = NxColors.Slate)
                    Text(
                        "Queda como REALIZADA y la minuta se guarda en el acta. El servidor no la reabre.",
                        style = MaterialTheme.typography.bodySmall,
                        color = NxColors.Muted,
                    )
                    Spacer(Modifier.height(8.dp))
                    if (showCerrar) {
                        OutlinedTextField(
                            value = minuta,
                            onValueChange = { minuta = it },
                            label = { Text("Minuta (opcional)") },
                            minLines = 3,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        Spacer(Modifier.height(8.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(
                                onClick = {
                                    onClose(minuta)
                                    showCerrar = false
                                },
                                enabled = !busy,
                                colors = ButtonDefaults.buttonColors(containerColor = NxColors.Teal),
                            ) { Text(if (busy) "Cerrando…" else "Cerrar reunión") }
                            OutlinedButton(onClick = { showCerrar = false }) { Text("Cancelar") }
                        }
                    } else {
                        OutlinedButton(onClick = { showCerrar = true }) { Text("Cerrar con minuta") }
                    }
                }
            }
        }

        item { Spacer(Modifier.height(24.dp)) }
    }
}

@Composable
private fun MeetingDetailRow(label: String, value: String) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = 2.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = NxColors.Muted)
        Text(
            value,
            style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.SemiBold),
            color = NxColors.Slate,
        )
    }
}

/**
 * Convocatoria.
 *
 * Elegir el tipo rellena título, hora y agenda con los valores del ritmo —los
 * mismos que pondría el servidor— para que la diaria de las 10:00 se convoque
 * en un toque desde el teléfono, sin que eso impida cambiarlos.
 */
@Composable
internal fun ConvocarForm(
    staff: List<VisibleUserDto>,
    busy: Boolean,
    message: String?,
    onSubmit: (String, String, String, String, String, Set<Long>) -> Unit,
    onCancel: () -> Unit,
) {
    val primerTipo = MeetingCatalog.TYPES.first().first
    var tipo by remember { mutableStateOf(primerTipo) }
    var fecha by remember { mutableStateOf(LocalDate.now().toString()) }
    var titulo by remember { mutableStateOf(MeetingCatalog.defaultTitle(primerTipo)) }
    var hora by remember { mutableStateOf(MeetingCatalog.DEFAULT_TIME[primerTipo].orEmpty()) }
    var agenda by remember { mutableStateOf(MeetingCatalog.suggestedAgenda(primerTipo)) }
    val convocados = remember { mutableStateListOf<Long>() }

    LazyColumn(
        Modifier.fillMaxSize().background(NxColors.Surface).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item { OutlinedButton(onClick = onCancel) { Text("← Cancelar") } }
        item {
            NxSectionHeader(
                "Convocar reunión",
                "El tipo decide el título, la hora y la agenda por defecto.",
            )
        }

        item {
            NxPanelShell {
                Text("Tipo", fontWeight = FontWeight.SemiBold, color = NxColors.Slate)
                Row(
                    Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    MeetingCatalog.TYPES.forEach { (key, label) ->
                        FilterChip(
                            selected = tipo == key,
                            onClick = {
                                tipo = key
                                titulo = MeetingCatalog.defaultTitle(key)
                                hora = MeetingCatalog.DEFAULT_TIME[key].orEmpty()
                                agenda = MeetingCatalog.suggestedAgenda(key)
                            },
                            label = { Text(label) },
                        )
                    }
                }
                Spacer(Modifier.height(10.dp))
                OutlinedTextField(
                    value = fecha,
                    onValueChange = { fecha = it },
                    label = { Text("Fecha (AAAA-MM-DD)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = hora,
                    onValueChange = { hora = it },
                    label = { Text("Hora (HH:MM, opcional)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = titulo,
                    onValueChange = { titulo = it },
                    label = { Text("Título (opcional)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = agenda,
                    onValueChange = { agenda = it },
                    label = { Text("Agenda") },
                    minLines = 4,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }

        item {
            NxPanelShell {
                Text("Convocados (${convocados.size})", fontWeight = FontWeight.SemiBold, color = NxColors.Slate)
                if (staff.isEmpty()) {
                    Text(
                        "No se pudo cargar la lista de personas. Puedes convocar igualmente y pasar lista después.",
                        style = MaterialTheme.typography.bodySmall,
                        color = NxColors.Muted,
                    )
                }
                staff.take(60).forEach { person ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(
                            checked = convocados.contains(person.id),
                            onCheckedChange = { checked ->
                                if (checked) {
                                    if (!convocados.contains(person.id)) convocados.add(person.id)
                                } else {
                                    convocados.remove(person.id)
                                }
                            },
                        )
                        Text(person.nombre, color = NxColors.Slate)
                    }
                }
            }
        }

        message?.let { text ->
            item { Text(text, color = if (text.startsWith("✅")) NxColors.Success else NxColors.Danger) }
        }

        item {
            Button(
                onClick = { onSubmit(tipo, fecha, titulo, hora, agenda, convocados.toSet()) },
                enabled = !busy,
                colors = ButtonDefaults.buttonColors(containerColor = NxColors.Teal),
                modifier = Modifier.fillMaxWidth(),
            ) { Text(if (busy) "Convocando…" else "Convocar") }
        }
        item { Spacer(Modifier.height(24.dp)) }
    }
}
