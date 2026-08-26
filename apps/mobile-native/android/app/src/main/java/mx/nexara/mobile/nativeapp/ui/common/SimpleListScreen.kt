package mx.nexara.mobile.nativeapp.ui.common

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
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
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

data class SimpleRow(
    val id: String,
    val title: String,
    val subtitle: String? = null,
    val trailing: String? = null,
    val meta: String? = null,
)

/**
 * Contenedor estándar para módulos que listan datos planos (news, contact-messages,
 * newsletter, audit, expenses, fines, cotizaciones, documentos, lunch-breaks, etc.).
 * Maneja loading + empty + error + lista.
 */
@Composable
fun SimpleListScreen(
    title: String,
    rows: List<SimpleRow>?,
    loading: Boolean,
    error: String?,
    onRetry: (() -> Unit)? = null,
    contentPadding: PaddingValues = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
    header: (@Composable () -> Unit)? = null,
) {
    val baseRows = rows ?: emptyList()
    var query by remember { mutableStateOf("") }
    val q = query.trim().lowercase()
    val filteredRows = remember(baseRows, q) {
        if (q.isBlank()) baseRows
        else baseRows.filter { r ->
            buildString {
                append(r.title)
                append(" ")
                append(r.subtitle ?: "")
                append(" ")
                append(r.meta ?: "")
                append(" ")
                append(r.trailing ?: "")
            }.lowercase().contains(q)
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(contentPadding),
    ) {
        // Title omitted here — TopAppBar in ConsoleNavHost already shows it.
        Text(
            "${filteredRows.size} de ${baseRows.size} registros",
            style = MaterialTheme.typography.bodySmall,
            color = Color(0xFF64748B),
        )
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(
            value = query,
            onValueChange = { query = it },
            label = { Text("Buscar en $title") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(10.dp))
        header?.invoke()
        when {
            loading && (rows == null) -> {
                NxLoadingBlock("Cargando $title…")
            }
            error != null -> {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
                ) {
                    Column(Modifier.padding(14.dp)) {
                        Text(
                            "Error al cargar",
                            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                            color = MaterialTheme.colorScheme.onErrorContainer,
                        )
                        Spacer(Modifier.height(4.dp))
                        Text(
                            error,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onErrorContainer,
                        )
                        if (onRetry != null) {
                            Spacer(Modifier.height(8.dp))
                            Button(onClick = onRetry) { Text("Reintentar") }
                        }
                    }
                }
            }
            filteredRows.isEmpty() -> {
                NxEmptyState(
                    title = if (baseRows.isEmpty()) "Sin registros" else "Sin resultados",
                    subtitle = if (baseRows.isEmpty()) "No hay datos para mostrar." else "Prueba otro término de búsqueda.",
                )
            }
            else -> {
                LazyColumn(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(filteredRows, key = { it.id }) { row ->
                        SimpleRowCard(row)
                    }
                    item { Spacer(Modifier.height(24.dp)) }
                }
            }
        }
    }
}

@Composable
private fun SimpleRowCard(row: SimpleRow) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(1.dp),
    ) {
        Column(Modifier.padding(14.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text(
                    row.title,
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                    color = Color(0xFF0F172A),
                    modifier = Modifier.weight(1f),
                )
                if (!row.trailing.isNullOrBlank()) {
                    Text(
                        row.trailing,
                        style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold),
                        color = Color(0xFF0D9488),
                    )
                }
            }
            if (!row.subtitle.isNullOrBlank()) {
                Spacer(Modifier.height(2.dp))
                Text(row.subtitle, style = MaterialTheme.typography.bodyMedium, color = Color(0xFF334155))
            }
            if (!row.meta.isNullOrBlank()) {
                Spacer(Modifier.height(4.dp))
                Text(
                    row.meta,
                    style = MaterialTheme.typography.bodySmall,
                    color = Color(0xFF64748B),
                )
            }
        }
    }
}
