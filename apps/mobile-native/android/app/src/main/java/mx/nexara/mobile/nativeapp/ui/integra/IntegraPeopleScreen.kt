package mx.nexara.mobile.nativeapp.ui.integra

import android.app.Application
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
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
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.integra.IntegraRepository
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSearchField
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraFormat
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraOpMessage
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraPicker
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraShowingCount
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraSiteBar
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraSitesCache
import mx.nexara.mobile.nativeapp.ui.integra.common.PeopleSort
import mx.nexara.mobile.nativeapp.ui.integra.common.USER_TYPES
import mx.nexara.mobile.nativeapp.ui.integra.common.VALIDITY_FILTERS
import mx.nexara.mobile.nativeapp.ui.integra.common.Validity
import mx.nexara.mobile.nativeapp.ui.integra.common.ValidityState
import mx.nexara.mobile.nativeapp.ui.integra.common.bool
import mx.nexara.mobile.nativeapp.ui.integra.common.credencialesLabel
import mx.nexara.mobile.nativeapp.ui.integra.common.credentialScore
import mx.nexara.mobile.nativeapp.ui.integra.common.describeValidity
import mx.nexara.mobile.nativeapp.ui.integra.common.faceOn
import mx.nexara.mobile.nativeapp.ui.integra.common.int
import mx.nexara.mobile.nativeapp.ui.integra.common.nestedPerson
import mx.nexara.mobile.nativeapp.ui.integra.common.ordenarPersonas
import mx.nexara.mobile.nativeapp.ui.integra.common.personMatches
import mx.nexara.mobile.nativeapp.ui.integra.common.str
import mx.nexara.mobile.nativeapp.ui.integra.common.strOrNull
import mx.nexara.mobile.nativeapp.ui.integra.common.stringList
import mx.nexara.mobile.nativeapp.ui.integra.common.subMap
import mx.nexara.mobile.nativeapp.ui.integra.common.userTypeLabel
import java.time.Instant
import java.time.ZoneId

private const val PERSON_PAGE = 40

/**
 * Directorio ACS.
 *
 * La pregunta que resuelve esta pantalla no es «quién existe», es **quién no va
 * a poder entrar mañana**. Por eso la vigencia sale en cada tarjeta, hay un
 * orden por urgencia, y las credenciales (rostro / tarjeta / huella) se cuentan:
 * una persona vigente sin ninguna credencial tampoco entra.
 *
 * El vínculo con el ERP se lee de `erpUser`, que el servidor ya adjunta a cada
 * fila. La web lo vuelve a deducir pidiendo el directorio entero de usuarios; en
 * un móvil eso es una petición grande para un dato que ya venía.
 */
data class IntegraPeopleUiState(
    val loading: Boolean = true,
    val isRefreshing: Boolean = false,
    val error: String? = null,
    val items: List<Map<String, Any?>> = emptyList(),
    val source: String = "",
    val live: Boolean = false,
    val query: String = "",
    val validityFilter: ValidityState? = null,
    val userTypeFilter: String = "",
    val doorFilter: String = "",
    /** `""` sin filtrar · `si` con rostro · `no` sin rostro. */
    val faceFilter: String = "",
    /** `""` sin filtrar · `si` vinculada · `no` sin vincular. */
    val erpFilter: String = "",
    val sort: PeopleSort = PeopleSort.Nombre,
    val limit: Int = PERSON_PAGE,
    val acting: Boolean = false,
    val message: String? = null,
    val messageIsError: Boolean = false,
    val zone: ZoneId = IntegraFormat.MexicoCity,
)

class IntegraPeopleViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = IntegraRepository(app.applicationContext)
    private val _state = MutableStateFlow(IntegraPeopleUiState(zone = ZoneId.systemDefault()))
    val state: StateFlow<IntegraPeopleUiState> = _state

    init { refresh() }

    fun setQuery(v: String) = _state.update { it.copy(query = v, limit = PERSON_PAGE) }
    fun setSort(v: PeopleSort) = _state.update { it.copy(sort = v, limit = PERSON_PAGE) }
    fun setDoorFilter(v: String) = _state.update { it.copy(doorFilter = v, limit = PERSON_PAGE) }
    fun clearMessage() = _state.update { it.copy(message = null) }
    fun showMore() = _state.update { it.copy(limit = it.limit + PERSON_PAGE) }

    fun setValidityFilter(v: ValidityState) = _state.update {
        it.copy(validityFilter = if (it.validityFilter == v) null else v, limit = PERSON_PAGE)
    }
    fun setUserTypeFilter(v: String) = _state.update {
        it.copy(userTypeFilter = if (it.userTypeFilter == v) "" else v, limit = PERSON_PAGE)
    }
    fun setFaceFilter(v: String) = _state.update {
        it.copy(faceFilter = if (it.faceFilter == v) "" else v, limit = PERSON_PAGE)
    }
    fun setErpFilter(v: String) = _state.update {
        it.copy(erpFilter = if (it.erpFilter == v) "" else v, limit = PERSON_PAGE)
    }
    fun clearFilters() = _state.update {
        it.copy(
            query = "",
            validityFilter = null,
            userTypeFilter = "",
            doorFilter = "",
            faceFilter = "",
            erpFilter = "",
            limit = PERSON_PAGE,
        )
    }

    fun setLive(v: Boolean) {
        _state.update { it.copy(live = v) }
        refresh(initial = false)
    }

    fun selectSite(siteId: Int?) {
        repo.selectSite(siteId)
        _state.update { it.copy(items = emptyList(), limit = PERSON_PAGE) }
        refresh()
    }

    fun refresh(initial: Boolean = true) {
        _state.update {
            it.copy(loading = initial && it.items.isEmpty(), isRefreshing = !initial, error = null)
        }
        viewModelScope.launch {
            IntegraSitesCache.ensure(repo)
            try {
                val list = withContext(Dispatchers.IO) { repo.people(live = _state.value.live) }
                _state.update {
                    it.copy(
                        loading = false,
                        isRefreshing = false,
                        items = list,
                        source = if (it.live) "live" else "mirror",
                    )
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        loading = false,
                        isRefreshing = false,
                        error = e.toUserMessage("No se pudieron cargar las personas"),
                    )
                }
            }
        }
    }

    fun createPerson(name: String, code: String, autoCode: Boolean, onDone: (String?) -> Unit) {
        if (name.trim().length < 2) {
            _state.update { it.copy(message = "El nombre necesita al menos 2 caracteres", messageIsError = true) }
            return
        }
        if (!autoCode && code.isBlank()) {
            _state.update { it.copy(message = "Indica el código o activa el automático", messageIsError = true) }
            return
        }
        if (_state.value.acting) return
        _state.update { it.copy(acting = true, message = null) }
        viewModelScope.launch {
            try {
                val creada = withContext(Dispatchers.IO) {
                    repo.addPerson(
                        personName = name,
                        personCode = code.takeIf { !autoCode },
                        employeeNo = code.takeIf { !autoCode },
                        autoCode = autoCode,
                    )
                }
                val id = strOrNull(creada, "id", "personId", "employeeNo")
                    ?: strOrNull(nestedPerson(creada), "id", "personId", "employeeNo")
                _state.update {
                    it.copy(acting = false, message = "Persona creada", messageIsError = false)
                }
                refresh(initial = false)
                onDone(id)
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        acting = false,
                        message = e.toUserMessage("No se pudo crear la persona"),
                        messageIsError = true,
                    )
                }
            }
        }
    }

    fun validityOf(person: Map<String, Any?>): Validity {
        val zone = _state.value.zone
        val validTo = strOrNull(person, "validTo")
        return describeValidity(
            validEnable = bool(person, "validEnable"),
            validTo = validTo,
            nowEpochDay = Instant.now().atZone(zone).toLocalDate().toEpochDay(),
            validToEpochDay = IntegraFormat.epochDay(validTo, zone),
        )
    }

    fun scoreOf(person: Map<String, Any?>): Int = credentialScore(
        numOfFace = int(person, "numOfFace"),
        numOfCard = int(person, "numOfCard"),
        numOfFP = int(person, "numOfFP"),
        hasFace = bool(person, "hasFace"),
        hasLocalFace = bool(person, "hasLocalFace"),
        localFpCount = (person["localFpIds"] as? List<*>)?.size ?: 0,
    )

    /** Tipos de usuario realmente presentes: no se ofrece filtrar por lo que no hay. */
    fun tiposPresentes(): List<Pair<String, String>> {
        val presentes = _state.value.items
            .mapNotNull { strOrNull(it, "userType")?.lowercase() }
            .distinct()
        return USER_TYPES.filter { it.first.lowercase() in presentes }
    }

    fun puertasPresentes(): List<Pair<String, String>> = _state.value.items
        .flatMap { stringList(it, "doorNames") }
        .filter { it.isNotBlank() }
        .distinct()
        .sorted()
        .map { it to it }

    fun filtered(): List<Map<String, Any?>> {
        val s = _state.value
        val filtradas = s.items.filter { p ->
            val vigencia = validityOf(p).state
            val tieneRostro = faceOn(int(p, "numOfFace"), bool(p, "hasFace"), bool(p, "hasLocalFace"))
            val tieneErp = subMap(p, "erpUser") != null
            (s.validityFilter == null || vigencia == s.validityFilter) &&
                (
                    s.userTypeFilter.isEmpty() ||
                        str(p, "userType").equals(s.userTypeFilter, ignoreCase = true)
                    ) &&
                (s.doorFilter.isEmpty() || s.doorFilter in stringList(p, "doorNames")) &&
                (s.faceFilter.isEmpty() || (s.faceFilter == "si") == tieneRostro) &&
                (s.erpFilter.isEmpty() || (s.erpFilter == "si") == tieneErp) &&
                personMatches(p, s.query)
        }
        return ordenarPersonas(filtradas, s.sort, ::validityOf, ::scoreOf)
    }

    fun conRostro(): Int = _state.value.items.count {
        faceOn(int(it, "numOfFace"), bool(it, "hasFace"), bool(it, "hasLocalFace"))
    }

    fun conErp(): Int = _state.value.items.count { subMap(it, "erpUser") != null }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun IntegraPeopleScreen(
    onOpenPerson: (String) -> Unit,
    vm: IntegraPeopleViewModel = viewModel(),
) {
    val s by vm.state.collectAsState()
    val sites by IntegraSitesCache.sites.collectAsState()
    val sitesLoading by IntegraSitesCache.loading.collectAsState()
    var showCreate by remember { mutableStateOf(false) }

    if (showCreate) {
        CreatePersonForm(
            state = s,
            onCancel = { showCreate = false; vm.clearMessage() },
            onCreate = { nombre, codigo, auto ->
                vm.createPerson(nombre, codigo, auto) { id ->
                    showCreate = false
                    if (!id.isNullOrBlank()) onOpenPerson(id)
                }
            },
        )
        return
    }

    val matching = vm.filtered()
    val rows = matching.take(s.limit)
    val puertas = vm.puertasPresentes()
    val tipos = vm.tiposPresentes()

    PullToRefreshBox(
        isRefreshing = s.isRefreshing,
        onRefresh = { vm.refresh(initial = false) },
        modifier = Modifier.fillMaxSize(),
    ) {
        when {
            s.loading -> NxLoadingBlock("Cargando personas…")
            s.error != null && s.items.isEmpty() -> NxErrorBlock(s.error.orEmpty()) { vm.refresh() }
            else -> LazyColumn(
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                item {
                    IntegraSiteBar(sites = sites, loading = sitesLoading, onSelect = vm::selectSite)
                }
                item {
                    Text(
                        "${s.items.size} persona(s) · ${vm.conRostro()} con rostro · " +
                            "${vm.conErp()} vinculadas al ERP · " +
                            if (s.source == "live") "consulta live" else "espejo",
                        style = MaterialTheme.typography.labelSmall,
                        color = NxColors.Muted,
                    )
                }
                item { IntegraOpMessage(s.message, s.messageIsError) }
                item {
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        NxSearchField(
                            value = s.query,
                            onValueChange = vm::setQuery,
                            placeholder = "Nombre, código, terminal…",
                            modifier = Modifier.weight(1f),
                        )
                        TextButton(onClick = { showCreate = true; vm.clearMessage() }) {
                            Text("+ Alta")
                        }
                    }
                }
                item {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        FilterChip(
                            selected = s.live,
                            onClick = { vm.setLive(!s.live) },
                            label = { Text(if (s.live) "Live ACS" else "Espejo") },
                        )
                        VALIDITY_FILTERS.forEach { (estado, etiqueta) ->
                            FilterChip(
                                selected = s.validityFilter == estado,
                                onClick = { vm.setValidityFilter(estado) },
                                label = { Text(etiqueta) },
                            )
                        }
                    }
                }
                item {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        FilterChip(
                            selected = s.faceFilter == "si",
                            onClick = { vm.setFaceFilter("si") },
                            label = { Text("Con rostro") },
                        )
                        FilterChip(
                            selected = s.faceFilter == "no",
                            onClick = { vm.setFaceFilter("no") },
                            label = { Text("Sin rostro") },
                        )
                        FilterChip(
                            selected = s.erpFilter == "si",
                            onClick = { vm.setErpFilter("si") },
                            label = { Text("Con ERP") },
                        )
                        FilterChip(
                            selected = s.erpFilter == "no",
                            onClick = { vm.setErpFilter("no") },
                            label = { Text("Sin ERP") },
                        )
                        tipos.forEach { (clave, etiqueta) ->
                            FilterChip(
                                selected = s.userTypeFilter == clave,
                                onClick = { vm.setUserTypeFilter(clave) },
                                label = { Text(etiqueta) },
                            )
                        }
                    }
                }
                item {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        PeopleSort.entries.forEach { orden ->
                            FilterChip(
                                selected = s.sort == orden,
                                onClick = { vm.setSort(orden) },
                                label = { Text(orden.label) },
                            )
                        }
                    }
                }
                if (puertas.isNotEmpty()) {
                    item {
                        IntegraPicker(
                            label = "Puede abrir",
                            options = puertas,
                            selected = s.doorFilter,
                            emptyLabel = "Cualquier puerta",
                            onSelect = vm::setDoorFilter,
                        )
                    }
                }

                if (rows.isEmpty()) {
                    item {
                        if (s.items.isEmpty()) {
                            NxEmptyState(
                                "Sin personas",
                                "El espejo ACS está vacío o esta cuenta no tiene acceso al directorio.",
                            )
                        } else {
                            NxEmptyState(
                                "Ninguna coincide",
                                "Ninguna de las ${s.items.size} personas del directorio pasa el filtro.",
                                actionLabel = "Quitar filtros",
                                onAction = vm::clearFilters,
                            )
                        }
                    }
                } else {
                    items(rows, key = { str(it, "id", "personId") }) { person ->
                        PersonCard(
                            person = person,
                            validity = vm.validityOf(person),
                            onOpen = {
                                val id = str(person, "id", "personId")
                                if (id.isNotBlank()) onOpenPerson(id)
                            },
                        )
                    }
                    item {
                        IntegraShowingCount(
                            shown = rows.size,
                            matching = matching.size,
                            total = s.items.size,
                            noun = "personas",
                            onMore = vm::showMore,
                        )
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PersonCard(
    person: Map<String, Any?>,
    validity: Validity,
    onOpen: () -> Unit,
) {
    val erp = subMap(person, "erpUser")
    Card(
        onClick = onOpen,
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = NxColors.Card),
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    str(person, "name", "personName").ifBlank { str(person, "id", "personId") },
                    fontWeight = FontWeight.SemiBold,
                    color = NxColors.Slate,
                    modifier = Modifier.weight(1f),
                )
                NxStatusChip(validity.label, validity.tone)
            }
            Text(
                listOf(
                    str(person, "code", "personCode").ifBlank { str(person, "id", "personId") },
                    userTypeLabel(strOrNull(person, "userType")),
                    str(person, "orgName"),
                ).filter { it.isNotBlank() && it != IntegraFormat.EMPTY }.joinToString(" · "),
                style = MaterialTheme.typography.bodySmall,
                color = NxColors.Muted,
            )
            Text(
                credencialesLabel(
                    numOfFace = int(person, "numOfFace"),
                    numOfCard = int(person, "numOfCard"),
                    numOfFP = int(person, "numOfFP"),
                    hasLocalFace = bool(person, "hasLocalFace"),
                ),
                style = MaterialTheme.typography.labelSmall,
                color = NxColors.Muted,
            )
            val puertas = stringList(person, "doorNames")
            if (puertas.isNotEmpty()) {
                Text(
                    puertas.joinToString(" · "),
                    style = MaterialTheme.typography.labelSmall,
                    color = NxColors.Muted,
                )
            }
            erp?.let {
                Text(
                    "ERP · ${str(it, "nombre", "email")}",
                    style = MaterialTheme.typography.labelSmall,
                    color = NxColors.Muted,
                )
            }
        }
    }
}

/**
 * Alta mínima en ACS.
 *
 * El alta unificada de la web (usuario ERP + persona ACS + JPEG obligatorio en
 * cuatro pasos) no está aquí: pide crear un usuario del ERP con contraseña
 * temporal, que es otro dominio. Desde el móvil se da de alta la persona y se
 * enrola el rostro desde su ficha.
 */
@Composable
private fun CreatePersonForm(
    state: IntegraPeopleUiState,
    onCancel: () -> Unit,
    onCreate: (String, String, Boolean) -> Unit,
) {
    var nombre by remember { mutableStateOf("") }
    var codigo by remember { mutableStateOf("") }
    var auto by remember { mutableStateOf(true) }

    LazyColumn(
        Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            Text(
                "Nueva persona ACS",
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                color = NxColors.Slate,
            )
        }
        item {
            OutlinedTextField(
                value = nombre,
                onValueChange = { nombre = it },
                label = { Text("Nombre completo") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                enabled = !state.acting,
            )
        }
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(
                    checked = auto,
                    onCheckedChange = { auto = it },
                    enabled = !state.acting,
                )
                Text("Generar código automáticamente", style = MaterialTheme.typography.bodyMedium)
            }
        }
        if (!auto) {
            item {
                OutlinedTextField(
                    value = codigo,
                    onValueChange = { codigo = it },
                    label = { Text("Código de empleado") },
                    placeholder = { Text("Ej. NXR25SYS042") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    enabled = !state.acting,
                )
            }
        }
        item {
            Text(
                "El código es el enlace con el ERP (User.employeeNumber ↔ ACS employeeNo). " +
                    "El rostro se enrola después, desde la ficha de la persona.",
                style = MaterialTheme.typography.labelSmall,
                color = NxColors.Muted,
            )
        }
        item { IntegraOpMessage(state.message, state.messageIsError) }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(
                    onClick = onCancel,
                    enabled = !state.acting,
                    modifier = Modifier.weight(1f),
                ) { Text("Cancelar") }
                Button(
                    onClick = { onCreate(nombre.trim(), codigo.trim(), auto) },
                    enabled = !state.acting,
                    modifier = Modifier.weight(1f),
                ) { Text(if (state.acting) "Creando…" else "Crear") }
            }
        }
    }
}
