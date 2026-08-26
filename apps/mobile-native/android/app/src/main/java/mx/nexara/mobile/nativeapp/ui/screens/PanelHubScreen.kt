package mx.nexara.mobile.nativeapp.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import mx.nexara.mobile.nativeapp.access.PanelAccessResolver
import mx.nexara.mobile.nativeapp.access.PanelId
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.notifications.NotificationsRepository
import mx.nexara.mobile.nativeapp.data.panel.PanelPreferencesStore
import mx.nexara.mobile.nativeapp.ui.NexaraAppMeta
import mx.nexara.mobile.nativeapp.ui.enterprise.NxAppMetaFooter
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxDimens
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone
import mx.nexara.mobile.nativeapp.ui.util.openExternalUrl

@Composable
fun PanelHubScreen(
    onLogout: () -> Unit,
    contentPadding: PaddingValues = PaddingValues(20.dp),
    onOpenPanel: (PanelId) -> Unit = {},
    onOpenNotifications: () -> Unit = {},
) {
    val context = LocalContext.current
    val repo = remember(context) { AuthRepository(context) }
    val user = repo.loadSession()
    val panels = remember(user) { PanelAccessResolver.accessiblePanels(user) }
    val panelPrefs = remember(context) { PanelPreferencesStore(context) }
    val lastPanel by panelPrefs.lastPanel.collectAsState(initial = null)
    val sortedPanels = remember(panels, lastPanel) {
        val recent = lastPanel?.takeIf { panels.contains(it) } ?: return@remember panels
        listOf(recent) + panels.filter { it != recent }
    }
    val notifRepo = remember(context) { NotificationsRepository(context) }
    var unreadCount by remember { mutableIntStateOf(0) }

    LaunchedEffect(user?.id) {
        unreadCount = runCatching { notifRepo.unreadCount().unreadCount }.getOrDefault(0)
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(contentPadding),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(18.dp),
                colors = CardDefaults.cardColors(containerColor = Color.Transparent),
                elevation = CardDefaults.cardElevation(0.dp),
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(
                            Brush.linearGradient(
                                colors = listOf(NxColors.TealSoft, NxColors.Surface),
                            ),
                        )
                        .padding(16.dp),
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "Panel corporativo",
                                style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold),
                                color = NxColors.Muted,
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = user?.nombre?.ifBlank { user.email } ?: "Sin sesión",
                                style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold),
                                color = NxColors.Slate,
                            )
                            if (!user?.email.isNullOrBlank()) {
                                Text(
                                    text = user!!.email,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = NxColors.Muted,
                                )
                            }
                        }
                        Box(
                            modifier = Modifier
                                .size(46.dp)
                                .clip(CircleShape)
                                .background(NxColors.Teal),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                text = user?.nombre?.firstOrNull()?.uppercase() ?: "N",
                                color = Color.White,
                                style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                            )
                        }
                    }
                }
            }
        }

        if (panels.isEmpty()) {
            item {
                Text(
                    text = "No hay paneles disponibles para tu cuenta.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = NxColors.Muted,
                )
            }
        } else {
            item {
                NxSectionHeader(
                    title = "Tus paneles",
                    subtitle = if (lastPanel != null) "El más reciente aparece primero" else "Selecciona un módulo",
                )
            }
            items(sortedPanels, key = { it.key }) { panel ->
                PanelHubCard(
                    panel = panel,
                    isLastUsed = panel == lastPanel,
                    onClick = { onOpenPanel(panel) },
                )
            }
        }

        item {
            Spacer(modifier = Modifier.height(8.dp))
            OutlinedButton(
                onClick = onOpenNotifications,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("Notificaciones")
                    if (unreadCount > 0) {
                        Box(
                            modifier = Modifier
                                .background(NxColors.Danger, CircleShape)
                                .padding(horizontal = 8.dp, vertical = 2.dp),
                        ) {
                            Text(
                                "$unreadCount",
                                color = Color.White,
                                style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold),
                            )
                        }
                    }
                }
            }
            Spacer(modifier = Modifier.height(8.dp))
            Button(
                onClick = {
                    repo.logout()
                    onLogout()
                },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = NxColors.Danger, contentColor = Color.White),
            ) {
                Text("Cerrar sesión", style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold))
            }
            NxAppMetaFooter(
                modifier = Modifier.padding(top = 8.dp, bottom = 16.dp),
                onOpenPrivacy = { openExternalUrl(context, NexaraAppMeta.PRIVACY_URL) },
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PanelHubCard(
    panel: PanelId,
    isLastUsed: Boolean,
    onClick: () -> Unit,
) {
    val accent = Color(panel.accentArgb)
    Card(
        onClick = onClick,
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 72.dp)
            .semantics {
                contentDescription = buildString {
                    append(panel.displayName)
                    append(", ")
                    append(panel.tagline)
                    if (isLastUsed) append(", usado recientemente")
                }
                role = Role.Button
            },
        shape = RoundedCornerShape(NxDimens.PanelRadius),
        colors = CardDefaults.cardColors(containerColor = NxColors.Card),
        elevation = CardDefaults.cardElevation(NxDimens.PanelElevation),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(52.dp)
                    .clip(RoundedCornerShape(14.dp))
                    .background(
                        Brush.linearGradient(
                            colors = listOf(accent.copy(alpha = 0.18f), accent.copy(alpha = 0.08f)),
                        ),
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Text(panel.icon, fontSize = 26.sp)
            }

            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(
                    text = panel.displayName,
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                    color = NxColors.Slate,
                )
                Text(
                    text = panel.tagline,
                    style = MaterialTheme.typography.bodySmall,
                    color = NxColors.Muted,
                )
                if (isLastUsed) {
                    NxStatusChip("Usado recientemente", NxTone.Brand)
                }
            }

            Icon(
                imageVector = Icons.AutoMirrored.Filled.KeyboardArrowRight,
                contentDescription = null,
                tint = NxColors.Muted,
                modifier = Modifier.size(24.dp),
            )
        }
    }
}

/** @deprecated Usar [PanelAccessResolver.accessiblePanels]. */
@Deprecated("Use PanelAccessResolver", ReplaceWith("PanelAccessResolver.accessiblePanels(user)"))
fun getAccessiblePanels(
    role: String,
    permissions: List<String>,
    isSuperAdmin: Boolean,
    isClient: Boolean,
    isBranchUser: Boolean,
): List<PanelOption> {
    val fakeUser = mx.nexara.mobile.nativeapp.data.SessionUser(
        id = 0,
        nombre = "",
        email = "",
        role = role,
        department = "",
        token = "",
        permissions = permissions,
        isSuperAdmin = isSuperAdmin,
        isClient = isClient,
        isBranchUser = isBranchUser,
    )
    return PanelAccessResolver.accessiblePanels(fakeUser).map {
        PanelOption(it.key, it.icon, it.displayName, it.tagline)
    }
}

data class PanelOption(
    val key: String,
    val icon: String,
    val name: String,
    val description: String,
)
