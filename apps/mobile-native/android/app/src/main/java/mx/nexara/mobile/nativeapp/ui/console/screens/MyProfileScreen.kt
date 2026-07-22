package mx.nexara.mobile.nativeapp.ui.console.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.toAbsoluteAssetUrl

/**
 * Pantalla nativa para "Mi perfil" usando la sesión guardada.
 * Refleja el mismo contenido básico que apps/mobile/app/(subdomains)/console/my-profile.
 */
@Composable
fun MyProfileScreen(
    contentPadding: PaddingValues = PaddingValues(20.dp),
    onOpenOfflineQueue: (() -> Unit)? = null,
) {
    val context = LocalContext.current
    val repo = remember(context) { AuthRepository(context) }
    val user = repo.loadSession()
    val isSuperAdmin = user?.isSuperAdmin == true
    val Teal = Color(0xFF0D9488)
    val Slate = Color(0xFF0F172A)
    val Sub = Color(0xFF64748B)

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(contentPadding),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (user == null) {
            item { Text("No hay sesión activa.", color = Sub) }
            return@LazyColumn
        }

        // ── Avatar + name banner ──────────────────────────────────────────
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(20.dp),
                colors = CardDefaults.cardColors(containerColor = if (isSuperAdmin) Color(0xFF0F172A) else Color(0xFFF8FAFC)),
                elevation = CardDefaults.cardElevation(2.dp),
            ) {
                Column(
                    modifier = Modifier.padding(24.dp).fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    if (isSuperAdmin) {
                        Box(
                            modifier = Modifier.size(80.dp).clip(RoundedCornerShape(16.dp)).background(Teal),
                            contentAlignment = Alignment.Center,
                        ) {
                            androidx.compose.foundation.Image(
                                painter = painterResource(R.drawable.logo_nexara),
                                contentDescription = "NEXARA",
                                modifier = Modifier.size(60.dp),
                                contentScale = ContentScale.Fit,
                            )
                        }
                    } else if (!user.avatarUrl.isNullOrBlank()) {
                        AsyncImage(
                            model = toAbsoluteAssetUrl(user.avatarUrl),
                            contentDescription = user.nombre,
                            modifier = Modifier.size(80.dp).clip(CircleShape).border(3.dp, Teal, CircleShape),
                            contentScale = ContentScale.Crop,
                        )
                    } else {
                        val initials = user.nombre.split(" ").take(2).map { it.firstOrNull()?.uppercaseChar() ?: '?' }.joinToString("")
                        Box(
                            modifier = Modifier.size(80.dp).clip(CircleShape).background(Teal),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(initials, style = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.Bold, color = Color.White))
                        }
                    }

                    Text(
                        user.nombre.ifBlank { "Usuario" },
                        style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                        color = if (isSuperAdmin) Color.White else Slate,
                    )
                    Text(
                        user.email,
                        style = MaterialTheme.typography.bodyMedium,
                        color = if (isSuperAdmin) Color(0xFF94A3B8) else Sub,
                    )
                    // Role badge
                    val roleBadge = when {
                        isSuperAdmin -> "Super Administrador"
                        user.isClient -> "Portal Cliente"
                        user.isBranchUser -> "Portal Sucursal"
                        else -> user.role.ifBlank { "Usuario" }
                    }
                    Box(
                        modifier = Modifier.clip(RoundedCornerShape(8.dp))
                            .background(if (isSuperAdmin) Teal else Color(0xFFCCFBF1))
                            .padding(horizontal = 12.dp, vertical = 5.dp),
                    ) {
                        Text(roleBadge, style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold), color = if (isSuperAdmin) Color.White else Teal)
                    }
                }
            }
        }

        // ── Info fields ───────────────────────────────────────────────────
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                elevation = CardDefaults.cardElevation(1.dp),
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    if (user.department.isNotBlank()) ProfileInfoRow("Departamento", user.department, Teal, Sub)
                    if (user.clientId != null) ProfileInfoRow("Client ID", user.clientId.toString(), Teal, Sub)
                    if (user.branchId != null) ProfileInfoRow("Branch ID", user.branchId.toString(), Teal, Sub)
                    ProfileInfoRow("ID de usuario", user.id.toString(), Teal, Sub)
                }
            }
        }

        if (onOpenOfflineQueue != null) {
            item {
                Card(
                    onClick = onOpenOfflineQueue,
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFFEFF6FF)),
                ) {
                    Row(
                        Modifier.padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text("Cola offline", fontWeight = FontWeight.SemiBold, color = Slate)
                            Text(
                                "Ver y sincronizar cambios pendientes",
                                style = MaterialTheme.typography.bodySmall,
                                color = Sub,
                            )
                        }
                        Text("›", color = Sub, fontSize = 20.sp)
                    }
                }
            }
        }

        // ── Permissions ──────────────────────────────────────────────────
        if (user.permissions.isNotEmpty()) {
            item {
                Text(
                    "Permisos (${user.permissions.size})",
                    style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold, letterSpacing = 0.8.sp),
                    color = Sub,
                    modifier = Modifier.padding(horizontal = 2.dp, vertical = 2.dp),
                )
            }
            items(user.permissions) { p ->
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(10.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFFF8FAFC)),
                    elevation = CardDefaults.cardElevation(0.dp),
                ) {
                    Text(
                        p,
                        style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Medium),
                        color = Slate,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                    )
                }
            }
        }

        item { Spacer(Modifier.height(24.dp)) }
    }
}

@Composable
private fun ProfileInfoRow(label: String, value: String, teal: Color, sub: Color) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = sub)
        Text(value, style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold), color = Color(0xFF0F172A))
    }
}
