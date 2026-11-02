package mx.nexara.mobile.nativeapp.ui.console.inicio

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.time.Instant
import mx.nexara.mobile.nativeapp.data.api.AttendanceRegisterResponse
import mx.nexara.mobile.nativeapp.data.api.RiesgoSalidaDto
import mx.nexara.mobile.nativeapp.ui.console.screens.ConsoleAttendanceViewModel
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTheme

/**
 * Salir de la jornada no es salir de la actividad (Adam, 01-11-2026): «se confunden y marcan salida
 * en asistencia en lugar de salida de su actividad». Mockup aprobado, Programa Velocidad Core Ola 3.
 */
object TerminarJornadaRules {
    /** La propia persona deshace su salida dentro de este tiempo; después, su jefe con motivo. */
    const val VENTANA_DESHACER_MS = 10L * 60_000L

    /** «Si sigues: se detiene el reloj de AN-0368 y queda «No cumplida» porque vence hoy…». */
    fun textoSiSigues(riesgo: RiesgoSalidaDto?): String? {
        val corriendo = riesgo?.corriendo.orEmpty().map { it.folio }.filter { it.isNotBlank() }
        val porCerrar = riesgo?.porCerrar.orEmpty().map { it.folio }.filter { it.isNotBlank() }
        if (corriendo.isEmpty() && porCerrar.isEmpty()) return null
        val partes = mutableListOf<String>()
        if (corriendo.size == 1) partes += "se detiene el reloj de ${corriendo[0]}"
        if (corriendo.size > 1) partes += "se detienen los relojes de ${corriendo.joinToString(", ")}"
        val mismas = corriendo.toSet() == porCerrar.toSet()
        when {
            porCerrar.isEmpty() -> Unit
            mismas && porCerrar.size == 1 -> partes += "queda «No cumplida» porque vence hoy y no la has entregado"
            mismas -> partes += "quedan «No cumplida» porque vencen hoy y no las has entregado"
            porCerrar.size == 1 -> partes += "${porCerrar[0]} queda «No cumplida» porque vence hoy y no la has entregado"
            else -> partes += "${porCerrar.joinToString(", ")} quedan «No cumplida» porque vencen hoy y no las has entregado"
        }
        return "Si sigues: " + partes.joinToString(" y ") + "."
    }

    /** A cuál lleva «Mejor terminar la actividad»: la que corre o, si ninguna, la que vence. */
    fun actividadParaTerminar(riesgo: RiesgoSalidaDto?): Long? =
        (riesgo?.corriendo.orEmpty() + riesgo?.porCerrar.orEmpty()).firstOrNull { it.id > 0 }?.id

    /** Minutos que quedan para deshacerla (al menos 1), o null si ya no se puede. */
    fun minutosParaDeshacer(salidaIso: String?, ahoraMs: Long): Int? {
        val salida = salidaIso?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() } ?: return null
        val pasados = ahoraMs - salida
        if (pasados < 0 || pasados > VENTANA_DESHACER_MS) return null
        return ((VENTANA_DESHACER_MS - pasados + 59_999L) / 60_000L).toInt().coerceAtLeast(1)
    }

    /** Sin señal todavía no se registró: decir «registrada» hacía creer que ya estaba. */
    fun mensajeChecada(type: String, res: AttendanceRegisterResponse): String = when {
        res.queued == true && type == "salida" -> "Sin señal: tu salida se enviará en cuanto vuelva la red"
        res.queued == true -> "Sin señal: tu entrada se enviará en cuanto vuelva la red"
        else -> res.message ?: if (type == "entrada") "Entrada registrada" else "Salida registrada"
    }

    fun mensajeDeshecha(regresadas: List<String?>?): String {
        val folios = regresadas.orEmpty().filterNotNull()
        return when {
            folios.isEmpty() -> "Tu jornada sigue abierta"
            folios.size == 1 -> "Tu jornada sigue abierta y ${folios[0]} ya no queda «No cumplida»"
            else -> "Tu jornada sigue abierta y ${folios.joinToString(", ")} ya no quedan «No cumplida»"
        }
    }
}

/** La hoja del mockup, sin estado propio: para la pantalla y para las capturas en la JVM. */
@Composable
internal fun TerminarJornadaContenido(
    riesgo: RiesgoSalidaDto?,
    cargando: Boolean,
    onTerminarActividad: (() -> Unit)?,
    onConfirmar: () -> Unit,
    onCancelar: () -> Unit,
) {
    val c = NxTheme.colors
    val nota = TerminarJornadaRules.textoSiSigues(riesgo)
    Column(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("¿Terminar tu jornada?", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = c.fg)
        Text(
            if (nota != null) "Es tu salida del día. Tu actividad sigue abierta." else "Es tu salida del día.",
            fontSize = 14.sp,
            color = c.fg2,
        )
        if (cargando) {
            CircularProgressIndicator(
                modifier = Modifier.align(Alignment.CenterHorizontally).padding(4.dp),
                strokeWidth = 2.dp,
                color = c.brand,
            )
        }
        nota?.let {
            Text(
                it,
                fontSize = 13.sp,
                color = c.fg,
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(c.warningSoft)
                    .padding(12.dp),
            )
        }
        if (nota != null && onTerminarActividad != null) {
            Button(
                onClick = onTerminarActividad,
                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = c.brand, contentColor = Color.White),
            ) {
                Text("Mejor terminar la actividad", fontWeight = FontWeight.SemiBold)
            }
            OutlinedButton(
                onClick = onConfirmar,
                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                shape = RoundedCornerShape(12.dp),
            ) {
                Text("Sí, terminar mi jornada", fontWeight = FontWeight.SemiBold, color = c.fg)
            }
        } else {
            Button(
                onClick = onConfirmar,
                enabled = !cargando,
                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = c.brand, contentColor = Color.White),
            ) {
                Text("Sí, terminar mi jornada", fontWeight = FontWeight.SemiBold)
            }
            OutlinedButton(
                onClick = onCancelar,
                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                shape = RoundedCornerShape(12.dp),
            ) {
                Text("Cancelar", fontWeight = FontWeight.SemiBold, color = c.fg)
            }
        }
    }
}

/**
 * Lee qué se detiene y lo dice antes de abrir la cámara. Si no se puede leer (sin señal), se puede
 * salir igual: lo capturado sin conexión no se frena.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun TerminarJornadaHoja(
    vm: ConsoleAttendanceViewModel,
    onTerminarActividad: ((Long) -> Unit)?,
    onConfirmar: () -> Unit,
    onCerrar: () -> Unit,
) {
    var riesgo by remember { mutableStateOf<RiesgoSalidaDto?>(null) }
    var cargando by remember { mutableStateOf(true) }
    LaunchedEffect(Unit) {
        riesgo = vm.riesgoSalida()
        cargando = false
    }
    val actividad = TerminarJornadaRules.actividadParaTerminar(riesgo)
    ModalBottomSheet(onDismissRequest = onCerrar, containerColor = NxTheme.colors.card) {
        TerminarJornadaContenido(
            riesgo = riesgo,
            cargando = cargando,
            onTerminarActividad = if (actividad != null && onTerminarActividad != null) {
                {
                    onCerrar()
                    onTerminarActividad(actividad)
                }
            } else {
                null
            },
            onConfirmar = {
                onCerrar()
                onConfirmar()
            },
            onCancelar = onCerrar,
        )
    }
}
