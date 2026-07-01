package mx.nexara.mobile.nativeapp.ui.console.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import mx.nexara.mobile.nativeapp.R
import mx.nexara.mobile.nativeapp.data.api.toAbsoluteAssetUrl
import mx.nexara.mobile.nativeapp.ui.catalog.ModuleEntry
import mx.nexara.mobile.nativeapp.ui.console.ConsoleSidebarGroup

/**
 * Pantalla "Más" para la consola: muestra los módulos accesibles agrupados
 * tal como el sidebar de la web (Cuenta personal, Mi espacio de trabajo,
 * Supervisión operativa, RRHH, Clientes y comercial, Administración interna,
 * Inventario y compras, Finanzas y banca, Cumplimiento y BI), además de
 * acciones globales (cerrar sesión, salir a paneles).
 */
@Composable
fun ConsoleMoreScreen(
    modules: List<ModuleEntry>,
    onOpenModule: (ModuleEntry) -> Unit,
    contentPadding: PaddingValues = PaddingValues(16.dp),
    groups: List<ConsoleSidebarGroup> = emptyList(),
    userName: String? = null,
    userRoleLabel: String? = null,
    onLogout: (() -> Unit)? = null,
    onExitToPanels: (() -> Unit)? = null,
    userEmail: String? = null,
    userAvatarUrl: String? = null,
    isSuperAdmin: Boolean = false,
    showContabilidadHub: Boolean = false,
    onOpenContabilidad: (() -> Unit)? = null,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(contentPadding),
        verticalArrangement = Arrangement.spacedBy(0.dp),
    ) {
        // ── Profile card ────────────────────────────────────────────────────
        item(key = "profile-card") {
            ProfileCard(
                nombre = userName,
                email = userEmail,
                roleLabel = userRoleLabel,
                avatarUrl = userAvatarUrl,
                isSuperAdmin = isSuperAdmin,
            )
            Spacer(Modifier.height(16.dp))
        }

        if (showContabilidadHub && onOpenContabilidad != null) {
            item(key = "hub-contabilidad") {
                Card(
                    onClick = onOpenContabilidad,
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFFEFF6FF)),
                ) {
                    Row(
                        Modifier.padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Text("📊", fontSize = 22.sp)
                        Column(Modifier.weight(1f)) {
                            Text("Hub Contabilidad", fontWeight = FontWeight.SemiBold)
                            Text(
                                "Facturas, gastos y finanzas",
                                style = MaterialTheme.typography.bodySmall,
                                color = Color(0xFF64748B),
                            )
                        }
                        Text("›", color = Color(0xFF64748B), fontSize = 20.sp)
                    }
                }
                Spacer(Modifier.height(12.dp))
            }
        }

        // ── Module groups ────────────────────────────────────────────────────
        if (groups.isNotEmpty()) {
            groups.forEach { group ->
                item(key = "group-${group.id}") {
                    Spacer(Modifier.height(8.dp))
                    Text(
                        group.title.uppercase(),
                        style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold, letterSpacing = 0.8.sp),
                        color = Color(0xFF64748B),
                        modifier = Modifier.padding(horizontal = 2.dp, vertical = 4.dp),
                    )
                    Spacer(Modifier.height(4.dp))
                }
                items(group.modules, key = { "g-${group.id}-${it.key}" }) { m ->
                    ModuleCard(m, onOpenModule)
                    Spacer(Modifier.height(6.dp))
                }
            }
        } else {
            items(modules, key = { it.key }) { m ->
                ModuleCard(m, onOpenModule)
                Spacer(Modifier.height(6.dp))
            }
        }

        // ── Session actions ──────────────────────────────────────────────────
        item(key = "session-header") {
            Spacer(Modifier.height(16.dp))
            Text(
                "SESIÓN",
                style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold, letterSpacing = 0.8.sp),
                color = Color(0xFF64748B),
                modifier = Modifier.padding(horizontal = 2.dp, vertical = 4.dp),
            )
            Spacer(Modifier.height(6.dp))
        }
        onExitToPanels?.let { exit ->
            item(key = "action-exit-panels") {
                OutlinedButton(
                    onClick = exit,
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                ) { Text("← Salir a paneles") }
                Spacer(Modifier.height(8.dp))
            }
        }
        onLogout?.let { logout ->
            item(key = "action-logout") {
                Button(
                    onClick = logout,
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color(0xFFDC2626),
                        contentColor = Color.White,
                    ),
                ) {
                    Text("Cerrar sesión", style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold))
                }
                Spacer(Modifier.height(8.dp))
            }
        }

        item(key = "tail-spacer") { Spacer(Modifier.height(32.dp)) }
    }
}

// ── Profile card composable ──────────────────────────────────────────────────

@Composable
private fun ProfileCard(
    nombre: String?,
    email: String?,
    roleLabel: String?,
    avatarUrl: String?,
    isSuperAdmin: Boolean,
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = if (isSuperAdmin) Color(0xFF0F172A) else Color(0xFFF8FAFC)),
        elevation = CardDefaults.cardElevation(2.dp),
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Avatar
            if (isSuperAdmin) {
                // SuperAdmin: show NEXARA logo
                Box(
                    modifier = Modifier
                        .size(56.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(Color(0xFF0D9488)),
                    contentAlignment = Alignment.Center,
                ) {
                    androidx.compose.foundation.Image(
                        painter = painterResource(R.drawable.logo_nexara),
                        contentDescription = "NEXARA",
                        modifier = Modifier.size(40.dp),
                        contentScale = ContentScale.Fit,
                    )
                }
            } else if (!avatarUrl.isNullOrBlank()) {
                // Has profile photo: load from network
                AsyncImage(
                    model = toAbsoluteAssetUrl(avatarUrl),
                    contentDescription = nombre,
                    modifier = Modifier.size(56.dp).clip(CircleShape).border(2.dp, Color(0xFF0D9488), CircleShape),
                    contentScale = ContentScale.Crop,
                )
            } else {
                // Initials avatar
                val initials = (nombre ?: "?").split(" ").take(2).map { it.firstOrNull()?.uppercaseChar() ?: '?' }.joinToString("")
                Box(
                    modifier = Modifier.size(56.dp).clip(CircleShape).background(Color(0xFF0D9488)),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(initials, style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold, color = Color.White))
                }
            }

            // Info
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    nombre ?: "Usuario",
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                    color = if (isSuperAdmin) Color.White else Color(0xFF0F172A),
                )
                if (!email.isNullOrBlank()) {
                    Text(
                        email,
                        style = MaterialTheme.typography.bodySmall,
                        color = if (isSuperAdmin) Color(0xFF94A3B8) else Color(0xFF64748B),
                    )
                }
                if (!roleLabel.isNullOrBlank()) {
                    Spacer(Modifier.height(6.dp))
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(6.dp))
                            .background(if (isSuperAdmin) Color(0xFF0D9488) else Color(0xFFCCFBF1))
                            .padding(horizontal = 8.dp, vertical = 3.dp),
                    ) {
                        Text(
                            roleLabel,
                            style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
                            color = if (isSuperAdmin) Color.White else Color(0xFF0D9488),
                        )
                    }
                }
            }
        }
    }
}

// ── Module card composable ────────────────────────────────────────────────────

@Composable
private fun ModuleCard(m: ModuleEntry, onOpenModule: (ModuleEntry) -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth().clickable { onOpenModule(m) },
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(1.dp),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier.size(36.dp).clip(RoundedCornerShape(8.dp)).background(Color(0xFFCCFBF1)),
                contentAlignment = Alignment.Center,
            ) {
                Text(m.icon, fontSize = 18.sp)
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    m.label,
                    style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
                    color = Color(0xFF0F172A),
                )
            }
            Text("›", style = MaterialTheme.typography.titleLarge, color = Color(0xFF94A3B8))
        }
    }
}
