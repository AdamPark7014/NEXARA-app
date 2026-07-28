package mx.nexara.mobile.nativeapp.ui.console.screens

import android.app.Application
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.api.AuditEntryDto
import mx.nexara.mobile.nativeapp.data.api.CandidateDto
import mx.nexara.mobile.nativeapp.data.api.ContactMessageDto
import mx.nexara.mobile.nativeapp.data.api.DocumentDto
import mx.nexara.mobile.nativeapp.data.api.NewsPostDto
import mx.nexara.mobile.nativeapp.data.api.PortfolioProjectDto
import mx.nexara.mobile.nativeapp.data.extra.ExtraRepository

@Composable
private fun CatalogItemDetail(pairs: List<Pair<String, String>>, onBack: () -> Unit) {
    LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item { OutlinedButton(onClick = onBack) { Text("← Volver") } }
        item {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    pairs.forEach { (label, value) ->
                        if (value.isBlank()) return@forEach
                        Row(Modifier.fillMaxWidth()) {
                            Text(label, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
                            Spacer(Modifier.padding(4.dp))
                            Text(value.take(100), color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun <T> CatalogRichScreen(
    kpis: List<Pair<String, String>>,
    placeholder: String,
    load: suspend (ExtraRepository) -> List<T>,
    keyOf: (T) -> String,
    titleOf: (T) -> String,
    subtitleOf: (T) -> String,
    metaOf: (T) -> String = { "" },
    matches: (T, String) -> Boolean,
    detailPairs: (T) -> List<Pair<String, String>>,
) {
    val app = androidx.compose.ui.platform.LocalContext.current.applicationContext as Application
    val repo = remember { ExtraRepository(app) }
    var loading by remember { mutableStateOf(true) }
    var query by remember { mutableStateOf("") }
    var items by remember { mutableStateOf<List<T>>(emptyList()) }
    var selected by remember { mutableStateOf<T?>(null) }

    LaunchedEffect(Unit) {
        loading = true
        items = withContext(Dispatchers.IO) { load(repo) }
        loading = false
    }

    val sel = selected
    if (sel != null) {
        CatalogItemDetail(pairs = detailPairs(sel), onBack = { selected = null })
        return
    }

    val filtered = if (query.isBlank()) items else {
        val q = query.lowercase()
        items.filter { matches(it, q) }
    }

    Column(Modifier.fillMaxSize()) {
        if (kpis.isNotEmpty()) {
            Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
                kpis.forEach { (label, value) ->
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(value, fontWeight = FontWeight.Bold)
                        Text(label, style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
        }
        OutlinedTextField(
            value = query,
            onValueChange = { query = it },
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
            placeholder = { Text(placeholder) },
            singleLine = true,
        )
        if (loading) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        } else if (filtered.isEmpty()) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("Sin registros", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        } else {
            LazyColumn(Modifier.padding(horizontal = 16.dp)) {
                items(filtered.take(80), key = { keyOf(it) }) { row ->
                    Card(Modifier.fillMaxWidth().padding(vertical = 4.dp).clickable { selected = row }) {
                        Column(Modifier.padding(12.dp)) {
                            Text(titleOf(row).ifBlank { "—" }, fontWeight = FontWeight.Bold)
                            val sub = subtitleOf(row)
                            if (sub.isNotBlank()) Text(sub, style = MaterialTheme.typography.bodySmall)
                            val meta = metaOf(row)
                            if (meta.isNotBlank()) Text(meta.take(16), style = MaterialTheme.typography.labelSmall)
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun AuditRichScreen() = CatalogRichScreen(
    kpis = emptyList(),
    placeholder = "Buscar auditoría…",
    load = { it.audit() },
    keyOf = { "au-${it.id}" },
    titleOf = { it.action.orEmpty().ifBlank { "Acción" } },
    subtitleOf = { listOfNotNull(it.userName, it.entityType).filter { s -> !s.isNullOrBlank() }.joinToString(" · ") },
    metaOf = { it.createdAt.orEmpty() },
    matches = { row, q ->
        (row.action ?: "").lowercase().contains(q) ||
            (row.userName ?: "").lowercase().contains(q) ||
            (row.entityType ?: "").lowercase().contains(q)
    },
    detailPairs = { d: AuditEntryDto ->
        listOf(
            "Acción" to (d.action ?: ""),
            "Usuario" to (d.userName ?: ""),
            "Entidad" to (d.entityType ?: ""),
            "Fecha" to (d.createdAt ?: ""),
        )
    },
)

@Composable
fun DocumentsRichScreen() = CatalogRichScreen(
    kpis = emptyList(),
    placeholder = "Buscar documento…",
    load = { it.documents() },
    keyOf = { "doc-${it.id}" },
    titleOf = { it.title.orEmpty().ifBlank { "Documento" } },
    subtitleOf = { it.type.orEmpty() },
    metaOf = { it.createdAt.orEmpty() },
    matches = { row, q ->
        (row.title ?: "").lowercase().contains(q) || (row.type ?: "").lowercase().contains(q)
    },
    detailPairs = { d: DocumentDto ->
        listOf(
            "Título" to (d.title ?: ""),
            "Tipo" to (d.type ?: ""),
            "Fecha" to (d.createdAt ?: ""),
        )
    },
)

@Composable
fun NewsRichScreen() = CatalogRichScreen(
    kpis = emptyList(),
    placeholder = "Buscar noticia…",
    load = { it.news() },
    keyOf = { "nw-${it.id}" },
    titleOf = { it.title.orEmpty().ifBlank { "Noticia" } },
    subtitleOf = { listOfNotNull(it.excerpt, it.status).filter { s -> !s.isNullOrBlank() }.joinToString(" · ") },
    matches = { row, q ->
        (row.title ?: "").lowercase().contains(q) ||
            (row.excerpt ?: "").lowercase().contains(q) ||
            (row.status ?: "").lowercase().contains(q)
    },
    detailPairs = { d: NewsPostDto ->
        listOf(
            "Título" to (d.title ?: ""),
            "Resumen" to (d.excerpt ?: ""),
            "Estado" to (d.status ?: ""),
            "Slug" to (d.slug ?: ""),
        )
    },
)

@Composable
fun ContactMessagesRichScreen() = CatalogRichScreen(
    kpis = emptyList(),
    placeholder = "Buscar mensaje…",
    load = { it.contactMessages() },
    keyOf = { "cm-${it.id}" },
    titleOf = { it.name.orEmpty().ifBlank { it.subject.orEmpty().ifBlank { "Mensaje" } } },
    subtitleOf = { listOfNotNull(it.email, it.status).filter { s -> !s.isNullOrBlank() }.joinToString(" · ") },
    matches = { row, q ->
        (row.name ?: "").lowercase().contains(q) ||
            (row.email ?: "").lowercase().contains(q) ||
            (row.subject ?: "").lowercase().contains(q)
    },
    detailPairs = { d: ContactMessageDto ->
        listOf(
            "Nombre" to (d.name ?: ""),
            "Email" to (d.email ?: ""),
            "Asunto" to (d.subject ?: ""),
            "Estado" to (d.status ?: ""),
        )
    },
)

@Composable
fun CvsRichScreen() = CatalogRichScreen(
    kpis = emptyList(),
    placeholder = "Buscar CV…",
    load = { it.candidateDtos() },
    keyOf = { it.rowKey },
    titleOf = { it.displayName },
    subtitleOf = { listOf(it.position, it.email, it.category).filter { s -> s.isNotBlank() }.joinToString(" · ") },
    matches = { row, q ->
        row.displayName.lowercase().contains(q) ||
            row.email.lowercase().contains(q) ||
            row.position.lowercase().contains(q) ||
            row.category.lowercase().contains(q)
    },
    detailPairs = { d: CandidateDto ->
        listOf(
            "Nombre" to d.displayName,
            "Email" to d.email,
            "WhatsApp" to d.whatsapp,
            "Categoría" to d.category,
            "Etapa" to d.stage,
            "Posición" to d.position,
            "Experiencia" to d.experience,
            "Fuente" to d.source,
            "CV" to d.cvUrl,
        )
    },
)

@Composable
fun WorkProjectsRichScreen() = CatalogRichScreen(
    kpis = emptyList(),
    placeholder = "Buscar proyecto…",
    load = { it.portfolioProjectDtos() },
    keyOf = { it.rowKey },
    titleOf = { it.displayTitle },
    subtitleOf = { it.subtitle },
    metaOf = { it.createdAt },
    matches = { row, q ->
        row.title.lowercase().contains(q) ||
            row.sector.lowercase().contains(q) ||
            row.summary.lowercase().contains(q) ||
            row.impact.lowercase().contains(q)
    },
    detailPairs = { d: PortfolioProjectDto ->
        listOf(
            "Título" to d.title,
            "Sector" to d.sector,
            "Resumen" to d.summary,
            "Impacto" to d.impact,
            "Servicios" to d.services.joinToString(", "),
            "Tags" to d.tags.joinToString(", "),
            "Highlights" to d.highlights.joinToString(", "),
            "Slug" to d.slug,
            "Fecha" to d.createdAt,
        )
    },
)
