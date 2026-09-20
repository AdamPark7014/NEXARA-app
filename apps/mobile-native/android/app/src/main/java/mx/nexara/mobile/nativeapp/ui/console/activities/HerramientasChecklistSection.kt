package mx.nexara.mobile.nativeapp.ui.console.activities

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.api.HerramientaRequisitoDto
import mx.nexara.mobile.nativeapp.data.api.isForbidden
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.console.CoreActivitiesRepository
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader
import retrofit2.HttpException

/**
 * «Herramientas a ocupar» del detalle de la OT.
 *
 * Regla del dueño: antes de atender la instalación o el servicio se palomea el
 * checklist. Mientras quede un renglón sin palomear, `iniciar` contesta 400 con el
 * texto de [HerramientasChecklistRules.mensajePendiente].
 *
 * No se pinta nada cuando la OT no pide herramientas (o cuando quien mira no la
 * tiene asignada: el API contesta 403).
 */
@Composable
fun HerramientasChecklistSection(
    activityId: Long,
    modifier: Modifier = Modifier,
    /** Cambia para volver a pedir el checklist (p. ej. al recargar el detalle). */
    refreshKey: Int = 0,
) {
    val context = LocalContext.current
    val repo = remember(context) { CoreActivitiesRepository(context) }
    val scope = rememberCoroutineScope()

    var requisitos by remember(activityId) { mutableStateOf<List<HerramientaRequisitoDto>?>(null) }
    var cargando by remember(activityId) { mutableStateOf(true) }
    var error by remember(activityId) { mutableStateOf<String?>(null) }
    var oculta by remember(activityId) { mutableStateOf(false) }
    var guardandoId by remember(activityId) { mutableStateOf<Long?>(null) }
    var recarga by remember(activityId) { mutableIntStateOf(0) }

    LaunchedEffect(activityId, refreshKey, recarga) {
        cargando = true
        error = null
        try {
            val dto = withContext(Dispatchers.IO) { repo.herramientasChecklist(activityId) }
            requisitos = dto.requisitos.orEmpty()
        } catch (e: Exception) {
            // No asignada a mí o sin checklist: no es un error, simplemente no va.
            if (e.isForbidden() || (e as? HttpException)?.code() == 404) {
                oculta = true
            } else {
                error = e.toUserMessage("No se pudo cargar el checklist de herramientas")
            }
        } finally {
            cargando = false
        }
    }

    if (oculta) return
    val lista = requisitos
    if (!cargando && error == null && lista.isNullOrEmpty()) return

    NxPanelShell(modifier = modifier) {
        NxSectionHeader("Herramientas a ocupar")
        when {
            cargando && lista == null -> NxLoadingBlock("Cargando checklist…")
            error != null -> NxErrorBlock(error!!, onRetry = { recarga++ })
            else -> {
                val items = lista.orEmpty()
                val faltan = HerramientasChecklistRules.pendientes(items)
                Spacer(Modifier.height(6.dp))
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        HerramientasChecklistRules.progresoTexto(items),
                        fontSize = 12.5.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (faltan.isEmpty()) {
                            Color(CoreActivityRules.VERDE)
                        } else {
                            Color(CoreActivityRules.NARANJA)
                        },
                    )
                    if (faltan.isEmpty()) {
                        ToneChip("Listo para iniciar", CoreActivityRules.VERDE)
                    }
                }
                Spacer(Modifier.height(8.dp))
                items.forEach { req ->
                    HerramientaRequisitoRow(
                        req = req,
                        guardando = guardandoId == req.id,
                        onPalomear = { ok ->
                            val id = req.id ?: return@HerramientaRequisitoRow
                            scope.launch {
                                guardandoId = id
                                error = null
                                try {
                                    val dto = withContext(Dispatchers.IO) {
                                        repo.palomearHerramienta(activityId, id, ok)
                                    }
                                    requisitos = dto.requisitos.orEmpty()
                                } catch (e: Exception) {
                                    error = e.toUserMessage("No se pudo guardar el palomeo")
                                } finally {
                                    guardandoId = null
                                }
                            }
                        },
                    )
                }
            }
        }
    }
}

/** «2» en vez de «2.0»; los decimales solo aparecen si los hay (metros de cable). */
private fun cantidadTexto(cantidad: Double): String =
    if (cantidad % 1.0 == 0.0) cantidad.toLong().toString() else cantidad.toString()

/** Un renglón: qué es, cómo está y las dos únicas respuestas posibles. */
@Composable
private fun HerramientaRequisitoRow(
    req: HerramientaRequisitoDto,
    guardando: Boolean,
    onPalomear: (Boolean) -> Unit,
) {
    val ok = req.check?.ok
    val estado = when (ok) {
        true -> "Lo traigo" to CoreActivityRules.VERDE
        false -> "Falta" to CoreActivityRules.ROJO
        else -> "Sin revisar" to CoreActivityRules.GRIS
    }
    val detalle = listOfNotNull(
        req.cantidad?.takeIf { it > 0 }?.let { "x${cantidadTexto(it)}" },
        req.herramienta?.serie?.takeIf { it.isNotBlank() }?.let { "Serie $it" },
        req.producto?.sku?.takeIf { it.isNotBlank() },
    ).joinToString(" · ")

    Column(
        Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Spacer(Modifier.height(4.dp))
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(
                    req.descripcion?.takeIf { it.isNotBlank() } ?: "Renglón sin nombre",
                    fontSize = 13.5.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = NxColors.Slate,
                )
                if (detalle.isNotBlank()) {
                    Text(detalle, fontSize = 11.5.sp, color = NxColors.Muted, maxLines = 1)
                }
            }
            ToneChip(estado.first, estado.second)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(
                onClick = { onPalomear(true) },
                enabled = !guardando && ok != true,
                colors = ButtonDefaults.buttonColors(containerColor = Color(CoreActivityRules.VERDE)),
                modifier = Modifier.heightIn(min = 40.dp),
            ) {
                Text("Lo traigo", fontSize = 12.5.sp, fontWeight = FontWeight.Bold)
            }
            OutlinedButton(
                onClick = { onPalomear(false) },
                enabled = !guardando && ok != false,
                modifier = Modifier.heightIn(min = 40.dp),
            ) {
                Text("Falta", fontSize = 12.5.sp, color = Color(CoreActivityRules.ROJO))
            }
        }
        req.check?.nota?.takeIf { it.isNotBlank() }?.let {
            Text(it, fontSize = 11.5.sp, color = NxColors.Muted)
        }
    }
}
