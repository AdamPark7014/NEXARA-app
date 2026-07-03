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
import mx.nexara.mobile.nativeapp.data.extra.ExtraRepository

private val skipDetailKeys = setOf("id", "uuid", "__type", "createdAt", "updatedAt")

@Composable
private fun CatalogItemDetail(item: Map<String, Any?>, onBack: () -> Unit) {
    LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item { OutlinedButton(onClick = onBack) { Text("← Volver") } }
        item {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    item.forEach { (key, value) ->
                        val v = when (value) {
                            null -> return@forEach
                            is String -> value.takeIf { it.isNotBlank() && it != "null" } ?: return@forEach
                            is Number -> value.toString()
                            is Boolean -> if (value) "Sí" else "No"
                            else -> value.toString().takeIf { it.isNotBlank() && it != "null" } ?: return@forEach
                        }
                        val label = key.replace(Regex("([A-Z])"), " $1").trim().replaceFirstChar { it.uppercase() }
                        Row(Modifier.fillMaxWidth()) {
                            Text(label, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
                            Spacer(Modifier.padding(4.dp))
                            Text(v.take(100), color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
                        }
                    }
                }
            }
        }
    }
}

private fun cStr(m: Map<String, Any?>, vararg keys: String): String {
    for (k in keys) {
        val v = m[k] ?: continue
        val s = when (v) {
            is String -> v
            is Number -> v.toString()
            else -> v.toString()
        }
        if (s.isNotBlank() && s != "null") return s
    }
    return ""
}

@Composable
private fun CatalogRichScreen(
    kpis: List<Pair<String, String>>,
    placeholder: String,
    load: suspend (ExtraRepository) -> List<Map<String, Any?>>,
    titleKeys: Array<String>,
    subtitleKeys: Array<String>,
    metaKeys: Array<String> = emptyArray(),
) {
    val app = androidx.compose.ui.platform.LocalContext.current.applicationContext as Application
    val repo = remember { ExtraRepository(app) }
    var loading by remember { mutableStateOf(true) }
    var query by remember { mutableStateOf("") }
    var items by remember { mutableStateOf<List<Map<String, Any?>>>(emptyList()) }
    var selected by remember { mutableStateOf<Map<String, Any?>?>(null) }

    LaunchedEffect(Unit) {
        loading = true
        items = withContext(Dispatchers.IO) { load(repo) }
        loading = false
    }

    val sel = selected
    if (sel != null) {
        CatalogItemDetail(item = sel, onBack = { selected = null })
        return
    }

    val filtered = if (query.isBlank()) items else {
        val q = query.lowercase()
        items.filter { row ->
            titleKeys.any { k -> cStr(row, k).lowercase().contains(q) } ||
                subtitleKeys.any { k -> cStr(row, k).lowercase().contains(q) }
        }
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
                items(filtered.take(80), key = { cStr(it, "id", "uuid") + it.hashCode() }) { row ->
                    Card(Modifier.fillMaxWidth().padding(vertical = 4.dp).clickable { selected = row }) {
                        Column(Modifier.padding(12.dp)) {
                            Text(cStr(row, *titleKeys).ifBlank { "—" }, fontWeight = FontWeight.Bold)
                            val sub = subtitleKeys.mapNotNull { k -> cStr(row, k).takeIf { it.isNotBlank() } }.joinToString(" · ")
                            if (sub.isNotBlank()) Text(sub, style = MaterialTheme.typography.bodySmall)
                            val meta = metaKeys.mapNotNull { k -> cStr(row, k).takeIf { it.isNotBlank() } }.firstOrNull()
                            if (meta != null) Text(meta.take(16), style = MaterialTheme.typography.labelSmall)
                        }
                    }
                }
            }
        }
    }
}

@Composable fun AuditRichScreen() = CatalogRichScreen(
    kpis = emptyList(),
    placeholder = "Buscar auditoría…",
    load = { repo -> repo.audit().map { dto ->
        mapOf("id" to dto.id, "action" to dto.action, "entityType" to dto.entityType, "userName" to dto.userName, "createdAt" to dto.createdAt)
    } },
    titleKeys = arrayOf("action", "accion"),
    subtitleKeys = arrayOf("userName", "entityType"),
    metaKeys = arrayOf("createdAt"),
)

@Composable fun DocumentsRichScreen() = CatalogRichScreen(
    kpis = emptyList(),
    placeholder = "Buscar documento…",
    load = { repo -> repo.documents().map { dto ->
        mapOf("id" to dto.id, "title" to dto.title, "type" to dto.type, "createdAt" to dto.createdAt)
    } },
    titleKeys = arrayOf("title", "name", "fileName"),
    subtitleKeys = arrayOf("type", "category"),
)

@Composable fun NewsRichScreen() = CatalogRichScreen(
    kpis = emptyList(),
    placeholder = "Buscar noticia…",
    load = { repo -> repo.news().map { dto ->
        mapOf("id" to dto.id, "title" to dto.title, "excerpt" to dto.excerpt, "status" to dto.status)
    } },
    titleKeys = arrayOf("title", "titulo"),
    subtitleKeys = arrayOf("excerpt", "status"),
)

@Composable fun ContactMessagesRichScreen() = CatalogRichScreen(
    kpis = emptyList(),
    placeholder = "Buscar mensaje…",
    load = { repo -> repo.contactMessages().map { dto ->
        mapOf("id" to dto.id, "name" to dto.name, "email" to dto.email, "subject" to dto.subject, "status" to dto.status)
    } },
    titleKeys = arrayOf("name", "nombre", "subject"),
    subtitleKeys = arrayOf("email", "telefono"),
)

@Composable fun CvsRichScreen() = CatalogRichScreen(
    kpis = emptyList(),
    placeholder = "Buscar CV…",
    load = { repo -> repo.cvs() },
    titleKeys = arrayOf("fullName", "name", "fileName"),
    subtitleKeys = arrayOf("position", "role", "email"),
)

@Composable fun WorkProjectsRichScreen() = CatalogRichScreen(
    kpis = emptyList(),
    placeholder = "Buscar proyecto…",
    load = { repo -> repo.projects() },
    titleKeys = arrayOf("name", "nombre", "title"),
    subtitleKeys = arrayOf("clientName", "cliente", "status"),
)
