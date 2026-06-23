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
import mx.nexara.mobile.nativeapp.data.AuthRepository

@Composable
fun PanelHubScreen(
    onLogout: () -> Unit,
    contentPadding: PaddingValues = PaddingValues(20.dp),
    onOpenConsole: () -> Unit = {},
    onOpenTickets: () -> Unit = {},
    onOpenVentas: () -> Unit = {},
    onOpenContabilidad: () -> Unit = {},
    onOpenWeb: () -> Unit = {},
    onOpenNotifications: () -> Unit = {},
) {
    val context = LocalContext.current
    val repo = remember(context) { AuthRepository(context) }
    val user = repo.loadSession()
    val panels = remember(user) {
        getAccessiblePanels(
            role = user?.role ?: "",
            permissions = user?.permissions ?: emptyList(),
            isSuperAdmin = user?.isSuperAdmin ?: false,
            isClient = user?.isClient ?: false,
            isBranchUser = user?.isBranchUser ?: false,
        )
    }

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
                                .background(Color(0xFFCCFBF1)),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(panel.icon)
                        }

                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = panel.name,
                                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                                color = slate,
                            )
                            Text(
                                text = panel.description,
                                style = MaterialTheme.typography.bodySmall,
                                color = sub,
                            )
                        }

                        Button(
                            onClick = {
                                when (panel.key) {
                                    "console" -> onOpenConsole()
                                    "tickets" -> onOpenTickets()
                                    "ventas" -> onOpenVentas()
                                    "contabilidad" -> onOpenContabilidad()
                                    "web" -> onOpenWeb()
                                }
                            },
                            shape = RoundedCornerShape(10.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = teal, contentColor = Color.White),
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

data class PanelOption(
    val key: String,
    val icon: String,
    val name: String,
    val description: String,
)

private val PANEL_ORDER = listOf(
    PanelOption(
        key = "console",
        icon = "🧩",
        name = "Consola",
        description = "Operación central, usuarios y control jerárquico.",
    ),
    PanelOption(
        key = "ventas",
        icon = "📈",
        name = "Ventas",
        description = "Pipeline comercial, leads y oportunidades.",
    ),
    PanelOption(
        key = "contabilidad",
        icon = "💼",
        name = "Contabilidad",
        description = "Pagos, viáticos, horas y control financiero.",
    ),
    PanelOption(
        key = "web",
        icon = "🌐",
        name = "Web",
        description = "Gestión de contenido, clientes y proyectos web.",
    ),
    PanelOption(
        key = "tickets",
        icon = "🎫",
        name = "Tickets",
        description = "Seguimiento de solicitudes, sucursales e inventarios.",
    ),
)

private val CLIENT_OR_BRANCH_PERMISSION_PREFIXES = listOf(
    "client-portal.",
    "branch-portal.",
    "client-auth.",
    "branch-auth.",
    "client-tickets.",
)

private fun normalizePerms(perms: List<String>): Set<String> {
    return perms.map { it.trim().lowercase().replace('_', '.').replace('-', '.') }.toSet()
}

private fun isClientOrBranchAccount(role: String, permissions: List<String>): Boolean {
    val byRole = Regex("(cliente|client|sucursal|branch)", RegexOption.IGNORE_CASE).containsMatchIn(role)
    val byPermPrefix = permissions.any { p ->
        val normalized = p.trim().lowercase()
        CLIENT_OR_BRANCH_PERMISSION_PREFIXES.any { prefix -> normalized.startsWith(prefix) }
    }
    return byRole || byPermPrefix
}

private fun hasAnyPermission(perms: Set<String>, required: List<String>, isSuperAdmin: Boolean): Boolean {
    if (isSuperAdmin) return true
    return required.any { perms.contains(it) }
}

private fun hasPermission(perms: Set<String>, required: String, isSuperAdmin: Boolean): Boolean {
    if (isSuperAdmin) return true
    return perms.contains(required)
}

fun getAccessiblePanels(
    role: String,
    permissions: List<String>,
    isSuperAdmin: Boolean,
    isClient: Boolean,
    isBranchUser: Boolean,
): List<PanelOption> {
    if (isClient || isBranchUser || isClientOrBranchAccount(role, permissions)) {
        return PANEL_ORDER.filter { it.key == "tickets" }
    }
    if (isSuperAdmin) {
        return PANEL_ORDER.filter { it.key != "tickets" }
    }

    val normalized = normalizePerms(permissions)

    val accessMap = mapOf(
        "console" to hasAnyPermission(
            normalized,
            listOf("console.access", "console.admin", "users.manage", "console_access", "console_admin"),
            isSuperAdmin,
        ),
        "ventas" to hasAnyPermission(
            normalized,
            listOf("panel.ventas", "sales.view", "sales.manage", "sales.reports.view"),
            isSuperAdmin,
        ),
        "contabilidad" to hasAnyPermission(
            normalized,
            listOf("contabilidad.view", "contabilidad.manage"),
            isSuperAdmin,
        ),
        "web" to hasPermission(normalized, "panel.web", isSuperAdmin),
        "tickets" to false,
    )
    return PANEL_ORDER.filter { accessMap[it.key] == true }
}
