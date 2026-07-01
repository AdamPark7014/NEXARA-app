package mx.nexara.mobile.nativeapp.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import mx.nexara.mobile.nativeapp.access.PanelAccessResolver
import mx.nexara.mobile.nativeapp.access.PanelId
import mx.nexara.mobile.nativeapp.data.AuthRepository

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

    val slate = Color(0xFF0F172A)
    val sub = Color(0xFF64748B)
    val teal = Color(0xFF0D9488)

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
                                colors = listOf(Color(0xFFE6FFFA), Color(0xFFF8FAFC)),
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
                                color = sub,
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = user?.nombre?.ifBlank { user.email } ?: "Sin sesión",
                                style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold),
                                color = slate,
                            )
                            if (!user?.email.isNullOrBlank()) {
                                Text(
                                    text = user!!.email,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = sub,
                                )
                            }
                        }
                        Box(
                            modifier = Modifier
                                .size(46.dp)
                                .clip(CircleShape)
                                .background(teal),
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
                    color = sub,
                )
            }
        } else {
            items(panels, key = { it.key }) { panel ->
                val accent = Color(panel.accentArgb)
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(14.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    elevation = CardDefaults.cardElevation(1.dp),
                ) {
                    Row(
                        modifier = Modifier.padding(14.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Box(
                            modifier = Modifier
                                .size(44.dp)
                                .clip(RoundedCornerShape(10.dp))
                                .background(accent.copy(alpha = 0.12f)),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(panel.icon)
                        }

                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = panel.displayName,
                                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                                color = slate,
                            )
                            Text(
                                text = panel.tagline,
                                style = MaterialTheme.typography.bodySmall,
                                color = sub,
                            )
                        }

                        Button(
                            onClick = { onOpenPanel(panel) },
                            shape = RoundedCornerShape(10.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = accent, contentColor = Color.White),
                        ) {
                            Text("Abrir")
                        }
                    }
                }
            }
        }

        item {
            Spacer(modifier = Modifier.height(8.dp))
            OutlinedButton(
                onClick = onOpenNotifications,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
            ) {
                Text("Notificaciones")
            }
            Spacer(modifier = Modifier.height(8.dp))
            Button(
                onClick = {
                    repo.logout()
                    onLogout()
                },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFDC2626), contentColor = Color.White),
            ) {
                Text("Cerrar sesión", style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold))
            }
            Spacer(modifier = Modifier.height(24.dp))
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
