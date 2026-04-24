package mx.nexara.mobile.nativeapp.ui.console.screens

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
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import mx.nexara.mobile.nativeapp.data.AuthRepository

/**
 * Pantalla nativa para "Mi perfil" usando la sesión guardada.
 * Refleja el mismo contenido básico que apps/mobile/app/(subdomains)/console/my-profile.
 */
@Composable
fun MyProfileScreen(
    contentPadding: PaddingValues = PaddingValues(20.dp),
) {
    val context = LocalContext.current
    val repo = remember(context) { AuthRepository(context) }
    val user = repo.loadSession()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(contentPadding),
        verticalArrangement = Arrangement.Top,
    ) {
        Text("Mi perfil", style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(12.dp))

        if (user == null) {
            Text(
                "No hay sesión activa.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            return@Column
        }

        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                InfoRow("Nombre", user.nombre.ifBlank { "—" })
                InfoRow("Email", user.email)
                InfoRow("Rol", user.role.ifBlank { "—" })
                InfoRow("Departamento", user.department.ifBlank { "—" })
                InfoRow("Super admin", if (user.isSuperAdmin) "Sí" else "No")
                if (user.isClient) InfoRow("Cuenta", "Cliente")
                if (user.isBranchUser) InfoRow("Cuenta", "Sucursal")
                user.clientId?.let { InfoRow("Client ID", it.toString()) }
                user.branchId?.let { InfoRow("Branch ID", it.toString()) }
            }
        }

        Spacer(Modifier.height(16.dp))
        Text(
            "Permisos (${user.permissions.size})",
            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
        )
        Spacer(Modifier.height(6.dp))
        if (user.permissions.isEmpty()) {
            Text(
                "Sin permisos explícitos.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                items(user.permissions) { p ->
                    Text("• $p", style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}

@Composable
private fun InfoRow(label: String, value: String) {
    Column(modifier = Modifier.padding(vertical = 4.dp)) {
        Text(
            label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(value, style = MaterialTheme.typography.bodyMedium)
    }
}
