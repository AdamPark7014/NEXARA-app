package mx.nexara.mobile.nativeapp.ui.console.clients

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.access.ClientSector
import mx.nexara.mobile.nativeapp.access.ClientSectors
import mx.nexara.mobile.nativeapp.access.OrgEmails
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.ClientDto
import mx.nexara.mobile.nativeapp.data.api.ClientPermissionsDto
import mx.nexara.mobile.nativeapp.data.api.ClientProjectDto
import mx.nexara.mobile.nativeapp.data.api.CreateClientBody
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.clients.ClientsRepository
import mx.nexara.mobile.nativeapp.ui.console.activities.CoreActivityKinds

/**
 * Clientes de Core — espejo de `apps/web/app/(panels)/erp/clientes`.
 *
 * Un padrón con tres sectores; cuáles ve cada quien lo decide el correo
 * (`ClientSectors`), igual que `client-sectors.ts` en la web.
 */

// ── Lista ───────────────────────────────────────────────────────────────────

data class ClientsListUiState(
    val loading: Boolean = true,
    /** Deslizar para actualizar: la lista actual se queda a la vista mientras llega la nueva. */
    val refreshing: Boolean = false,
    val error: String? = null,
    val allowedSectors: List<ClientSector> = emptyList(),
    val sector: ClientSector? = null,
    val query: String = "",
    val items: List<ClientDto> = emptyList(),
    /** Sólo dirección ve de quién es cada cliente. */
    val showOwner: Boolean = false,
    /** «Nuevo cliente» solo con `puedeAgregar`; mientras llega, oculto. */
    val permisos: ClientPermissionsDto = ClientPermissionsDto(),
) {
    /** Búsqueda por nombre, razón social, RFC o encargado (la de la web). */
    val visible: List<ClientDto>
        get() {
            val q = query.trim().lowercase()
            if (q.isEmpty()) return items
            return items.filter { c ->
                c.name.orEmpty().lowercase().contains(q) ||
                    c.legalName.orEmpty().lowercase().contains(q) ||
                    c.taxId.orEmpty().lowercase().contains(q) ||
                    c.owner?.nombre.orEmpty().lowercase().contains(q)
            }
        }
}

class ClientsListViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ClientsRepository(app.applicationContext)
    private val session = AuthRepository(app.applicationContext).loadSession()
    private val _state = MutableStateFlow(ClientsListUiState())
    val state: StateFlow<ClientsListUiState> = _state

    init {
        val allowed = ClientSectors.forEmail(session?.email)
        _state.update {
            it.copy(
                allowedSectors = allowed,
                sector = allowed.firstOrNull(),
                showOwner = session?.isSuperAdmin == true ||
                    OrgEmails.norm(session?.email) == OrgEmails.CEO,
            )
        }
        loadPermisos()
        load()
    }

    fun setQuery(value: String) = _state.update { it.copy(query = value) }

    fun selectSector(sector: ClientSector) {
        if (_state.value.sector == sector) return
        _state.update { it.copy(sector = sector) }
        load()
    }

    /** Permisos del padrón: se piden aparte para que un fallo no tumbe la lista. */
    private fun loadPermisos() {
        viewModelScope.launch {
            val permisos = withContext(Dispatchers.IO) { runCatching { repo.permissions() }.getOrNull() }
            if (permisos != null) _state.update { it.copy(permisos = permisos) }
        }
    }

    fun load(refresh: Boolean = false) {
        if (refresh) loadPermisos()
        val sector = _state.value.sector
        if (sector == null) {
            _state.update { it.copy(loading = false, refreshing = false, items = emptyList()) }
            return
        }
        _state.update {
            if (refresh) it.copy(refreshing = true, error = null) else it.copy(loading = true, error = null)
        }
        viewModelScope.launch {
            try {
                val rows = withContext(Dispatchers.IO) { repo.bySector(sector) }
                _state.update { it.copy(loading = false, refreshing = false, items = rows, error = null) }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        loading = false,
                        refreshing = false,
                        // Si falla un refresco, lo que ya se veía se queda.
                        items = if (refresh) it.items else emptyList(),
                        error = e.toUserMessage("No se pudieron cargar los clientes"),
                    )
                }
            }
        }
    }
}

// ── Detalle ─────────────────────────────────────────────────────────────────

data class ClientDetailUiState(
    val loading: Boolean = true,
    val busy: Boolean = false,
    val error: String? = null,
    val client: ClientDto? = null,
    val projects: List<ClientProjectDto> = emptyList(),
    val mySectors: List<ClientSector> = emptyList(),
    val projectTitle: String = "",
    val projectStart: String = "",
    val permisos: ClientPermissionsDto = ClientPermissionsDto(),
    /** Sube con cada desactivar/reactivar: el padrón se recarga al volver. */
    val cambios: Int = 0,
    /** Ya se eliminó: la pantalla regresa al padrón. */
    val deleted: Boolean = false,
) {
    val inactivo: Boolean get() = ClientRules.isInactive(client?.status)

    /** Hay algo que mostrar en el menu ⋮ de la ficha. */
    val showOwnerActions: Boolean get() = permisos.puedeDesactivar || permisos.puedeEliminar

    val clientSectors: List<ClientSector>
        get() = client?.sectorNames.orEmpty().mapNotNull { ClientSector.fromApi(it) }

    val hasProyecto: Boolean get() = clientSectors.contains(ClientSector.PROYECTO)

    /** Sectores que puedo sumar: los míos que el cliente aún no tiene. */
    val addableSectors: List<ClientSector>
        get() = mySectors.filter { it !in clientSectors }

    val canCreateProject: Boolean get() = mySectors.contains(ClientSector.PROYECTO)
}

class ClientDetailViewModel(
    app: Application,
    private val clientId: Long,
) : AndroidViewModel(app) {
    private val repo = ClientsRepository(app.applicationContext)
    private val session = AuthRepository(app.applicationContext).loadSession()
    private val _state = MutableStateFlow(ClientDetailUiState())
    val state: StateFlow<ClientDetailUiState> = _state

    init {
        _state.update {
            it.copy(
                mySectors = ClientSectors.forEmail(session?.email),
                projectStart = CoreActivityKinds.todayInMexico(),
            )
        }
        load()
    }

    fun setProjectTitle(value: String) = _state.update { it.copy(projectTitle = value) }

    fun setProjectStart(value: String) = _state.update { it.copy(projectStart = value) }

    fun load() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            // Sin permisos no hay menú ⋮; un fallo aquí no debe tumbar la ficha.
            val permisos = withContext(Dispatchers.IO) { runCatching { repo.permissions() }.getOrNull() }
            if (permisos != null) _state.update { it.copy(permisos = permisos) }
        }
        viewModelScope.launch {
            try {
                val client = withContext(Dispatchers.IO) { repo.client(clientId) }
                // Los proyectos cuelgan del puente operativo; sin él no hay nada que pedir.
                val projects = client.serviceClientId?.let { bridgeId ->
                    withContext(Dispatchers.IO) {
                        runCatching { repo.projects(bridgeId) }.getOrDefault(emptyList())
                    }
                } ?: emptyList()
                _state.update {
                    it.copy(loading = false, client = client, projects = projects, error = null)
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(loading = false, error = e.toUserMessage("No se pudo cargar el cliente"))
                }
            }
        }
    }

    fun addSector(sector: ClientSector) {
        _state.update { it.copy(busy = true, error = null) }
        viewModelScope.launch {
            try {
                val updated = withContext(Dispatchers.IO) { repo.addSector(clientId, sector) }
                _state.update { it.copy(busy = false, client = updated) }
            } catch (e: Exception) {
                _state.update {
                    it.copy(busy = false, error = e.toUserMessage("No se pudo agregar el sector"))
                }
            }
        }
    }

    /** Desactivar (`activo = false`) o reactivar. Solo Christian; a otros el servidor les da 403. */
    fun setActive(activo: Boolean) {
        _state.update { it.copy(busy = true, error = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.setActive(clientId, activo) }
                _state.update { it.copy(busy = false, cambios = it.cambios + 1) }
                load()
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        busy = false,
                        error = e.toUserMessage("No se pudo cambiar el estatus del cliente"),
                    )
                }
            }
        }
    }

    /** Proyecto del cliente: desactivar (`ON_HOLD`) o reactivar. Solo Christian. */
    fun setProjectActive(projectId: Long, activo: Boolean) {
        _state.update { it.copy(busy = true, error = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.setProjectActive(projectId, activo) }
                _state.update { it.copy(busy = false) }
                load()
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        busy = false,
                        error = e.toUserMessage("No se pudo cambiar el estatus del proyecto"),
                    )
                }
            }
        }
    }

    /** Borrado lógico del proyecto: se quita de la lista sin esperar la recarga. */
    fun deleteProject(projectId: Long) {
        _state.update { it.copy(busy = true, error = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.deleteProject(projectId) }
                _state.update { s -> s.copy(busy = false, projects = s.projects.filterNot { it.id == projectId }) }
                load()
            } catch (e: Exception) {
                _state.update {
                    it.copy(busy = false, error = e.toUserMessage("No se pudo eliminar el proyecto"))
                }
            }
        }
    }

    fun delete() {
        _state.update { it.copy(busy = true, error = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.delete(clientId) }
                _state.update { it.copy(busy = false, deleted = true) }
            } catch (e: Exception) {
                _state.update {
                    it.copy(busy = false, error = e.toUserMessage("No se pudo eliminar el cliente"))
                }
            }
        }
    }

    fun createProject() {
        val s = _state.value
        val bridgeId = s.client?.serviceClientId ?: return
        val vendorId = session?.id ?: return
        if (s.projectTitle.trim().length < 3) {
            _state.update { it.copy(error = "Título muy corto") }
            return
        }
        _state.update { it.copy(busy = true, error = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    repo.createProject(
                        title = s.projectTitle,
                        serviceClientId = bridgeId,
                        vendorId = vendorId,
                        startDate = s.projectStart,
                    )
                }
                _state.update { it.copy(busy = false, projectTitle = "") }
                load()
            } catch (e: Exception) {
                _state.update {
                    it.copy(busy = false, error = e.toUserMessage("No se pudo crear el proyecto"))
                }
            }
        }
    }

    companion object {
        fun factory(app: Application, clientId: Long) = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T =
                ClientDetailViewModel(app, clientId) as T
        }
    }
}

// ── Alta ────────────────────────────────────────────────────────────────────

data class NewClientUiState(
    val saving: Boolean = false,
    val error: String? = null,
    val lookupBusy: Boolean = false,
    val lookupMessage: String? = null,
    val allowedSectors: List<ClientSector> = emptyList(),
    val sectors: List<ClientSector> = emptyList(),
    val name: String = "",
    val legalName: String = "",
    val taxId: String = "",
    val fiscalRegime: String = "",
    val fiscalAddress: String = "",
    val fiscalZipCode: String = "",
    val billingEmail: String = "",
    val billingPhone: String = "",
    val notes: String = "",
    val createdId: Long? = null,
)

class NewClientViewModel(
    app: Application,
    presetSector: ClientSector?,
) : AndroidViewModel(app) {
    private val repo = ClientsRepository(app.applicationContext)
    private val session = AuthRepository(app.applicationContext).loadSession()
    private val _state = MutableStateFlow(NewClientUiState())
    val state: StateFlow<NewClientUiState> = _state

    init {
        val allowed = ClientSectors.forEmail(session?.email)
        val inicial = presetSector?.takeIf { it in allowed } ?: allowed.firstOrNull()
        _state.update {
            it.copy(
                allowedSectors = allowed,
                sectors = listOfNotNull(inicial),
            )
        }
    }

    fun setField(field: String, value: String) {
        _state.update {
            when (field) {
                "name" -> it.copy(name = value)
                "legalName" -> it.copy(legalName = value)
                "taxId" -> it.copy(taxId = value.uppercase())
                "fiscalRegime" -> it.copy(fiscalRegime = value)
                "fiscalAddress" -> it.copy(fiscalAddress = value)
                "fiscalZipCode" -> it.copy(fiscalZipCode = value)
                "billingEmail" -> it.copy(billingEmail = value)
                "billingPhone" -> it.copy(billingPhone = value)
                "notes" -> it.copy(notes = value)
                else -> it
            }
        }
    }

    fun toggleSector(sector: ClientSector) {
        _state.update {
            val next = if (sector in it.sectors) it.sectors - sector else it.sectors + sector
            it.copy(sectors = next)
        }
    }

    /** `GET ventas/clientes/fiscal-lookup`: rellena razón social, CP y régimen. */
    fun lookupRfc() {
        val rfc = _state.value.taxId.trim()
        if (rfc.isBlank()) {
            _state.update { it.copy(lookupMessage = "Escribe el RFC primero") }
            return
        }
        _state.update { it.copy(lookupBusy = true, lookupMessage = null) }
        viewModelScope.launch {
            try {
                val res = withContext(Dispatchers.IO) { repo.fiscalLookup(rfc) }
                _state.update {
                    it.copy(
                        lookupBusy = false,
                        legalName = res.legalName?.takeIf { v -> v.isNotBlank() } ?: it.legalName,
                        fiscalZipCode = res.fiscalZipCode?.takeIf { v -> v.isNotBlank() }
                            ?: it.fiscalZipCode,
                        fiscalRegime = res.suggestedRegime?.takeIf { v -> v.isNotBlank() }
                            ?: it.fiscalRegime,
                        lookupMessage = res.message
                            ?: if (res.validation?.valid == true) "RFC válido" else "RFC no reconocido",
                    )
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        lookupBusy = false,
                        lookupMessage = e.toUserMessage("No se pudo consultar el RFC"),
                    )
                }
            }
        }
    }

    fun create() {
        val s = _state.value
        if (s.sectors.isEmpty()) {
            _state.update { it.copy(error = "Elige al menos un sector") }
            return
        }
        if (s.name.isBlank() || s.legalName.isBlank()) {
            _state.update { it.copy(error = "Nombre comercial y razón social son obligatorios") }
            return
        }
        _state.update { it.copy(saving = true, error = null) }
        viewModelScope.launch {
            try {
                val created = withContext(Dispatchers.IO) {
                    repo.create(
                        CreateClientBody(
                            name = s.name.trim(),
                            legalName = s.legalName.trim().ifBlank { null },
                            taxId = s.taxId.trim().uppercase().ifBlank { null },
                            fiscalAddress = s.fiscalAddress.trim().ifBlank { null },
                            fiscalZipCode = s.fiscalZipCode.trim().ifBlank { null },
                            fiscalRegime = s.fiscalRegime.trim().ifBlank { null },
                            billingEmail = s.billingEmail.trim().ifBlank { null },
                            billingPhone = s.billingPhone.trim().ifBlank { null },
                            notes = s.notes.trim().ifBlank { null },
                            status = "Activo",
                            sectors = s.sectors.map { it.name },
                        ),
                    )
                }
                _state.update { it.copy(saving = false, createdId = created.id) }
            } catch (e: Exception) {
                _state.update {
                    it.copy(saving = false, error = e.toUserMessage("No se pudo crear el cliente"))
                }
            }
        }
    }

    companion object {
        fun factory(app: Application, presetSector: ClientSector?) = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T =
                NewClientViewModel(app, presetSector) as T
        }
    }
}
