package mx.nexara.mobile.nativeapp.ui.console.screens

import android.app.Application
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.api.AuditEntryDto
import mx.nexara.mobile.nativeapp.data.api.ContactMessageDto
import mx.nexara.mobile.nativeapp.data.api.DocumentDto
import mx.nexara.mobile.nativeapp.data.api.NewsPostDto
import mx.nexara.mobile.nativeapp.data.extra.ExtraRepository
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSearchField
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader

@Composable
private fun CatalogItemDetail(pairs: List<Pair<String, String>>, onBack: () -> Unit) {
    LazyColumn(
        modifier = Modifier.fillMaxSize().background(NxColors.Surface),
        contentPadding = PaddingValues(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        item { OutlinedButton(onClick = onBack) { Text("← Volver") } }
        item {
            NxPanelShell {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    pairs.forEach { (label, value) ->
                        if (value.isBlank()) return@forEach
                        Row(Modifier.fillMaxWidth()) {
                            Text(label, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
                            Spacer(Modifier.padding(4.dp))
                            Text(value.take(100), color = NxColors.Muted, modifier = Modifier.weight(1f))
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun <T> CatalogRichScreen(
    title: String,
    subtitle: String? = null,
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
    val scope = rememberCoroutineScope()
    var loading by remember { mutableStateOf(true) }
    var isRefreshing by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var query by remember { mutableStateOf("") }
    var items by remember { mutableStateOf<List<T>>(emptyList()) }
    var selected by remember { mutableStateOf<T?>(null) }

    fun reload(initial: Boolean = true) {
        scope.launch {
            loading = initial && items.isEmpty()
            isRefreshing = !initial
            error = null
            try {
                items = withContext(Dispatchers.IO) { load(repo) }
            } catch (e: Exception) {
                error = e.message ?: "No se pudieron cargar los registros"
            } finally {
                loading = false
                isRefreshing = false
            }
        }
    }

    LaunchedEffect(Unit) { reload(initial = true) }

    val sel = selected
    if (sel != null) {
        CatalogItemDetail(pairs = detailPairs(sel), onBack = { selected = null })
        return
    }

    val filtered = if (query.isBlank()) items else {
        val q = query.lowercase()
        items.filter { matches(it, q) }
    }

    PullToRefreshBox(
        isRefreshing = isRefreshing,
        onRefresh = { reload(initial = false) },
        modifier = Modifier.fillMaxSize(),
    ) {
        Column(Modifier.fillMaxSize().background(NxColors.Surface)) {
            Column(Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
                NxSectionHeader(title = title, subtitle = subtitle)
            }
            if (kpis.isNotEmpty()) {
                Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
                    kpis.forEach { (label, value) ->
                        NxPanelShell(contentPadding = PaddingValues(12.dp)) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Text(value, fontWeight = FontWeight.Bold, color = NxColors.Teal)
                                Text(label, style = MaterialTheme.typography.labelSmall, color = NxColors.Muted)
                            }
                        }
                    }
                }
                Spacer(Modifier.padding(4.dp))
            }
            NxSearchField(
                value = query,
                onValueChange = { query = it },
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                placeholder = placeholder,
            )
            Spacer(Modifier.padding(4.dp))
            when {
                loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    NxLoadingBlock("Cargando…")
                }
                error != null -> Box(Modifier.fillMaxSize().padding(16.dp), contentAlignment = Alignment.TopCenter) {
                    NxErrorBlock(error!!) { reload(initial = false) }
                }
                filtered.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    NxEmptyState(
                        title = "Sin registros",
                        subtitle = "No hay elementos que coincidan con tu búsqueda.",
                        actionLabel = "Actualizar",
                        onAction = { reload(initial = false) },
                    )
                }
                else -> LazyColumn(Modifier.padding(horizontal = 16.dp)) {
                    item { NxSectionHeader("Resultados", "${filtered.size} registro(s)") }
                    items(filtered.take(80), key = { keyOf(it) }) { row ->
                        NxPanelShell(
                            onClick = { selected = row },
                            modifier = Modifier.padding(vertical = 4.dp),
                        ) {
                            Text(titleOf(row).ifBlank { "—" }, fontWeight = FontWeight.Bold)
                            val sub = subtitleOf(row)
                            if (sub.isNotBlank()) Text(sub, style = MaterialTheme.typography.bodySmall, color = NxColors.Muted)
                            val meta = metaOf(row)
                            if (meta.isNotBlank()) Text(meta.take(40), style = MaterialTheme.typography.labelSmall, color = NxColors.Muted)
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun AuditRichScreen() = CatalogRichScreen(
    title = "Auditoría",
    subtitle = "Registro de acciones del sistema",
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DocumentsRichScreen() {
    val app = androidx.compose.ui.platform.LocalContext.current.applicationContext as Application
    val repo = remember { ExtraRepository(app) }
    val scope = rememberCoroutineScope()
    var loading by remember { mutableStateOf(true) }
    var isRefreshing by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var query by remember { mutableStateOf("") }
    var items by remember { mutableStateOf<List<DocumentDto>>(emptyList()) }
    var selected by remember { mutableStateOf<DocumentDto?>(null) }
    var showUpload by remember { mutableStateOf(false) }
    var titleInput by remember { mutableStateOf("") }
    var fileDataUrl by remember { mutableStateOf<String?>(null) }
    var uploading by remember { mutableStateOf(false) }
    var actionMessage by remember { mutableStateOf<String?>(null) }
    val context = androidx.compose.ui.platform.LocalContext.current

    fun reload(initial: Boolean = true) {
        scope.launch {
            loading = initial && items.isEmpty()
            isRefreshing = !initial
            error = null
            try {
                items = withContext(Dispatchers.IO) { repo.documents() }
            } catch (e: Exception) {
                error = e.message ?: "No se pudieron cargar documentos"
            } finally {
                loading = false
                isRefreshing = false
            }
        }
    }

    LaunchedEffect(Unit) { reload(initial = true) }

    if (showUpload) {
        Column(Modifier.fillMaxSize().background(NxColors.Surface).padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            OutlinedButton(onClick = { showUpload = false; actionMessage = null }) { Text("← Cancelar") }
            Text("Subir documento", fontWeight = FontWeight.Bold)
            NxPanelShell {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedTextField(
                        value = titleInput,
                        onValueChange = { titleInput = it },
                        label = { Text("Título") },
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Text("Archivo (PDF o imagen)", fontWeight = FontWeight.SemiBold)
                    mx.nexara.mobile.nativeapp.ui.common.MediaPickerBar(
                        onPicked = { picked ->
                            fileDataUrl = picked.firstOrNull()?.let {
                                mx.nexara.mobile.nativeapp.ui.common.ImageDataUrl.fromCaptured(context, it)
                            }
                        },
                        allowCamera = true,
                        allowGallery = true,
                        allowDocuments = true,
                    )
                    if (fileDataUrl != null) {
                        Text("✓ Archivo listo", color = NxColors.Success, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
            actionMessage?.let { Text(it, color = if (it.startsWith("✅")) NxColors.Success else NxColors.Danger) }
            Button(
                onClick = {
                    if (titleInput.isBlank()) {
                        actionMessage = "❌ Indica título"
                        return@Button
                    }
                    if (fileDataUrl.isNullOrBlank()) {
                        actionMessage = "❌ Adjunta archivo"
                        return@Button
                    }
                    uploading = true
                    scope.launch {
                        try {
                            withContext(Dispatchers.IO) {
                                repo.createDocument(
                                    title = titleInput.trim(),
                                    fileUrl = fileDataUrl!!,
                                    mimeType = if (fileDataUrl!!.contains("pdf")) "application/pdf" else "image/jpeg",
                                )
                            }
                            actionMessage = "✅ Documento subido"
                            showUpload = false
                            titleInput = ""; fileDataUrl = null
                            reload(initial = false)
                        } catch (e: Exception) {
                            actionMessage = "❌ ${e.message ?: "No se pudo subir"}"
                        } finally {
                            uploading = false
                        }
                    }
                },
                enabled = !uploading,
                modifier = Modifier.fillMaxWidth(),
            ) { Text(if (uploading) "Subiendo…" else "Subir") }
        }
        return
    }

    val sel = selected
    if (sel != null) {
        fun act(label: String, block: suspend () -> Unit) {
            uploading = true
            actionMessage = null
            scope.launch {
                try {
                    withContext(Dispatchers.IO) { block() }
                    actionMessage = "✅ $label"
                    selected = null
                    reload(initial = false)
                } catch (e: Exception) {
                    actionMessage = "❌ ${e.message ?: "No se pudo completar la acción"}"
                } finally {
                    uploading = false
                }
            }
        }
        LazyColumn(
            modifier = Modifier.fillMaxSize().background(NxColors.Surface),
            contentPadding = PaddingValues(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            item { OutlinedButton(onClick = { selected = null }) { Text("← Volver") } }
            item {
                NxPanelShell {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf(
                            "Título" to (sel.title ?: ""),
                            "Tipo" to (sel.type ?: ""),
                            "URL" to (sel.fileUrl ?: ""),
                            "Fecha" to (sel.createdAt ?: ""),
                        ).forEach { (label, value) ->
                            if (value.isBlank()) return@forEach
                            Row(Modifier.fillMaxWidth()) {
                                Text(label, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
                                Spacer(Modifier.padding(4.dp))
                                Text(value.take(100), color = NxColors.Muted, modifier = Modifier.weight(1f))
                            }
                        }
                    }
                }
            }
            item {
                Button(
                    onClick = { act("Documento aprobado") { repo.approveDocument(sel.id) } },
                    enabled = !uploading,
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Aprobar") }
            }
            item {
                OutlinedButton(
                    onClick = { act("Documento archivado") { repo.archiveDocument(sel.id) } },
                    enabled = !uploading,
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Archivar") }
            }
            actionMessage?.let { msg ->
                item {
                    Text(
                        msg,
                        color = if (msg.startsWith("✅")) NxColors.Success else NxColors.Danger,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
        }
        return
    }

    val filtered = items.filter { row ->
        if (query.isBlank()) return@filter true
        val q = query.lowercase()
        (row.title ?: "").lowercase().contains(q) || (row.type ?: "").lowercase().contains(q)
    }

    PullToRefreshBox(isRefreshing = isRefreshing, onRefresh = { reload(initial = false) }, modifier = Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize().background(NxColors.Surface)) {
            NxSectionHeader(title = "Documentos", subtitle = "Biblioteca de archivos")
            NxSearchField(value = query, onValueChange = { query = it }, placeholder = "Buscar documento…")
            Spacer(Modifier.height(8.dp))
            Button(onClick = { showUpload = true; actionMessage = null }, modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp)) {
                Text("+ Subir documento")
            }
            actionMessage?.let { msg ->
                Text(
                    msg,
                    color = if (msg.startsWith("✅")) NxColors.Success else NxColors.Danger,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
                )
            }
            Spacer(Modifier.height(8.dp))
            when {
                loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { NxLoadingBlock("Cargando…") }
                error != null -> NxErrorBlock(error!!) { reload() }
                filtered.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    NxEmptyState("Sin documentos", "No hay archivos en la biblioteca.")
                }
                else -> LazyColumn(contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(filtered.take(80), key = { it.id }) { doc ->
                        NxPanelShell(onClick = { selected = doc }) {
                            Text(doc.title ?: "Documento", fontWeight = FontWeight.SemiBold)
                            Text(doc.type ?: "", style = MaterialTheme.typography.bodySmall, color = NxColors.Muted)
                            doc.createdAt?.take(10)?.let {
                                Text(it, style = MaterialTheme.typography.labelSmall, color = NxColors.Muted)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun NewsRichScreen() = CatalogRichScreen(
    title = "Noticias",
    subtitle = "Comunicados y publicaciones",
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
    title = "Mensajes de contacto",
    subtitle = "Bandeja de consultas web",
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

