package mx.nexara.mobile.nativeapp.ui.console.more

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.AccountTree
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.FactCheck
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.Insights
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.ReceiptLong
import androidx.compose.material.icons.filled.RequestQuote
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import mx.nexara.mobile.nativeapp.ui.console.ConsoleRoutes
import mx.nexara.mobile.nativeapp.ui.console.CoreExtraModule
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone

/** Icono de cada módulo de «Más». */
fun CoreExtraModule.icon(): ImageVector = when (this) {
    CoreExtraModule.COTIZACIONES -> Icons.Default.RequestQuote
    CoreExtraModule.PROYECTOS -> Icons.Default.Folder
    CoreExtraModule.KPIS_EQUIPO -> Icons.Default.Insights
    CoreExtraModule.ALMACEN -> Icons.Default.Inventory2
    CoreExtraModule.HERRAMIENTAS -> Icons.Default.Build
    CoreExtraModule.VEHICULOS -> Icons.Default.DirectionsCar
    CoreExtraModule.ORGANIGRAMA -> Icons.Default.AccountTree
    CoreExtraModule.VIATICOS -> Icons.Default.Payments
    CoreExtraModule.GASTOS -> Icons.Default.ReceiptLong
    CoreExtraModule.APROBACIONES -> Icons.Default.FactCheck
    CoreExtraModule.PAGOS_EMPLEADOS -> Icons.Default.AccountBalanceWallet
    CoreExtraModule.DOCUMENTOS -> Icons.Default.Description
}

/**
 * «Más»: el resto de NEXARA Core que el rol puede abrir.
 *
 * Los que ya tienen pantalla nativa se abren dentro de la app; los que no,
 * siguen cayendo en [ModulePlaceholderScreen]. La lista lo dice antes de que se
 * toque, con una etiqueta «En la web» en los que todavía sacan al navegador: de
 * lo contrario, dos entradas iguales hacen dos cosas muy distintas y no hay
 * forma de saberlo hasta después.
 */
@Composable
fun MoreHubScreen(
    modules: List<CoreExtraModule>,
    onOpen: (CoreExtraModule) -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        items(modules, key = { it.key }) { module ->
            Card(
                modifier = Modifier.fillMaxWidth().clickable { onOpen(module) },
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    Icon(
                        module.icon(),
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(28.dp),
                    )
                    Column(modifier = Modifier.weight(1f)) {
                        Text(module.label, style = MaterialTheme.typography.titleMedium)
                        Text(
                            module.summary,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    if (!ConsoleRoutes.tienePantallaNativa(module)) {
                        NxStatusChip("En la web", NxTone.Neutral)
                    }
                    Icon(
                        Icons.AutoMirrored.Filled.KeyboardArrowRight,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

/** Módulo que todavía no tiene pantalla en la app: se abre en la web de Core. */
@Composable
fun ModulePlaceholderScreen(module: CoreExtraModule) {
    val context = LocalContext.current
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(
            module.icon(),
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(56.dp),
        )
        Spacer(Modifier.height(14.dp))
        Text(module.label, style = MaterialTheme.typography.headlineSmall, textAlign = TextAlign.Center)
        Spacer(Modifier.height(6.dp))
        Text(
            module.summary,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(18.dp))
        Text(
            "Disponible pronto en la app — ábrelo en la web",
            style = MaterialTheme.typography.bodyLarge,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(18.dp))
        Button(onClick = { abrirEnLaWeb(context, module) }) {
            Icon(Icons.Default.OpenInNew, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(Modifier.size(8.dp))
            Text("Abrir en la web")
        }
    }
}

private fun abrirEnLaWeb(context: android.content.Context, module: CoreExtraModule) {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(module.webUrl)).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    // Sin navegador instalado no se cae la app: simplemente no pasa nada.
    runCatching { context.startActivity(intent) }.recoverCatching { e ->
        if (e !is ActivityNotFoundException) throw e
    }
}
