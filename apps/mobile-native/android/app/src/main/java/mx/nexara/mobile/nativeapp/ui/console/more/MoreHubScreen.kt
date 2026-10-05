package mx.nexara.mobile.nativeapp.ui.console.more

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.FactCheck
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.filled.ReceiptLong
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.Handshake
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
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import mx.nexara.mobile.nativeapp.data.SessionRevision
import mx.nexara.mobile.nativeapp.data.SessionStore
import mx.nexara.mobile.nativeapp.data.SessionUser
import mx.nexara.mobile.nativeapp.data.api.toAbsoluteAssetUrl
import mx.nexara.mobile.nativeapp.ui.console.CoreExtraModule
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTheme
import mx.nexara.mobile.nativeapp.ui.enterprise.NxDimens
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSpacing

/** Icono de cada módulo de «Más». */
fun CoreExtraModule.icon(): ImageVector = when (this) {
    CoreExtraModule.COTIZACIONES -> Icons.Default.RequestQuote
    CoreExtraModule.PROYECTOS -> Icons.Default.Folder
    CoreExtraModule.KPIS_EQUIPO -> Icons.Default.Insights
    CoreExtraModule.ALMACEN -> Icons.Default.Inventory2
    CoreExtraModule.HERRAMIENTAS -> Icons.Default.Build
    CoreExtraModule.VEHICULOS -> Icons.Default.DirectionsCar
    CoreExtraModule.VIATICOS -> Icons.Default.Payments
    CoreExtraModule.GASTOS -> Icons.AutoMirrored.Filled.ReceiptLong
    CoreExtraModule.APROBACIONES -> Icons.AutoMirrored.Filled.FactCheck
    CoreExtraModule.PAGOS_EMPLEADOS -> Icons.Default.AccountBalanceWallet
}

/**
 * «Más»: el resto de NEXARA Core que el rol puede abrir.
 *
 * Todos se abren dentro de la app: los que solo mandaban a la web se quitaron
 * (05-10-2026), así que aquí no hay ficha de «ábrelo en la web».
 */
@Composable
fun MoreHubScreen(
    modules: List<CoreExtraModule>,
    onOpen: (CoreExtraModule) -> Unit,
    onOpenProfile: () -> Unit = {},
    /** Clientes dejó de ser pestaña (v2: Inicio · Actividades · Chat · Asistencia · Más); vive aquí si el rol lo ve. */
    onOpenClientes: (() -> Unit)? = null,
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
    val context = LocalContext.current
    val revision by SessionRevision.valor.collectAsState()
    val user by produceState<SessionUser?>(initialValue = null, revision) {
        value = SessionStore(context).load()
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize().background(NxTheme.colors.surface),
        contentPadding = NxSpacing.ListPadding,
        verticalArrangement = Arrangement.spacedBy(NxSpacing.S),
    ) {
        user?.let { sessionUser ->
            item(key = "profile-header", contentType = "profile") {
                ProfileHeaderCard(user = sessionUser, onClick = onOpenProfile)
            }
        }
        if (onOpenClientes != null) {
            item(key = "header-core", contentType = "header") {
                GroupHeader(title = "Clientes y obra", topPadding = 0.dp)
            }
            item(key = "module-clientes", contentType = "module") {
                HubCard(
                    icon = Icons.Default.Handshake,
                    label = "Clientes",
                    summary = "Padrón por sector: fichas, sucursales y altas.",
                    onClick = onOpenClientes,
                )
            }
        }
        groupsInOrder.forEachIndexed { gi, (group, list) ->
            item(key = "header-${group.name}", contentType = "header") {
                GroupHeader(title = group.title, topPadding = if (gi == 0 && onOpenClientes == null) 0.dp else NxSpacing.M)
            }
            items(list, key = { it.key }, contentType = { "module" }) { module ->
                ExtraCard(module = module, onOpen = onOpen)
            }
        }
    }
}

/** Quién eres, arriba del todo: foto (o iniciales) y nombre — «Más» hace de menú de cuenta. */
@Composable
private fun ProfileHeaderCard(user: SessionUser, onClick: () -> Unit) {
    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(NxDimens.PanelRadius),
        colors = CardDefaults.cardColors(containerColor = NxTheme.colors.card),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            val avatarUrl = user.avatarUrl
            if (!avatarUrl.isNullOrBlank()) {
                AsyncImage(
                    model = toAbsoluteAssetUrl(avatarUrl),
                    contentDescription = user.nombre,
                    modifier = Modifier.size(52.dp).clip(CircleShape).border(2.dp, NxTheme.colors.brand, CircleShape),
                    contentScale = ContentScale.Crop,
                )
            } else {
                val initials = user.nombre.split(" ")
                    .take(2)
                    .mapNotNull { it.firstOrNull()?.uppercaseChar() }
                    .joinToString("")
                    .ifBlank { "?" }
                Box(
                    modifier = Modifier.size(52.dp).clip(CircleShape).background(NxTheme.colors.brand),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(initials, style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold, color = Color.White))
                }
            }
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    user.nombre.ifBlank { "Tu cuenta" },
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                    color = NxTheme.colors.fg,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (user.department.isNotBlank()) {
                    Text(
                        user.department,
                        style = MaterialTheme.typography.bodySmall,
                        color = NxTheme.colors.muted,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            Icon(
                Icons.AutoMirrored.Filled.KeyboardArrowRight,
                contentDescription = null,
                tint = NxTheme.colors.muted,
            )
        }
    }
}

@Composable
private fun GroupHeader(title: String, topPadding: Dp = 0.dp) {
    Text(
        title.uppercase(),
        style = MaterialTheme.typography.labelMedium,
        color = NxTheme.colors.muted,
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = topPadding, bottom = NxSpacing.Xxs, start = NxSpacing.Xs)
            .semantics { heading() },
    )
}

@Composable
private fun ExtraCard(module: CoreExtraModule, onOpen: (CoreExtraModule) -> Unit) {
    HubCard(
        icon = module.icon(),
        label = module.label,
        summary = module.summary,
        onClick = { onOpen(module) },
    )
}

/** Renglón del hub: icono en baldosa suave, nombre, una línea y flecha. */
@Composable
private fun HubCard(
    icon: ImageVector,
    label: String,
    summary: String,
    onClick: () -> Unit,
) {
    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(NxDimens.PanelRadius),
        colors = CardDefaults.cardColors(containerColor = NxTheme.colors.card),
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
                    .background(NxTheme.colors.brandSoft, RoundedCornerShape(NxDimens.ControlRadius)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    icon,
                    contentDescription = null,
                    tint = NxTheme.colors.brandText,
                    modifier = Modifier.size(22.dp),
                )
            }
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    label,
                    style = MaterialTheme.typography.titleSmall,
                    color = NxTheme.colors.fg,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    summary,
                    style = MaterialTheme.typography.bodySmall,
                    color = NxTheme.colors.muted,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Icon(
                Icons.AutoMirrored.Filled.KeyboardArrowRight,
                contentDescription = null,
                tint = NxTheme.colors.muted,
            )
        }
    }
}
