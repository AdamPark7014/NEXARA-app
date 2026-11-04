package mx.nexara.mobile.nativeapp.ui.console.inicio

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import mx.nexara.mobile.nativeapp.data.api.ArrancadaDto
import mx.nexara.mobile.nativeapp.data.api.PendienteDto
import mx.nexara.mobile.nativeapp.data.api.QueSigueDto
import mx.nexara.mobile.nativeapp.data.api.SugerenciaDto
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.console.QueSigueRepository
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTheme
import mx.nexara.mobile.nativeapp.ui.enterprise.nxFlotante

/**
 * «¿Qué sigue?» y Mis pendientes (Velocidad Core, Ola 6): en Mi día, cuando no traes nada corriendo.
 * «Empezar» crea la actividad a tu nombre y arranca el reloj, sin escribir nada.
 */
@Composable
internal fun QueSigueSection(
    onOpenActivity: (Long) -> Unit,
    onOpenActividades: () -> Unit,
) {
    val context = LocalContext.current
    val repo = remember { QueSigueRepository(context.applicationContext) }
    val scope = rememberCoroutineScope()
    var datos by remember { mutableStateOf<QueSigueDto?>(null) }
    var pendientes by remember { mutableStateOf<List<PendienteDto>>(emptyList()) }
    var texto by remember { mutableStateOf("") }
    var ocupado by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    suspend fun recargar() {
        datos = repo.queSigue()
        pendientes = repo.pendientes()
    }

    LaunchedEffect(Unit) {
        try {
            recargar()
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            // Sin red o con una API vieja, esta parte no estorba: el resto de Mi día sigue.
        }
    }

    fun correr(clave: String, porDefecto: String, accion: suspend () -> Unit) {
        scope.launch {
            ocupado = clave
            error = null
            try {
                accion()
                recargar()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                error = e.toUserMessage(porDefecto)
                runCatching { recargar() }
            } finally {
                ocupado = null
            }
        }
    }

    fun arrancar(clave: String, accion: suspend () -> ArrancadaDto) {
        scope.launch {
            ocupado = clave
            error = null
            try {
                val r = accion()
                onOpenActivity(r.activityId)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                error = e.toUserMessage("No se pudo empezar")
                runCatching { recargar() }
            } finally {
                ocupado = null
            }
        }
    }

    val d = datos ?: return
    if (!d.aplica) return
    val c = NxTheme.colors
    val shape = RoundedCornerShape(22.dp)
    val trabado = ocupado != null

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Column(
            modifier = Modifier.fillMaxWidth().nxFlotante(shape).clip(shape).background(c.card).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text("¿Qué sigue?", fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = c.fg)
            error?.let { Text(it, fontSize = 13.sp, color = c.danger) }
            d.sugerencias.forEach { s ->
                SugerenciaFila(
                    s = s,
                    enabled = !trabado,
                    onEmpezar = { arrancar(s.clave) { repo.empezar(s.clave) } },
                    onActividad = { QueSigueRules.actividadDe(s.href)?.let(onOpenActivity) },
                    onActividades = onOpenActividades,
                )
            }
            d.resumen?.let { Text(it, fontSize = 13.sp, color = c.muted) }
        }

        Column(
            modifier = Modifier.fillMaxWidth().nxFlotante(shape).clip(shape).background(c.card).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text("Mis pendientes", fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = c.fg)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = texto,
                    onValueChange = { texto = it.take(QueSigueRules.LARGO_PENDIENTE) },
                    placeholder = { Text("Anota algo para no olvidarlo…") },
                    singleLine = true,
                    modifier = Modifier.weight(1f),
                )
                TextButton(
                    enabled = !trabado && QueSigueRules.pendienteValido(texto),
                    onClick = {
                        val limpio = texto.trim()
                        correr("agregar", "No se pudo guardar tu pendiente") {
                            repo.agregar(limpio)
                            texto = ""
                        }
                    },
                ) { Text("Agregar") }
            }
            if (pendientes.isEmpty()) {
                Text(
                    "Lo que anotes aquí solo lo ves tú. Palomea lo que ya hiciste, o hazlo actividad con un toque.",
                    fontSize = 13.sp,
                    color = c.muted,
                )
            }
            pendientes.forEach { p ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(
                        checked = false,
                        enabled = !trabado,
                        onCheckedChange = { correr("hecho:${p.id}", "No se pudo palomear") { repo.palomear(p.id) } },
                    )
                    Text(p.texto, fontSize = 14.sp, color = c.fg, modifier = Modifier.weight(1f))
                    TextButton(
                        enabled = !trabado,
                        onClick = { arrancar("empezar:${p.id}") { repo.empezarPendiente(p.id) } },
                    ) { Text("Empezar") }
                    TextButton(
                        enabled = !trabado,
                        onClick = { correr("borrar:${p.id}", "No se pudo borrar") { repo.borrar(p.id) } },
                    ) { Text("Borrar", color = c.muted) }
                }
            }
        }
    }
}

@Composable
private fun SugerenciaFila(
    s: SugerenciaDto,
    enabled: Boolean,
    onEmpezar: () -> Unit,
    onActividad: () -> Unit,
    onActividades: () -> Unit,
) {
    val c = NxTheme.colors
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(s.titulo, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = c.fg)
            s.detalle?.let { Text(it, fontSize = 12.5.sp, color = c.muted) }
        }
        when (QueSigueRules.botonDe(s)) {
            QueSigueRules.Boton.EMPEZAR ->
                if (s.tipo == "fija") {
                    OutlinedButton(enabled = enabled, onClick = onEmpezar) { Text("Empezar") }
                } else {
                    Button(
                        enabled = enabled,
                        onClick = onEmpezar,
                        colors = ButtonDefaults.buttonColors(containerColor = c.brand),
                    ) { Text("Empezar") }
                }
            QueSigueRules.Boton.ABRIR_ACTIVIDAD -> TextButton(enabled = enabled, onClick = onActividad) { Text("Abrir") }
            QueSigueRules.Boton.ABRIR_ACTIVIDADES -> TextButton(enabled = enabled, onClick = onActividades) { Text("Abrir") }
            QueSigueRules.Boton.NINGUNO -> Unit
        }
    }
}
