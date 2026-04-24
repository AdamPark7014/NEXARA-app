package mx.nexara.mobile.nativeapp.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
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

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(contentPadding),
        verticalArrangement = Arrangement.Top,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = "Paneles",
            style = MaterialTheme.typography.headlineMedium,
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = if (user != null) "Hola, ${user.nombre.ifBlank { user.email }}." else "Sesión no encontrada.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        Spacer(modifier = Modifier.height(16.dp))

        if (panels.isEmpty()) {
            Text(
                text = "No hay paneles disponibles para tu cuenta.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(panels) { panel ->
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.surface,
                        ),
                    ) {
                        Column(modifier = Modifier.padding(14.dp)) {
                            Text(
                                text = "${panel.icon}  ${panel.name}",
                                style = MaterialTheme.typography.titleMedium,
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = panel.description,
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Spacer(modifier = Modifier.height(10.dp))
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
                            ) {
                                Text("Abrir")
                            }
                        }
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(18.dp))
        OutlinedButton(
            onClick = onOpenNotifications,
            modifier = Modifier.fillMaxWidth(),
        ) { Text("Notificaciones") }
        Spacer(modifier = Modifier.height(10.dp))
        Button(
            onClick = {
                repo.logout()
                onLogout()
            },
        ) {
            Text("Cerrar sesión")
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

private fun isClientOrBranchAccount(role: String, permissions: List<String>): Boolean {
    val byRole = Regex("(cliente|client|sucursal|branch)", RegexOption.IGNORE_CASE).containsMatchIn(role)
    val byPermPrefix = permissions.any { p -> CLIENT_OR_BRANCH_PERMISSION_PREFIXES.any { prefix -> p.startsWith(prefix) } }
    return byRole || byPermPrefix
}

private fun hasAnyPermission(perms: List<String>, required: List<String>, isSuperAdmin: Boolean): Boolean {
    if (isSuperAdmin) return true
    return required.any { perms.contains(it) }
}

private fun hasPermission(perms: List<String>, required: String, isSuperAdmin: Boolean): Boolean {
    if (isSuperAdmin) return true
    return perms.contains(required)
}

private fun getAccessiblePanels(
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

    val accessMap = mapOf(
        "console" to hasAnyPermission(
            permissions,
            listOf("console.access", "console.admin", "users.manage"),
            isSuperAdmin,
        ),
        "ventas" to hasAnyPermission(
            permissions,
            listOf("panel.ventas", "sales.view", "sales.manage", "sales.reports.view"),
            isSuperAdmin,
        ),
        "contabilidad" to hasAnyPermission(
            permissions,
            listOf("contabilidad.view", "contabilidad.manage"),
            isSuperAdmin,
        ),
        "web" to hasPermission(permissions, "panel.web", isSuperAdmin),
        "tickets" to false,
    )
    return PANEL_ORDER.filter { accessMap[it.key] == true }
}

