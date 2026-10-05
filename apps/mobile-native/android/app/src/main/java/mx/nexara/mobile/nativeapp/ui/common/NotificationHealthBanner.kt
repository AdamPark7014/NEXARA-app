package mx.nexara.mobile.nativeapp.ui.common

import android.content.Context
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import mx.nexara.mobile.nativeapp.push.NotificationHealth
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors

/** Problema actual de los avisos del teléfono; se vuelve a revisar al regresar de Ajustes. */
class ProblemaDeAvisos internal constructor(private val context: Context) {
    var actual by mutableStateOf(NotificationHealth.problema(context))
        private set
    private var oculto = false

    fun revisar() {
        actual = if (oculto) null else NotificationHealth.problema(context)
    }

    fun ocultar() {
        oculto = true
        actual = null
    }
}

@Composable
fun rememberProblemaDeAvisos(): ProblemaDeAvisos {
    val context = LocalContext.current
    val estado = remember { ProblemaDeAvisos(context.applicationContext) }
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) estado.revisar()
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }
    return estado
}

/**
 * Aviso cuando el teléfono no dejará que los avisos de NEXARA suenen o lleguen a tiempo,
 * con el botón a la pantalla de Ajustes que lo arregla.
 */
@Composable
fun NotificationHealthBanner(
    problema: NotificationHealth.Problema,
    onOcultar: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val (titulo, texto, boton) = when (problema) {
        NotificationHealth.Problema.AVISOS_APAGADOS -> Triple(
            "Los avisos de NEXARA están apagados",
            "No te llegarán actividades, revisiones ni mensajes. Actívalos en Ajustes.",
            "Activar avisos",
        )
        NotificationHealth.Problema.CANAL_SILENCIADO -> Triple(
            "Tus avisos llegan sin sonido",
            "El teléfono silenció un tipo de aviso de NEXARA. Elige «Sonido y ventana emergente» o importancia «Alta».",
            "Activar sonido",
        )
        NotificationHealth.Problema.BATERIA_RESTRINGIDA -> Triple(
            "Tus avisos pueden llegar tarde",
            "El ahorro de batería tiene a NEXARA restringida. En Batería elige «Sin restricciones».",
            "Abrir ajustes",
        )
    }

    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = NxColors.WarningSoft),
    ) {
        Column(
            Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(titulo, style = MaterialTheme.typography.titleSmall, color = NxColors.Slate)
            Text(texto, style = MaterialTheme.typography.bodySmall, color = NxColors.Muted)
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Button(onClick = {
                    runCatching { context.startActivity(NotificationHealth.ajustes(context, problema)) }
                }) { Text(boton) }
                TextButton(onClick = onOcultar) { Text("Ahora no") }
            }
        }
    }
}
