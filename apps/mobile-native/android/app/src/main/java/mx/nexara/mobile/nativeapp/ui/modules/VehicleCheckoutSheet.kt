package mx.nexara.mobile.nativeapp.ui.modules

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import mx.nexara.mobile.nativeapp.data.api.VehicleControlDto
import mx.nexara.mobile.nativeapp.ui.common.CapturedMedia
import mx.nexara.mobile.nativeapp.ui.common.ImageDataUrl
import mx.nexara.mobile.nativeapp.ui.common.MediaPickerBar
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell

enum class VehicleCheckoutMode { SALIDA, DEVOLUCION }

private data class VehiclePhotoSlot(val key: String, val label: String)

private val INTERNA_SLOTS = listOf(
    VehiclePhotoSlot("interna-0", "Asiento conductor"),
    VehiclePhotoSlot("interna-1", "Tablero / consola"),
    VehiclePhotoSlot("interna-2", "Asientos traseros"),
    VehiclePhotoSlot("interna-3", "Maletero / carga"),
)

private val EXTERNA_SLOTS = listOf(
    VehiclePhotoSlot("externa-0", "Frente"),
    VehiclePhotoSlot("externa-1", "Trasera"),
    VehiclePhotoSlot("externa-2", "Lateral izquierdo"),
    VehiclePhotoSlot("externa-3", "Lateral derecho"),
)

private val ODOMETRO_SLOT = VehiclePhotoSlot("odometro", "Odómetro / tablero")

val VEHICLE_CHECKOUT_SLOT_ORDER: List<String> =
    (INTERNA_SLOTS + EXTERNA_SLOTS + listOf(ODOMETRO_SLOT)).map { it.key }

fun VehicleControlDto.hasFotosSalida(): Boolean = fotosSalida != null

fun VehicleControlDto.hasFotosDevolucion(): Boolean = fotosDevolucion != null

fun VehicleControlDto.canStartSalida(): Boolean =
    estatusAprobacion.equals("Aprobado", true) && !hasFotosSalida()

fun VehicleControlDto.canEndDevolucion(): Boolean =
    hasFotosSalida() &&
        entregaEstatus.equals("En uso", true) &&
        !hasFotosDevolucion()

@Composable
fun VehicleCheckoutSheet(
    mode: VehicleCheckoutMode,
    saving: Boolean,
    formError: String?,
    onDismiss: () -> Unit,
    onSubmit: (
        odometroKm: Double,
        combustiblePct: Double,
        photoParts: List<Pair<String, ByteArray>>,
    ) -> Unit,
) {
    val context = LocalContext.current
    var odometroKmText by remember { mutableStateOf("") }
    var combustiblePctText by remember { mutableStateOf("") }
    var localError by remember { mutableStateOf<String?>(null) }
    var photos by remember { mutableStateOf<Map<String, CapturedMedia>>(emptyMap()) }
    var activeSlot by remember { mutableStateOf<String?>(null) }

    fun validateAndSubmit() {
        localError = null
        val km = odometroKmText.toDoubleOrNull()
        val fuel = combustiblePctText.toDoubleOrNull()
        if (km == null || km <= 0) {
            localError = "Anota el kilometraje del odómetro"
            return
        }
        if (fuel == null || fuel < 0 || fuel > 100) {
            localError = "Indica el nivel de combustible (0–100%)"
            return
        }
        for (key in VEHICLE_CHECKOUT_SLOT_ORDER) {
            if (photos[key] == null) {
                localError = "Debes subir las 4 fotos internas, 4 externas y la foto del odómetro"
                return
            }
        }
        val parts = VEHICLE_CHECKOUT_SLOT_ORDER.mapNotNull { key ->
            val media = photos[key] ?: return@mapNotNull null
            ImageDataUrl.jpegBytesFromCaptured(context, media, "$key.jpg")
        }
        if (parts.size != VEHICLE_CHECKOUT_SLOT_ORDER.size) {
            localError = "No se pudieron procesar todas las fotos — intenta de nuevo"
            return
        }
        onSubmit(km, fuel, parts)
    }

    NxPanelShell {
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(vertical = 4.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(
                if (mode == VehicleCheckoutMode.SALIDA) {
                    "Registro al recibir el vehículo"
                } else {
                    "Registro al entregar el vehículo"
                },
                fontWeight = FontWeight.Bold,
            )

            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = odometroKmText,
                    onValueChange = { odometroKmText = it.filter { c -> c.isDigit() || c == '.' } },
                    label = { Text("Kilometraje (manual) *") },
                    singleLine = true,
                    modifier = Modifier.weight(1f),
                )
                OutlinedTextField(
                    value = combustiblePctText,
                    onValueChange = { combustiblePctText = it.filter { c -> c.isDigit() || c == '.' } },
                    label = { Text("Combustible (% tanque) *") },
                    singleLine = true,
                    modifier = Modifier.weight(1f),
                )
            }

            Text("4 fotos internas *", fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.labelLarge)
            INTERNA_SLOTS.forEach { slot ->
                VehiclePhotoSlotRow(
                    slot = slot,
                    captured = photos[slot.key],
                    expanded = activeSlot == slot.key,
                    onExpand = { activeSlot = if (activeSlot == slot.key) null else slot.key },
                    onPicked = { media ->
                        photos = photos + (slot.key to media)
                        activeSlot = null
                    },
                )
            }

            Text("4 fotos externas (cada extremo) *", fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.labelLarge)
            EXTERNA_SLOTS.forEach { slot ->
                VehiclePhotoSlotRow(
                    slot = slot,
                    captured = photos[slot.key],
                    expanded = activeSlot == slot.key,
                    onExpand = { activeSlot = if (activeSlot == slot.key) null else slot.key },
                    onPicked = { media ->
                        photos = photos + (slot.key to media)
                        activeSlot = null
                    },
                )
            }

            Text("Foto del odómetro *", fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.labelLarge)
            VehiclePhotoSlotRow(
                slot = ODOMETRO_SLOT,
                captured = photos[ODOMETRO_SLOT.key],
                expanded = activeSlot == ODOMETRO_SLOT.key,
                onExpand = { activeSlot = if (activeSlot == ODOMETRO_SLOT.key) null else ODOMETRO_SLOT.key },
                onPicked = { media ->
                    photos = photos + (ODOMETRO_SLOT.key to media)
                    activeSlot = null
                },
            )

            (formError ?: localError)?.let {
                Text(it, color = NxColors.Danger, style = MaterialTheme.typography.bodySmall)
            }

            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = onDismiss, enabled = !saving, modifier = Modifier.weight(1f)) {
                    Text("Cancelar")
                }
                Button(
                    onClick = { validateAndSubmit() },
                    enabled = !saving,
                    modifier = Modifier.weight(1f),
                ) {
                    Text(
                        when {
                            saving -> "Enviando…"
                            mode == VehicleCheckoutMode.SALIDA -> "Confirmar recepción"
                            else -> "Confirmar entrega"
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun VehiclePhotoSlotRow(
    slot: VehiclePhotoSlot,
    captured: CapturedMedia?,
    expanded: Boolean,
    onExpand: () -> Unit,
    onPicked: (CapturedMedia) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        OutlinedButton(onClick = onExpand, modifier = Modifier.fillMaxWidth()) {
            Text(
                "${slot.label} · ${if (captured != null) "✓" else "Toca para foto"}",
                style = MaterialTheme.typography.bodySmall,
            )
        }
        if (expanded) {
            MediaPickerBar(
                onPicked = { picked -> picked.firstOrNull()?.let(onPicked) },
                allowCamera = true,
                allowGallery = true,
                allowDocuments = false,
            )
        }
    }
}
