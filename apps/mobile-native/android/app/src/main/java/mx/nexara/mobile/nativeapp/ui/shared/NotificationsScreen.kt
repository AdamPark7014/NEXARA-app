package mx.nexara.mobile.nativeapp.ui.shared

import android.app.Application
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.VerticalDivider
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.access.DeepLinkDestination
import mx.nexara.mobile.nativeapp.access.NotificationDeepLinkResolver
import mx.nexara.mobile.nativeapp.data.api.NotificationRowDto
import mx.nexara.mobile.nativeapp.data.notifications.NotificationsRepository
import mx.nexara.mobile.nativeapp.data.realtime.RealtimeBus
import mx.nexara.mobile.nativeapp.ui.console.activities.CoreActivityRules
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSkeletonList
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSnackbarHost
import mx.nexara.mobile.nativeapp.ui.enterprise.rememberNxSnackbarHostState
import mx.nexara.mobile.nativeapp.data.api.toUserMessage

enum class NotificationFilter { ALL, UNREAD }

/**
 * Cubos de categoría del centro de notificaciones web (`bucketCategory` en
 * `apps/web/app/(panels)/erp/notifications-center/page.tsx`).
 */
enum class NotificationCategory(val label: String) {
    TODAS("Todas"),
    OPS("Actividades"),
    ASISTENCIA("Asistencia"),
    CHAT("Chat"),
    OTRAS("Otras"),
    ;

    companion object {
        fun of(category: String?): NotificationCategory {
            val c = category?.trim()?.lowercase().orEmpty()
            return when {
                c.contains("sla") || c.startsWith("activit") || c.startsWith("evidence") ||
                    c == "approval" || c == "confirmations" || c == "erp" -> OPS
                c == "attendance" || c.startsWith("lunch") -> ASISTENCIA
                c == "chat" -> CHAT
                else -> OTRAS
            }
        }
    }
}

/** Etiqueta legible de la categoría cruda, igual que `CATEGORY_LABEL` en la web (solo Core). */
internal val NOTIFICATION_CATEGORY_LABEL: Map<String, String> = mapOf(
    "attendance" to "Asistencia",
    "lunch_break" to "Comida",
    "lunch_breaks" to "Comida",
    "activity" to "Actividad",
    "activities" to "Actividad",
    "approval" to "Aprobación",
    "evidence" to "Evidencias",
    "evidences" to "Evidencias",
    "sla-alert" to "Atraso",
    "sla-breach" to "Atraso",
    "chat" to "Chat",
    "profile" to "Perfil",
    "confirmations" to "Confirmación",
    "security" to "Seguridad",
)

/** Categorías de módulos retirados de Core: sus avisos viejos no se listan. */
internal fun isLegacyNotificationCategory(category: String?): Boolean {
    val c = category?.trim()?.lowercase().orEmpty()
    return c in setOf("quotes", "sales", "crm", "tool", "tools", "viatics", "vehicles", "fines", "tickets", "orders", "stock-alert", "margin-alert", "workflow", "asc", "ops-acs", "finance")
}

enum class NotificationViewMode { BANDEJA, FEED }

/** Reglas de «abrir la bandeja la da por vista», sin Android para poder probarlas. */
internal object NotificationSeen {
    /** Ids que llegaron sin leer (se muestran como «Nuevo» durante la visita). */
    fun unreadIds(rows: List<NotificationRowDto>): Set<Long> =
        rows.filter { it.isRead != true }.map { it.id }.toSet()

    /** Solo se llama al API si de verdad hay algo sin leer (contador o lista). */
    fun shouldMarkAll(unreadCount: Int, rows: List<NotificationRowDto>): Boolean =
        unreadCount > 0 || rows.any { it.isRead != true }

    /** «Nuevo» = llegó sin leer en esta visita o sigue sin leer. */
    fun isNew(row: NotificationRowDto, newIds: Set<Long>): Boolean =
        row.id in newIds || row.isRead != true
}

data class NotificationsUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val saving: Boolean = false,
    val error: String? = null,
    val message: String? = null,
    val unreadCount: Int = 0,
    val rows: List<NotificationRowDto> = emptyList(),
    val filter: NotificationFilter = NotificationFilter.ALL,
    val category: NotificationCategory = NotificationCategory.TODAS,
    val viewMode: NotificationViewMode = NotificationViewMode.BANDEJA,
    val feedItems: List<Map<String, Any?>> = emptyList(),
    /**
     * Avisos que llegaron sin leer en esta visita. Abrir la pantalla ya los da por
     * vistos en el servidor; aquí se recuerdan para marcarlos «Nuevo» hasta salir.
     */
    val newIds: Set<Long> = emptySet(),
)

class NotificationsViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = NotificationsRepository(app.applicationContext)
    private val consoleRepo = mx.nexara.mobile.nativeapp.data.console.ConsoleRepository(app.applicationContext)
    private val _state = MutableStateFlow(NotificationsUiState())
    val state: StateFlow<NotificationsUiState> = _state

    init {
        refresh(initial = true)
        var lastEventAt = 0L
        viewModelScope.launch {
            RealtimeBus.events.collect { event ->
                val model = event.model?.trim()?.lowercase()
                if (model != null && model != "notification") return@collect
                val now = System.currentTimeMillis()
                if (now - lastEventAt < 750) return@collect
                lastEventAt = now
                refresh(initial = false)
            }
        }
    }

    fun dismissMessage() = _state.update { it.copy(message = null) }

    fun setFilter(filter: NotificationFilter) = _state.update { it.copy(filter = filter) }

    fun setCategory(category: NotificationCategory) = _state.update { it.copy(category = category) }

    fun setViewMode(mode: NotificationViewMode) {
        _state.update { it.copy(viewMode = mode) }
        if (mode == NotificationViewMode.FEED && _state.value.feedItems.isEmpty()) {
            loadFeed()
        }
    }

    fun loadFeed() {
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            try {
                val items = withContext(Dispatchers.IO) { consoleRepo.activityFeed(limit = 40) }
                _state.update { it.copy(isLoading = false, feedItems = items, error = null) }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        isLoading = false,
                        error = e.toUserMessage("No se pudo cargar el feed"),
                    )
                }
            }
        }
    }

    /**
     * @param markSeen true cuando la persona está mirando la lista (al abrir y al
     * deslizar para actualizar): lo que llegue sin leer se da por visto. Los
     * refrescos en tiempo real no marcan nada.
     */
    fun refresh(initial: Boolean = false, markSeen: Boolean = initial) {
        _state.update {
            if (initial) it.copy(isLoading = true, error = null, message = null)
            else it.copy(isRefreshing = true, error = null)
        }
        viewModelScope.launch {
            try {
                val count = withContext(Dispatchers.IO) { repo.unreadCount().unreadCount }
                val list = withContext(Dispatchers.IO) { repo.list(limit = 50, offset = 0) }
                _state.update {
                    it.copy(
                        isLoading = false,
                        isRefreshing = false,
                        rows = list,
                        unreadCount = count,
                        error = null,
                        newIds = it.newIds + NotificationSeen.unreadIds(list),
                    )
                }
                if (markSeen && NotificationSeen.shouldMarkAll(count, list)) markAllSeen()
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        isLoading = false,
                        isRefreshing = false,
                        error = e.message?.takeIf { m -> m.isNotBlank() } ?: "No se pudieron cargar notificaciones",
                    )
                }
            }
        }
    }

    /**
     * Abrir la bandeja = verla: se usa el mismo «leer todo» del API, una vez por
     * carga y sin avisos en pantalla. Si falla (sin red) no pasa nada visible:
     * los avisos siguen sin leer y se vuelve a intentar la próxima vez.
     */
    private fun markAllSeen() {
        viewModelScope.launch {
            runCatching { withContext(Dispatchers.IO) { repo.markAllRead() } }
                .onSuccess {
                    _state.update { s ->
                        s.copy(
                            rows = s.rows.map { if (it.isRead == true) it else it.copy(isRead = true) },
                            unreadCount = 0,
                        )
                    }
                }
        }
    }

    fun markRead(id: Long, onDone: (() -> Unit)? = null) {
        val row = _state.value.rows.firstOrNull { it.id == id }
        if (row?.isRead == true) {
            onDone?.invoke()
            return
        }
        _state.update { it.copy(saving = true, error = null, message = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.markRead(id) }
                _state.update { state ->
                    state.copy(
                        saving = false,
                        rows = state.rows.map { if (it.id == id) it.copy(isRead = true) else it },
                        unreadCount = (state.unreadCount - 1).coerceAtLeast(0),
                    )
                }
                onDone?.invoke()
            } catch (e: Exception) {
                _state.update { it.copy(saving = false, error = e.toUserMessage("No se pudo marcar")) }
            }
        }
    }

    fun delete(id: Long) {
        _state.update { it.copy(saving = true, error = null, message = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.delete(id) }
                _state.update { it.copy(saving = false, message = "Eliminada") }
                refresh(initial = false)
            } catch (e: Exception) {
                _state.update { it.copy(saving = false, error = e.toUserMessage("No se pudo eliminar")) }
            }
        }
    }

    fun openNotification(notification: NotificationRowDto, onNavigate: (DeepLinkDestination) -> Unit) {
        val destination = NotificationDeepLinkResolver.resolve(notification)
        val navigate: () -> Unit = {
            if (destination != null) onNavigate(destination)
        }
        if (notification.isRead != true) {
            markRead(notification.id, onDone = navigate)
        } else {
            navigate()
        }
    }
}

/**
 * Avisos visibles: sin módulos retirados de Core, filtrados por categoría y, con
 * [NotificationFilter.UNREAD], solo los «Nuevos» de esta visita.
 */
internal fun visibleNotificationRows(
    rows: List<NotificationRowDto>,
    filter: NotificationFilter,
    category: NotificationCategory,
    newIds: Set<Long> = emptySet(),
): List<NotificationRowDto> = rows
    .filter { !isLegacyNotificationCategory(it.category) }
    .filter { filter == NotificationFilter.ALL || NotificationSeen.isNew(it, newIds) }
    .filter { category == NotificationCategory.TODAS || NotificationCategory.of(it.category) == category }

/** Conteo por categoría sobre lo que sí se lista (sin avisos de módulos retirados). */
internal fun notificationCategoryCounts(rows: List<NotificationRowDto>): Map<NotificationCategory, Int> {
    val core = rows.filter { !isLegacyNotificationCategory(it.category) }
    return NotificationCategory.entries.associateWith { cat ->
        if (cat == NotificationCategory.TODAS) core.size
        else core.count { NotificationCategory.of(it.category) == cat }
    }
}

/**
 * Bandeja de Core. Abrirla da todo por visto (un solo «leer todo» al cargar);
 * lo que llegó sin leer se queda marcado «Nuevo» mientras sigas aquí.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationsScreen(
    onOpenDestination: ((DeepLinkDestination) -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    val vm: NotificationsViewModel = viewModel()
    val state by vm.state.collectAsState()
    val filteredRows = visibleNotificationRows(state.rows, state.filter, state.category, state.newIds)
    val counts = notificationCategoryCounts(state.rows)
    val nuevos = visibleNotificationRows(state.rows, NotificationFilter.UNREAD, NotificationCategory.TODAS, state.newIds).size
    val snackbar = rememberNxSnackbarHostState()

    // Confirmaciones cortas («Eliminada») sin botón «Cerrar».
    LaunchedEffect(state.message) {
        val msg = state.message ?: return@LaunchedEffect
        vm.dismissMessage()
        snackbar.showSnackbar(msg)
    }

    Box(modifier = modifier.fillMaxSize().background(NxColors.Surface)) {
        Column(Modifier.fillMaxSize()) {
            NotificationFilterRow(
                state = state,
                counts = counts,
                nuevos = nuevos,
                onUnread = {
                    vm.setViewMode(NotificationViewMode.BANDEJA)
                    vm.setFilter(
                        if (state.filter == NotificationFilter.UNREAD) NotificationFilter.ALL else NotificationFilter.UNREAD,
                    )
                },
                onCategory = { cat ->
                    vm.setViewMode(NotificationViewMode.BANDEJA)
                    vm.setCategory(cat)
                },
                onFeed = {
                    vm.setViewMode(
                        if (state.viewMode == NotificationViewMode.FEED) NotificationViewMode.BANDEJA else NotificationViewMode.FEED,
                    )
                },
            )

            PullToRefreshBox(
                isRefreshing = state.isRefreshing,
                onRefresh = {
                    // Deslizar para actualizar es mirar la lista: lo nuevo también queda visto.
                    if (state.viewMode == NotificationViewMode.FEED) vm.loadFeed() else vm.refresh(initial = false, markSeen = true)
                },
                modifier = Modifier.fillMaxSize(),
            ) {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 24.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    if (state.viewMode == NotificationViewMode.FEED) {
                        feedItems(state, onRetry = vm::loadFeed)
                        return@LazyColumn
                    }

                    if (state.isLoading && state.rows.isEmpty()) {
                        item { NxSkeletonList() }
                        return@LazyColumn
                    }

                    if (!state.error.isNullOrBlank()) {
                        item { NxErrorBlock(state.error!!) { vm.refresh(initial = true) } }
                    }

                    if (filteredRows.isEmpty() && state.error.isNullOrBlank()) {
                        item {
                            val filtrando = state.filter == NotificationFilter.UNREAD ||
                                state.category != NotificationCategory.TODAS
                            if (filtrando) {
                                NxEmptyState(
                                    title = "Nada con este filtro",
                                    subtitle = "No hay avisos que coincidan.",
                                    actionLabel = "Ver todos",
                                    onAction = {
                                        vm.setFilter(NotificationFilter.ALL)
                                        vm.setCategory(NotificationCategory.TODAS)
                                    },
                                )
                            } else {
                                NxEmptyState(
                                    title = "Todo al día",
                                    subtitle = "Cuando algo necesite tu atención aparecerá aquí.",
                                )
                            }
                        }
                    } else {
                        items(filteredRows, key = { it.id }) { n ->
                            NotificationCard(
                                n = n,
                                isNew = NotificationSeen.isNew(n, state.newIds),
                                saving = state.saving,
                                navigable = NotificationDeepLinkResolver.resolve(n) != null && onOpenDestination != null,
                                onOpen = { vm.openNotification(n) { dest -> onOpenDestination?.invoke(dest) } },
                                onDelete = { vm.delete(n.id) },
                            )
                        }
                    }
                }
            }
        }
        NxSnackbarHost(snackbar, Modifier.align(Alignment.BottomCenter).padding(16.dp))
    }
}

/**
 * Una sola fila deslizable: «Nuevos» · categorías · «Actividad reciente».
 * Antes eran tres filas (Bandeja/Feed, Todas/Sin leer y categorías).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun NotificationFilterRow(
    state: NotificationsUiState,
    counts: Map<NotificationCategory, Int>,
    nuevos: Int,
    onUnread: () -> Unit,
    onCategory: (NotificationCategory) -> Unit,
    onFeed: () -> Unit,
) {
    val bandeja = state.viewMode == NotificationViewMode.BANDEJA
    // Categorías vacías no ocupan lugar; la elegida se queda aunque ya no tenga avisos.
    val categorias = NotificationCategory.entries.filter { cat ->
        cat == NotificationCategory.TODAS || (counts[cat] ?: 0) > 0 || cat == state.category
    }
    LazyRow(
        modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // «Nuevos» solo existe si esta visita trajo algo nuevo (o si ya está elegido).
        if (nuevos > 0 || state.filter == NotificationFilter.UNREAD) {
            item(key = "unread") {
                FilterChip(
                    selected = bandeja && state.filter == NotificationFilter.UNREAD,
                    onClick = onUnread,
                    label = { Text("Nuevos ($nuevos)", maxLines = 1) },
                )
            }
            item(key = "sep-1") { VerticalDivider(Modifier.height(24.dp)) }
        }
        items(categorias, key = { "cat-${it.name}" }) { cat ->
            FilterChip(
                selected = bandeja && state.category == cat,
                onClick = { onCategory(cat) },
                label = { Text("${cat.label} (${counts[cat] ?: 0})", maxLines = 1) },
            )
        }
        item(key = "sep-2") { VerticalDivider(Modifier.height(24.dp)) }
        item(key = "feed") {
            FilterChip(
                selected = !bandeja,
                onClick = onFeed,
                label = { Text("Actividad reciente", maxLines = 1) },
            )
        }
    }
}

private fun LazyListScope.feedItems(
    state: NotificationsUiState,
    onRetry: () -> Unit,
) {
    when {
        state.isLoading && state.feedItems.isEmpty() -> item { NxSkeletonList() }
        !state.error.isNullOrBlank() && state.feedItems.isEmpty() -> item { NxErrorBlock(state.error!!, onRetry) }
        state.feedItems.isEmpty() -> item {
            NxEmptyState(title = "Sin actividad reciente", subtitle = "Aquí verás lo último que pasó en tu equipo.")
        }
        else -> items(state.feedItems.size) { idx ->
            val item = state.feedItems[idx]
            val title = (item["title"] as? String).orEmpty().ifBlank { "Evento" }
            val subtitle = (item["subtitle"] as? String).orEmpty()
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = NxColors.Card),
            ) {
                Column(Modifier.padding(14.dp)) {
                    Text(title, style = MaterialTheme.typography.titleSmall, color = NxColors.Slate)
                    if (subtitle.isNotBlank()) {
                        Text(subtitle, style = MaterialTheme.typography.bodySmall, color = NxColors.Muted)
                    }
                }
            }
        }
    }
}

@Composable
private fun NotificationCard(
    n: NotificationRowDto,
    /** Llegó sin leer en esta visita: fondo azul tenue y etiqueta «Nuevo» hasta salir. */
    isNew: Boolean,
    saving: Boolean,
    navigable: Boolean,
    onOpen: () -> Unit,
    onDelete: () -> Unit,
) {
    var menu by remember(n.id) { mutableStateOf(false) }
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .then(if (navigable) Modifier.clickable(onClick = onOpen) else Modifier),
        colors = CardDefaults.cardColors(
            containerColor = if (isNew) NxColors.BrandTint else NxColors.Card,
        ),
    ) {
        Row(
            Modifier.padding(start = 14.dp, top = 12.dp, bottom = 12.dp, end = 4.dp),
            verticalAlignment = Alignment.Top,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Box(
                Modifier
                    .padding(top = 7.dp)
                    .size(8.dp)
                    .clip(CircleShape)
                    .background(if (isNew) NxColors.Brand else Color.Transparent),
            )
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                if (isNew) {
                    Text(
                        "Nuevo",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = NxColors.Brand,
                    )
                }
                Text(
                    n.title ?: "Notificación",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = if (isNew) FontWeight.SemiBold else FontWeight.Normal,
                    color = NxColors.Slate,
                )
                if (!n.message.isNullOrBlank()) {
                    Text(
                        n.message,
                        style = MaterialTheme.typography.bodyMedium,
                        color = NxColors.Muted,
                        maxLines = 3,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                val meta = buildList {
                    n.category?.takeIf { it.isNotBlank() }?.let { raw ->
                        add(NOTIFICATION_CATEGORY_LABEL[raw.lowercase()] ?: raw)
                    }
                    // «Hace 12 min» en vez de la fecha ISO cruda.
                    CoreActivityRules.relativeTime(n.createdAt)
                        .takeIf { it.isNotBlank() }
                        ?.let { add(it) }
                }.joinToString(" · ")
                if (meta.isNotBlank()) {
                    Text(meta, style = MaterialTheme.typography.labelMedium, color = NxColors.Muted)
                }
            }
            Box {
                IconButton(onClick = { menu = true }, enabled = !saving) {
                    Icon(Icons.Default.MoreVert, contentDescription = "Opciones de la notificación")
                }
                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                    DropdownMenuItem(
                        text = { Text("Eliminar", color = NxColors.Danger) },
                        onClick = {
                            menu = false
                            onDelete()
                        },
                    )
                }
            }
        }
    }
}
