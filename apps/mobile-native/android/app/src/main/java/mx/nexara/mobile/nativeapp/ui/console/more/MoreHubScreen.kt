package mx.nexara.mobile.nativeapp.ui.console.more

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.FactCheck
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.automirrored.filled.ReceiptLong
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.AccountTree
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.Insights
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.RequestQuote
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import mx.nexara.mobile.nativeapp.ui.console.ConsoleRoutes
import mx.nexara.mobile.nativeapp.ui.console.CoreExtraModule
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxDimens
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPrimaryButton
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSpacing
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone

/** Icono de cada módulo de «Más». */
fun CoreExtraModule.icon(): ImageVector = when (this) {
    CoreExtraModule.EXECUTIVE -> Icons.Default.Insights
    CoreExtraModule.COTIZACIONES -> Icons.Default.RequestQuote
    CoreExtraModule.PROYECTOS -> Icons.Default.Folder
    CoreExtraModule.KPIS_EQUIPO -> Icons.Default.Insights
    CoreExtraModule.ALMACEN -> Icons.Default.Inventory2
    CoreExtraModule.HERRAMIENTAS -> Icons.Default.Build
    CoreExtraModule.VEHICULOS -> Icons.Default.DirectionsCar
    CoreExtraModule.ORGANIGRAMA -> Icons.Default.AccountTree
    CoreExtraModule.VIATICOS -> Icons.Default.Payments
    CoreExtraModule.GASTOS -> Icons.AutoMirrored.Filled.ReceiptLong
    CoreExtraModule.APROBACIONES -> Icons.AutoMirrored.Filled.FactCheck
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
    // Agrupar por «Hoy», «Recursos», «Finanzas», «Gobierno», en ese orden.
    val groupsInOrder = remember(modules) {
        val grouped = modules.groupBy { it.group }
        listOf(
            CoreExtraModule.Group.HOY,
            CoreExtraModule.Group.RECURSOS,
            CoreExtraModule.Group.FINANZAS,
            CoreExtraModule.Group.GOBIERNO,
        ).mapNotNull { g -> grouped[g]?.takeIf { it.isNotEmpty() }?.let { g to it } }
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize().background(NxColors.Surface),
        contentPadding = NxSpacing.ListPadding,
        verticalArrangement = Arrangement.spacedBy(NxSpacing.S),
    ) {
        groupsInOrder.forEachIndexed { gi, (group, list) ->
            item(key = "header-${group.name}", contentType = "header") {
                GroupHeader(title = group.title, topPadding = if (gi == 0) 0.dp else NxSpacing.M)
            }
            items(list, key = { it.key }, contentType = { "module" }) { module ->
                ExtraCard(module = module, onOpen = onOpen)
            }
        }
    }
}

@Composable
private fun GroupHeader(title: String, topPadding: Dp = 0.dp) {
    Text(
        title.uppercase(),
        style = MaterialTheme.typography.labelMedium,
        color = NxColors.Muted,
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = topPadding, bottom = NxSpacing.Xxs, start = NxSpacing.Xs)
            .semantics { heading() },
    )
}

@Composable
private fun ExtraCard(module: CoreExtraModule, onOpen: (CoreExtraModule) -> Unit) {
    val enWeb = !ConsoleRoutes.tienePantallaNativa(module)
    Card(
        onClick = { onOpen(module) },
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(NxDimens.PanelRadius),
        colors = CardDefaults.cardColors(containerColor = NxColors.Card),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 64.dp)
                .padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .background(NxColors.BrandTint, RoundedCornerShape(10.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    module.icon(),
                    contentDescription = null,
                    tint = NxColors.Brand,
                    modifier = Modifier.size(22.dp),
                )
            }
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    module.label,
                    style = MaterialTheme.typography.titleSmall,
                    color = NxColors.Slate,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    module.summary,
                    style = MaterialTheme.typography.bodySmall,
                    color = NxColors.Muted,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (enWeb) {
                NxStatusChip("En la web", NxTone.Neutral)
            }
            Icon(
                Icons.AutoMirrored.Filled.KeyboardArrowRight,
                contentDescription = null,
                tint = NxColors.Muted,
            )
        }
    }
}

/** Módulo que todavía no tiene pantalla en la app: se abre en la web de Core. */
@Composable
fun ModulePlaceholderScreen(module: CoreExtraModule) {
    val context = LocalContext.current
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(NxColors.Surface)
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Box(
            modifier = Modifier
                .size(88.dp)
                .background(NxColors.BrandTint, RoundedCornerShape(24.dp)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                module.icon(),
                contentDescription = null,
                tint = NxColors.Brand,
                modifier = Modifier.size(44.dp),
            )
        }
        Spacer(Modifier.height(18.dp))
        Text(
            module.label,
            style = MaterialTheme.typography.headlineSmall,
            color = NxColors.Slate,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(6.dp))
        Text(
            module.summary,
            style = MaterialTheme.typography.bodyMedium,
            color = NxColors.Muted,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(18.dp))
        Text(
            "Este módulo llegará pronto a la app. Mientras tanto, ábrelo en la web.",
            style = MaterialTheme.typography.bodyMedium,
            color = NxColors.Slate,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(20.dp))
        NxPrimaryButton(
            text = "Abrir en la web",
            onClick = { abrirEnLaWeb(context, module) },
            icon = Icons.AutoMirrored.Filled.OpenInNew,
            modifier = Modifier,
        )
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
