package mx.nexara.mobile.nativeapp.ui.console.pagos

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import mx.nexara.mobile.nativeapp.data.api.PagoEmpleadoDto
import mx.nexara.mobile.nativeapp.ui.common.GeoPhoto
import mx.nexara.mobile.nativeapp.ui.common.LiveCameraCaptureDialog
import mx.nexara.mobile.nativeapp.ui.console.activities.DatePickerField
import mx.nexara.mobile.nativeapp.ui.console.herramientas.AlturaToque
import mx.nexara.mobile.nativeapp.ui.console.herramientas.BotonDeHoja
import mx.nexara.mobile.nativeapp.ui.console.herramientas.CampoDeFoto
import mx.nexara.mobile.nativeapp.ui.console.viaticos.AsignarViaticoRules
import mx.nexara.mobile.nativeapp.ui.console.viaticos.CampoImporte
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxDenseSectionHeader
import mx.nexara.mobile.nativeapp.ui.enterprise.NxFormTextField
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSearchField

/** A quién, cuánto y que genera la póliza: lo último que se lee antes de mover dinero. */
@Composable
internal fun DialogoMarcarPagado(
    pago: PagoEmpleadoDto,
    enviando: Boolean,
    error: String?,
    onCerrar: () -> Unit,
    onConfirmar: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = { if (!enviando) onCerrar() },
        title = {
            Text(
                "¿Marcar como pagado?",
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                color = NxColors.Slate,
            )
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(
                    PagosRules.confirmacionPago(pago),
                    style = MaterialTheme.typography.bodyMedium,
                    color = NxColors.Slate,
                )
                error?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = NxColors.Danger) }
            }
        },
        confirmButton = {
            Button(
                onClick = onConfirmar,
                enabled = !enviando,
                colors = ButtonDefaults.buttonColors(containerColor = NxColors.Brand),
                modifier = Modifier.heightIn(min = AlturaToque),
            ) { Text(if (enviando) "Enviando…" else "Sí, marcar pagado", fontWeight = FontWeight.Bold) }
        },
        dismissButton = {
            TextButton(onClick = onCerrar, enabled = !enviando) { Text("Mejor no") }
        },
    )
}

/**
 * «Registrar pago»: persona, importe, concepto, periodo, nota y comprobante en foto. Se crea en
 * borrador: el dinero sale hasta que alguien lo marca pagado. La foto es de la cámara en vivo.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun HojaRegistrarPago(
    personas: List<Pair<Long, String>>,
    enviando: Boolean,
    error: String?,
    onRegistrar: (
        personaId: Long,
        importe: String,
        concepto: String,
        desde: String,
        hasta: String,
        nota: String,
        comprobante: GeoPhoto?,
    ) -> Unit,
    onCerrar: () -> Unit,
) {
    val estadoHoja = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var consulta by remember { mutableStateOf("") }
    var personaId by remember { mutableStateOf<Long?>(null) }
    var importe by remember { mutableStateOf("") }
    var concepto by remember { mutableStateOf("") }
    var desde by remember { mutableStateOf("") }
    var hasta by remember { mutableStateOf("") }
    var nota by remember { mutableStateOf("") }
    var comprobante by remember { mutableStateOf<GeoPhoto?>(null) }
    var camaraAbierta by remember { mutableStateOf(false) }

    val persona = personas.firstOrNull { it.first == personaId }
    val falta = PagosRules.faltaParaRegistrar(personaId, importe, concepto, desde, hasta)

    ModalBottomSheet(onDismissRequest = { if (!enviando) onCerrar() }, sheetState = estadoHoja) {
        Column(
            modifier = Modifier
                .verticalScroll(rememberScrollState())
                .padding(start = 20.dp, end = 20.dp, bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text(
                "Registrar pago",
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                color = NxColors.Slate,
            )

            NxDenseSectionHeader(title = "¿A quién?")
            if (persona != null) {
                FilterChip(
                    selected = true,
                    onClick = { personaId = null },
                    enabled = !enviando,
                    label = { Text(persona.second) },
                    modifier = Modifier.fillMaxWidth().heightIn(min = AlturaToque),
                )
            } else {
                NxSearchField(value = consulta, onValueChange = { consulta = it }, placeholder = "Buscar persona")
                if (personas.isEmpty() && error == null) {
                    Text(
                        "Buscando al personal…",
                        style = MaterialTheme.typography.bodySmall,
                        color = NxColors.Muted,
                    )
                }
                AsignarViaticoRules.filtrarPersonas(personas, consulta).forEach { (id, nombre) ->
                    Text(
                        nombre,
                        style = MaterialTheme.typography.bodyMedium,
                        color = NxColors.Slate,
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { personaId = id }
                            .padding(vertical = 10.dp),
                    )
                }
            }

            CampoImporte(
                valor = importe,
                onValorChange = { importe = it },
                label = "¿Cuánto?",
                enabled = !enviando,
            )
            NxFormTextField(
                value = concepto,
                onValueChange = { concepto = it.take(255) },
                label = "Concepto",
            )
            DatePickerField(label = "Periodo desde", value = desde, onValueChange = { desde = it })
            DatePickerField(label = "Periodo hasta", value = hasta, onValueChange = { hasta = it })
            NxFormTextField(
                value = nota,
                onValueChange = { nota = it.take(500) },
                label = "Nota (opcional)",
                singleLine = false,
                minLines = 2,
                imeAction = ImeAction.Done,
            )
            CampoDeFoto(
                titulo = "Comprobante (opcional)",
                foto = comprobante,
                enabled = !enviando,
                onTomar = { camaraAbierta = true },
            )

            error?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = NxColors.Danger) }

            BotonDeHoja(
                texto = "Registrar pago",
                enviando = enviando,
                habilitado = falta == null,
                onClick = {
                    val id = personaId
                    if (falta == null && id != null) {
                        onRegistrar(id, importe, concepto, desde, hasta, nota, comprobante)
                    }
                },
            )
            Text(
                falta ?: "Queda en borrador: el dinero sale hasta que lo marques pagado.",
                style = MaterialTheme.typography.bodySmall,
                color = if (falta != null) NxColors.Warning else NxColors.Muted,
            )
            TextButton(
                onClick = onCerrar,
                enabled = !enviando,
                modifier = Modifier.fillMaxWidth().heightIn(min = AlturaToque),
            ) { Text("Cancelar") }
        }
    }

    if (camaraAbierta) {
        LiveCameraCaptureDialog(
            title = "Comprobante del pago",
            requireLocation = false,
            captureLocation = false,
            subtitle = "Encuadra el comprobante completo y que se lea el importe.",
            onCaptured = { foto ->
                comprobante = foto
                camaraAbierta = false
            },
            onDismiss = { camaraAbierta = false },
        )
    }
}
