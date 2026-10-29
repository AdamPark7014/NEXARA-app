package mx.nexara.mobile.nativeapp.ui.console.activities

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.background
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.DirectionsCar
import androidx.compose.material.icons.outlined.Flag
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import mx.nexara.mobile.nativeapp.data.api.TrayectoDto
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.console.CoreActivitiesRepository
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell
import mx.nexara.mobile.nativeapp.util.DeviceLocation

/**
 * Tarjeta «Trayecto» del detalle: «Iniciar trayecto» antes de iniciar la actividad, «Llegué»
 * mientras va en camino y «Regreso a la oficina» después de entregar (`TrayectoRules`). Solo la
 * ve quien hace la actividad. Si la API todavía no tiene el trayecto (o falla), no se pinta.
 */
@Composable
internal fun TrayectoCard(
    activityId: Long,
    miId: Long?,
    iniciada: Boolean,
    entregada: Boolean,
    cancelada: Boolean,
    deOficina: Boolean,
    refreshKey: Any?,
    onAviso: (String) -> Unit,
) {
    val context = LocalContext.current
    val repo = remember(context) { CoreActivitiesRepository(context) }
    val scope = rememberCoroutineScope()
    var tramos by remember(activityId) { mutableStateOf<List<TrayectoDto>?>(null) }
    var tick by remember(activityId) { mutableIntStateOf(0) }
    var enviando by remember(activityId) { mutableStateOf(false) }

    LaunchedEffect(activityId, refreshKey, tick) {
        tramos = runCatching { withContext(Dispatchers.IO) { repo.trayectos(activityId, miId) } }.getOrNull()
    }
    val lista = tramos ?: return
    val estado = TrayectoRules.estado(lista, iniciada = iniciada, entregada = entregada, cancelada = cancelada, deOficina = deOficina)
    if (estado.vacio) return

    /** El punto de salida o de llegada, si hay permiso; sin él el tramo se mide igual. */
    suspend fun punto() = if (DeviceLocation.hasPermission(context)) {
        withTimeoutOrNull(5_000) { DeviceLocation.current(context) }
    } else {
        null
    }

    fun enviar(accion: TrayectoRules.Accion) {
        if (enviando) return
        enviando = true
        scope.launch {
            try {
                val p = punto()
                withContext(Dispatchers.IO) {
                    when (accion) {
                        TrayectoRules.Accion.INICIAR_IDA -> repo.iniciarTrayecto(activityId, TrayectoRules.IDA, p?.lat, p?.lng)
                        TrayectoRules.Accion.REGRESO -> repo.iniciarTrayecto(activityId, TrayectoRules.REGRESO, p?.lat, p?.lng)
                        TrayectoRules.Accion.LLEGUE -> repo.terminarTrayecto(activityId, p?.lat, p?.lng)
                        TrayectoRules.Accion.NINGUNA -> Unit
                    }
                }
                onAviso(
                    when (accion) {
                        TrayectoRules.Accion.INICIAR_IDA -> "Trayecto iniciado"
                        TrayectoRules.Accion.REGRESO -> "Regreso iniciado"
                        else -> "Llegada registrada"
                    },
                )
            } catch (e: Exception) {
                onAviso(e.toUserMessage("No se pudo registrar el trayecto"))
            } finally {
                enviando = false
                tick++
            }
        }
    }

    NxPanelShell(contentPadding = PaddingValues(16.dp)) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            if (estado.titulo != null) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Box(
                        Modifier.size(36.dp).clip(CircleShape).background(NxColors.BrandSoft),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            if (TrayectoRules.abierto(lista)?.tipo == TrayectoRules.REGRESO || estado.accion == TrayectoRules.Accion.REGRESO) {
                                Icons.Outlined.Home
                            } else {
                                Icons.Outlined.DirectionsCar
                            },
                            contentDescription = null,
                            tint = NxColors.BrandDark,
                            modifier = Modifier.size(19.dp),
                        )
                    }
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(estado.titulo, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = NxColors.Slate)
                        estado.detalle?.let { Text(it, fontSize = 13.sp, lineHeight = 18.sp, color = NxColors.Muted) }
                    }
                }
            }
            when (estado.accion) {
                TrayectoRules.Accion.INICIAR_IDA -> TrayectoBoton("Iniciar trayecto", Icons.Outlined.DirectionsCar, true, enviando) {
                    enviar(estado.accion)
                }
                TrayectoRules.Accion.REGRESO -> TrayectoBoton("Regreso a la oficina", Icons.Outlined.Home, true, enviando) {
                    enviar(estado.accion)
                }
                TrayectoRules.Accion.LLEGUE -> TrayectoBoton("Llegué", Icons.Outlined.Flag, false, enviando) {
                    enviar(estado.accion)
                }
                TrayectoRules.Accion.NINGUNA -> Unit
            }
            if (estado.resumen.isNotEmpty()) {
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    if (estado.titulo == null) {
                        Text("Trayecto", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = NxColors.Slate)
                    }
                    estado.resumen.forEach { Text(it, fontSize = 13.sp, color = NxColors.Muted) }
                }
            }
        }
    }
}

@Composable
private fun TrayectoBoton(texto: String, icono: ImageVector, primario: Boolean, enviando: Boolean, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        enabled = !enviando,
        shape = RoundedCornerShape(14.dp),
        colors = if (primario) {
            ButtonDefaults.buttonColors(containerColor = NxColors.Brand, contentColor = Color.White)
        } else {
            ButtonDefaults.buttonColors(containerColor = NxColors.Card, contentColor = NxColors.Slate)
        },
        border = if (primario) null else androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFD5DAE2)),
        modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
    ) {
        if (enviando) {
            CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = if (primario) Color.White else NxColors.Brand)
        } else {
            Icon(icono, contentDescription = null, modifier = Modifier.size(19.dp))
        }
        Spacer(Modifier.width(8.dp))
        Text(texto, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
    }
}
