package mx.nexara.mobile.nativeapp.ui.console.herramientas

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import mx.nexara.mobile.nativeapp.access.CoreKeys
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.SessionRevision
import mx.nexara.mobile.nativeapp.data.api.HerramientaPorCodigoDto
import mx.nexara.mobile.nativeapp.data.api.isForbidden
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.console.EscaneoRepository
import mx.nexara.mobile.nativeapp.ui.console.CoreMenu
import mx.nexara.mobile.nativeapp.ui.console.more.EscanerDeCodigos
import mx.nexara.mobile.nativeapp.ui.console.more.EscaneoRules
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone

private fun Throwable.mensajeHerramienta(accion: String, fallback: String): String =
    if (isForbidden()) EscaneoRules.textoSinPermiso(accion, toUserMessage(fallback)) else toUserMessage(fallback)

/**
 * Escáner de etiquetas de herramienta (Code 128 con la nomenclatura interna, p. ej.
 * `MUL-12345`): enseña la herramienta, quién la tiene y, si hay un préstamo aprobado
 * o en uso, deja registrar la salida o la entrada. Entregar y recibir son de almacén
 * (`tools.manage`): a los demás el API contesta 403 y aquí se explica.
 *
 * Quien puede abrir Almacén lee aquí también artículos (es el mismo escáner,
 * [EscanerDeCodigos]); se relee con la sesión, así que si le dan o quitan Almacén
 * cambia sin volver a entrar.
 */
@Composable
fun EscanerDeHerramientas(onMovimiento: () -> Unit, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val revision by SessionRevision.valor.collectAsState()
    val puedeAlmacen = remember(context, revision) {
        CoreMenu.canOpenExtra(AuthRepository(context).loadSession(), CoreKeys.ALMACEN)
    }
    EscanerDeCodigos(enAlmacen = false, puedeAlmacen = puedeAlmacen, onMovimiento = onMovimiento, modifier = modifier)
}

@Composable
internal fun HerramientaEscaneada(r: HerramientaPorCodigoDto) {
    Text(
        EscaneoRules.nombreHerramienta(r),
        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
        color = NxColors.Slate,
    )
    Text(
        listOfNotNull(
            r.codigo?.takeIf { it.isNotBlank() },
            r.item?.serialNumber?.takeIf { it.isNotBlank() }?.let { "Serie $it" },
        ).joinToString(" · "),
        style = MaterialTheme.typography.labelMedium,
        color = NxColors.Muted,
    )
    val tono = when (r.item?.status) {
        "AVAILABLE" -> NxTone.Success
        "IN_REPAIR" -> NxTone.Warning
        "RETIRED" -> NxTone.Danger
        else -> NxTone.Info
    }
    NxStatusChip(EscaneoRules.estadoHerramienta(r.item?.status), tono)
    Text(EscaneoRules.estadoPrestamo(r.prestamo?.status), style = MaterialTheme.typography.bodyMedium, color = NxColors.Slate)
    EscaneoRules.quienLaTiene(r)?.let {
        Text(it, style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold), color = NxColors.Slate)
    }
    // Es una fecha sin hora («2026-10-08»): leerla como instante UTC la pintaba un día antes en México.
    r.prestamo?.expectedReturnDate?.let { HerramientasRules.fechaCorta(it) }?.takeIf { it.isNotEmpty() }?.let {
        Text("Devolución esperada: $it", style = MaterialTheme.typography.labelMedium, color = NxColors.Muted)
    }
    if (r.esMia == true) {
        Text("Está a tu nombre.", style = MaterialTheme.typography.labelMedium, color = NxColors.Muted)
    }
}

@Composable
internal fun AccionDeHerramienta(
    r: HerramientaPorCodigoDto,
    repo: EscaneoRepository,
    onHecho: (String) -> Unit,
) {
    val accion = EscaneoRules.accion(r) ?: return
    val prestamoId = r.prestamo?.id ?: return
    val scope = rememberCoroutineScope()
    var codigoRecogida by remember(prestamoId) { mutableStateOf("") }
    var danio by remember(prestamoId) { mutableStateOf("") }
    var guardando by remember { mutableStateOf(false) }
    var error by remember(prestamoId) { mutableStateOf<String?>(null) }

    HorizontalDivider()
    when (accion) {
        EscaneoRules.AccionHerramienta.ENTREGAR -> {
            Text(
                "Para entregarla, teclea el código de recolección que enseña quien la recoge.",
                style = MaterialTheme.typography.labelMedium,
                color = NxColors.Muted,
            )
            if (r.prestamo.vencido == true) {
                Text(
                    "El código de recolección ya venció: hay que generar otro en la web.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = NxColors.Danger,
                )
            }
            OutlinedTextField(
                value = codigoRecogida,
                onValueChange = { codigoRecogida = it.take(12) },
                label = { Text("Código de recolección") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
        }
        EscaneoRules.AccionHerramienta.RECIBIR -> {
            OutlinedTextField(
                value = danio,
                onValueChange = { danio = it.take(500) },
                label = { Text("¿Llegó con daño? Descríbelo (opcional)") },
                supportingText = { Text("Con daño queda en reparación.") },
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
    error?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = NxColors.Danger) }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Button(
            onClick = {
                scope.launch {
                    guardando = true
                    error = null
                    try {
                        val mensaje = when (accion) {
                            EscaneoRules.AccionHerramienta.ENTREGAR -> {
                                repo.entregarHerramienta(prestamoId, codigoRecogida)
                                "Salida registrada: ${EscaneoRules.nombreHerramienta(r)}."
                            }
                            EscaneoRules.AccionHerramienta.RECIBIR -> {
                                repo.recibirHerramienta(prestamoId, danio)
                                if (danio.isBlank()) {
                                    "Entrada registrada: ${EscaneoRules.nombreHerramienta(r)}."
                                } else {
                                    "Entrada registrada con daño: queda en reparación."
                                }
                            }
                        }
                        onHecho(mensaje)
                    } catch (e: Exception) {
                        error = e.mensajeHerramienta("entregar o recibir herramientas", "No se pudo registrar")
                    } finally {
                        guardando = false
                    }
                }
            },
            enabled = !guardando,
            colors = ButtonDefaults.buttonColors(containerColor = NxColors.Brand),
            modifier = Modifier.weight(1f).heightIn(min = 52.dp),
        ) { Text(if (guardando) "Registrando…" else accion.etiqueta, fontWeight = FontWeight.Bold) }
    }
}
