package mx.nexara.mobile.nativeapp.ui.integra.schedules

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.integra.schedules.AccessPreset
import mx.nexara.mobile.nativeapp.data.integra.schedules.AcsTime
import mx.nexara.mobile.nativeapp.data.integra.schedules.DoorAccess
import mx.nexara.mobile.nativeapp.data.integra.schedules.IntegraCaps
import mx.nexara.mobile.nativeapp.data.integra.schedules.PersonBrief
import mx.nexara.mobile.nativeapp.data.integra.schedules.PersonSchedule
import mx.nexara.mobile.nativeapp.data.integra.schedules.ScheduleFormInput
import mx.nexara.mobile.nativeapp.data.integra.schedules.SchedulePresets
import mx.nexara.mobile.nativeapp.data.integra.schedules.ScheduleTemplate
import mx.nexara.mobile.nativeapp.data.integra.schedules.SchedulesCatalog
import mx.nexara.mobile.nativeapp.data.integra.schedules.SchedulesRepository
import mx.nexara.mobile.nativeapp.data.integra.schedules.SpaceDetail
import mx.nexara.mobile.nativeapp.data.integra.schedules.SpacesOverview
import mx.nexara.mobile.nativeapp.data.integra.schedules.TerminalOpResult

/**
 * ViewModels de HORARIOS y ESPACIOS.
 *
 * Todo el trabajo de red y de parseo va en `withContext(Dispatchers.IO)` dentro
 * de `viewModelScope`; no hay `GlobalScope` ni llamadas bloqueantes en el hilo
 * principal. El estado sale como `StateFlow` inmutable, igual que en
 * `IntegraScreens.kt`.
 */

// ── Horarios ─────────────────────────────────────────────────────────────────

enum class SchedulesTab(val label: String) {
    PERSON("Por persona"),
    DOOR("Por puerta"),
}

data class SchedulesUiState(
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val error: String? = null,
    val catalog: SchedulesCatalog? = null,
    val people: List<PersonBrief> = emptyList(),
    val caps: IntegraCaps = IntegraCaps(),
    val tab: SchedulesTab = SchedulesTab.PERSON,

    // Vista «Por persona»
    val personQuery: String = "",
    val selectedPersonId: String? = null,
    val personLoading: Boolean = false,
    val draft: PersonSchedule? = null,
    val baseline: PersonSchedule? = null,
    val activePresetId: String? = null,
    val previewDoorId: String? = null,
    val validFromDate: String = "",
    val validFromTime: String = "",
    val validToDate: String = "",
    val validToTime: String = "",
    val formError: String? = null,
    val saving: Boolean = false,
    val saveOk: Boolean? = null,
    val saveNote: String? = null,
    val saveResults: List<TerminalOpResult> = emptyList(),

    // Vista «Por puerta»
    val selectedDoorId: String? = null,
    val doorLoading: Boolean = false,
    val doorAccess: DoorAccess? = null,
) {
    val dirty: Boolean get() = draft != null && draft != baseline
    val filteredPeople: List<PersonBrief>
        get() {
            val q = personQuery.trim()
            if (q.isEmpty()) return people
            return people.filter {
                it.name.contains(q, ignoreCase = true) ||
                    it.id.contains(q, ignoreCase = true) ||
                    it.code?.contains(q, ignoreCase = true) == true
            }
        }
}

class IntegraSchedulesViewModel(app: Application) : AndroidViewModel(app) {

    private val repo = SchedulesRepository(app.applicationContext)
    private val _state = MutableStateFlow(SchedulesUiState())
    val state: StateFlow<SchedulesUiState> = _state.asStateFlow()

    init {
        load(initial = true)
    }

    fun setTab(tab: SchedulesTab) {
        _state.update { it.copy(tab = tab, formError = null) }
        val s = _state.value
        if (tab == SchedulesTab.DOOR && s.doorAccess == null && s.selectedDoorId != null) {
            loadDoor(s.selectedDoorId)
        }
    }

    fun setPersonQuery(v: String) = _state.update { it.copy(personQuery = v) }

    fun load(initial: Boolean = false) {
        _state.update {
            it.copy(
                loading = initial && it.catalog == null,
                refreshing = !initial,
                error = null,
            )
        }
        viewModelScope.launch {
            try {
                val (catalog, people, caps) = withContext(Dispatchers.IO) {
                    Triple(repo.catalog(), repo.peopleBrief(), repo.capabilities())
                }
                val doorId = _state.value.selectedDoorId
                    ?: catalog.meetingRoomDoorId
                    ?: catalog.doors.firstOrNull()?.id
                _state.update {
                    it.copy(
                        loading = false,
                        refreshing = false,
                        catalog = catalog,
                        people = people,
                        caps = caps,
                        selectedDoorId = doorId,
                    )
                }
                _state.value.selectedPersonId?.let { selectPerson(it) }
                if (_state.value.tab == SchedulesTab.DOOR && doorId != null) loadDoor(doorId)
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        loading = false,
                        refreshing = false,
                        error = e.toUserMessage("No se pudieron cargar los horarios"),
                    )
                }
            }
        }
    }

    // ── Por persona ──────────────────────────────────────────────────────────

    fun selectPerson(personId: String) {
        val catalog = _state.value.catalog ?: return
        _state.update {
            it.copy(
                selectedPersonId = personId,
                personLoading = true,
                formError = null,
                saveOk = null,
                saveNote = null,
                saveResults = emptyList(),
                activePresetId = null,
            )
        }
        viewModelScope.launch {
            try {
                val schedule = withContext(Dispatchers.IO) {
                    repo.personSchedule(personId, catalog)
                }
                _state.update { it.withDraft(schedule, baseline = schedule) }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        personLoading = false,
                        draft = null,
                        baseline = null,
                        error = e.toUserMessage("No se pudo leer el horario de la persona"),
                    )
                }
            }
        }
    }

    fun clearPerson() = _state.update {
        it.copy(
            selectedPersonId = null,
            draft = null,
            baseline = null,
            activePresetId = null,
            previewDoorId = null,
            saveOk = null,
            saveNote = null,
            saveResults = emptyList(),
            formError = null,
        )
    }

    fun discardChanges() {
        val baseline = _state.value.baseline ?: return
        _state.update {
            it.withDraft(baseline, baseline = baseline)
                .copy(activePresetId = null, saveOk = null, saveNote = null, saveResults = emptyList())
        }
    }

    fun applyPreset(presetId: String) {
        val s = _state.value
        val catalog = s.catalog ?: return
        val draft = s.draft ?: return
        val next = SchedulePresets.apply(presetId, catalog, draft)
        _state.update {
            it.withDraft(next, baseline = it.baseline).copy(
                activePresetId = presetId,
                previewDoorId = next.doorPlans.firstOrNull { p -> p.hasAccess }?.doorId,
                formError = null,
            )
        }
    }

    fun setValidEnabled(enabled: Boolean) {
        val draft = _state.value.draft ?: return
        val next = draft.copy(
            validEnable = enabled,
            validMode = when {
                !enabled -> "disabled"
                draft.indefinite -> "indefinite"
                else -> "window"
            },
        )
        _state.update { it.copy(draft = next, activePresetId = null, formError = null) }
    }

    /**
     * «Sin fecha fin» ⇄ ventana. Al desmarcar, un `validTo` que todavía apunta a
     * 2037 no sirve como fecha editable: se propone el final del día de hoy
     * **en hora de México**.
     */
    fun setIndefinite(indefinite: Boolean) {
        val draft = _state.value.draft ?: return
        val nextTo = if (indefinite) {
            AcsTime.ISAPI_INDEFINITE_END
        } else if (AcsTime.isIndefiniteEnd(draft.validTo)) {
            "${SchedulePresets.todayInMexico()}T23:59:59"
        } else {
            draft.validTo
        }
        val next = draft.copy(
            indefinite = indefinite,
            validMode = if (!draft.validEnable) "disabled" else if (indefinite) "indefinite" else "window",
            validTo = nextTo,
        )
        _state.update {
            it.withDraft(next, baseline = it.baseline)
                .copy(activePresetId = null, formError = null)
        }
    }

    fun setValidFromDate(v: String) = updateValidityField { it.copy(validFromDate = v) }
    fun setValidFromTime(v: String) = updateValidityField { it.copy(validFromTime = v) }
    fun setValidToDate(v: String) = updateValidityField { it.copy(validToDate = v) }
    fun setValidToTime(v: String) = updateValidityField { it.copy(validToTime = v) }

    /**
     * Los campos de fecha/hora son reloj de pared ISAPI: se copian al borrador
     * sin convertir de zona. Si el texto todavía no es una fecha completa se
     * deja el borrador como estaba y se avisa al validar, no mientras se teclea.
     */
    private fun updateValidityField(edit: (SchedulesUiState) -> SchedulesUiState) {
        _state.update { current ->
            val s = edit(current).copy(activePresetId = null, formError = null)
            val draft = s.draft ?: return@update s
            val from = ScheduleFormInput.parse(s.validFromDate, s.validFromTime, seconds = 0)
            val to = ScheduleFormInput.parse(s.validToDate, s.validToTime, seconds = 59)
            s.copy(
                draft = draft.copy(
                    validFrom = from?.let { ScheduleFormInput.toAcsWallClock(it) } ?: draft.validFrom,
                    validTo = to?.let { ScheduleFormInput.toAcsWallClock(it) } ?: draft.validTo,
                ),
            )
        }
    }

    fun setDoorPlan(doorId: String, planTemplateNo: String) {
        val s = _state.value
        val catalog = s.catalog ?: return
        val draft = s.draft ?: return
        val next = draft.copy(
            doorPlans = draft.doorPlans.map { plan ->
                if (plan.doorId != doorId) {
                    plan
                } else {
                    plan.copy(
                        planTemplateNo = planTemplateNo,
                        planName = catalog.templateLabel(planTemplateNo),
                    )
                }
            },
        )
        _state.update {
            it.copy(
                draft = next,
                activePresetId = null,
                previewDoorId = doorId,
                formError = null,
            )
        }
    }

    fun previewDoor(doorId: String) = _state.update { it.copy(previewDoorId = doorId) }

    fun save() {
        val s = _state.value
        val draft = s.draft ?: return
        if (!s.caps.canSettings) {
            _state.update { it.copy(formError = "Tu usuario no tiene permiso para cambiar horarios ACS.") }
            return
        }
        if (draft.validEnable && !draft.indefinite) {
            val from = ScheduleFormInput.parse(s.validFromDate, s.validFromTime)
            val to = ScheduleFormInput.parse(s.validToDate, s.validToTime, seconds = 59)
            if (from == null || to == null) {
                _state.update {
                    it.copy(formError = "Revisa Desde/Hasta. Usa AAAA-MM-DD y HH:MM.")
                }
                return
            }
            if (draft.validTo <= draft.validFrom) {
                _state.update { it.copy(formError = "«Hasta» debe ser posterior a «Desde».") }
                return
            }
        }
        val apiPreset = SchedulePresets.byId(s.activePresetId)
            ?.takeIf { it.id != AccessPreset.MEETING_ONLY }
            ?.apiPreset
        _state.update {
            it.copy(saving = true, formError = null, saveOk = null, saveNote = null, saveResults = emptyList())
        }
        viewModelScope.launch {
            try {
                val result = withContext(Dispatchers.IO) {
                    repo.savePersonSchedule(
                        draft = draft,
                        apiPreset = apiPreset,
                        contractorDays = if (apiPreset == "contractor") SchedulePresets.CONTRACTOR_DAYS else null,
                    )
                }
                _state.update {
                    it.copy(
                        saving = false,
                        saveOk = result.success,
                        saveNote = result.note ?: if (result.success) {
                            "Horario empujado a los terminales."
                        } else {
                            "Guardado incompleto: revisa el detalle por terminal."
                        },
                        saveResults = result.results,
                    )
                }
                // Releer para que la pantalla muestre lo que quedó en el ACS y no
                // lo que el usuario pidió: si un terminal rechazó, se ve.
                _state.value.selectedPersonId?.let { selectPerson(it) }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        saving = false,
                        saveOk = false,
                        saveNote = e.toUserMessage("No se pudo guardar el horario"),
                    )
                }
            }
        }
    }

    // ── Por puerta ───────────────────────────────────────────────────────────

    fun selectDoor(doorId: String) {
        _state.update { it.copy(selectedDoorId = doorId) }
        loadDoor(doorId)
    }

    private fun loadDoor(doorId: String) {
        val catalog = _state.value.catalog ?: return
        _state.update { it.copy(doorLoading = true) }
        viewModelScope.launch {
            try {
                val access = withContext(Dispatchers.IO) { repo.doorAccess(doorId, catalog) }
                _state.update { it.copy(doorLoading = false, doorAccess = access) }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        doorLoading = false,
                        doorAccess = null,
                        error = e.toUserMessage("No se pudo leer quién abre esta puerta"),
                    )
                }
            }
        }
    }

    fun editPersonFromDoor(personId: String) {
        _state.update { it.copy(tab = SchedulesTab.PERSON) }
        selectPerson(personId)
    }

    fun dismissError() = _state.update { it.copy(error = null, formError = null) }
}

/** Rellena borrador, línea base y los campos de texto de vigencia a la vez. */
private fun SchedulesUiState.withDraft(
    draft: PersonSchedule,
    baseline: PersonSchedule?,
): SchedulesUiState = copy(
    personLoading = false,
    draft = draft,
    baseline = baseline,
    previewDoorId = previewDoorId
        ?: draft.doorPlans.firstOrNull { it.hasAccess }?.doorId
        ?: draft.doorPlans.firstOrNull()?.doorId,
    validFromDate = ScheduleFormInput.dateFieldOf(draft.validFrom),
    validFromTime = ScheduleFormInput.timeFieldOf(draft.validFrom, "00:00"),
    validToDate = ScheduleFormInput.dateFieldOf(draft.validTo),
    validToTime = ScheduleFormInput.timeFieldOf(draft.validTo, "23:59"),
)

// ── Espacios ─────────────────────────────────────────────────────────────────

enum class SpaceFilter(val label: String) {
    ALL("Todos"),
    INDEFINITE("Con indefinidos"),
    TIMED("Con temporales"),
    BOOKED("Con reserva activa"),
    OFFLINE("Fuera de línea"),
}

data class EspaciosUiState(
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val error: String? = null,
    val message: String? = null,
    val overview: SpacesOverview? = null,
    val people: List<PersonBrief> = emptyList(),
    val caps: IntegraCaps = IntegraCaps(),
    val query: String = "",
    val filter: SpaceFilter = SpaceFilter.ALL,

    val selectedId: String? = null,
    val detailLoading: Boolean = false,
    val detail: SpaceDetail? = null,

    val policyKey: String? = null,
    val savingPolicy: Boolean = false,

    val bookingTitle: String = "",
    val bookingHostId: String? = null,
    val bookingStartDate: String = "",
    val bookingStartTime: String = "",
    val bookingEndDate: String = "",
    val bookingEndTime: String = "",
    val bookingNotes: String = "",
    val bookingError: String? = null,
    val savingBooking: Boolean = false,
) {
    val spaces
        get(): List<mx.nexara.mobile.nativeapp.data.integra.schedules.SpaceCard> {
            val all = overview?.spaces.orEmpty()
            val q = query.trim()
            return all.filter { space ->
                val matches = q.isEmpty() ||
                    space.name.contains(q, ignoreCase = true) ||
                    space.id.contains(q, ignoreCase = true) ||
                    space.regionName?.contains(q, ignoreCase = true) == true
                if (!matches) return@filter false
                when (filter) {
                    SpaceFilter.ALL -> true
                    SpaceFilter.INDEFINITE -> space.accessCounts.indefinite > 0
                    SpaceFilter.TIMED -> space.accessCounts.timed > 0
                    SpaceFilter.BOOKED -> space.windowsOpen > 0
                    SpaceFilter.OFFLINE -> !space.online
                }
            }
        }
}

class IntegraEspaciosViewModel(app: Application) : AndroidViewModel(app) {

    private val repo = SchedulesRepository(app.applicationContext)
    private val _state = MutableStateFlow(EspaciosUiState())
    val state: StateFlow<EspaciosUiState> = _state.asStateFlow()

    init {
        load(initial = true)
    }

    fun setQuery(v: String) = _state.update { it.copy(query = v) }
    fun setFilter(f: SpaceFilter) = _state.update { it.copy(filter = f) }
    fun dismissMessages() = _state.update { it.copy(error = null, message = null, bookingError = null) }

    fun load(initial: Boolean = false) {
        _state.update {
            it.copy(
                loading = initial && it.overview == null,
                refreshing = !initial,
                error = null,
            )
        }
        viewModelScope.launch {
            try {
                val (overview, people, caps) = withContext(Dispatchers.IO) {
                    Triple(repo.spacesOverview(), repo.peopleBrief(), repo.capabilities())
                }
                _state.update {
                    it.copy(
                        loading = false,
                        refreshing = false,
                        overview = overview,
                        people = people,
                        caps = caps,
                    )
                }
                _state.value.selectedId?.let { loadDetail(it) }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        loading = false,
                        refreshing = false,
                        error = e.toUserMessage("No se pudieron cargar los espacios"),
                    )
                }
            }
        }
    }

    fun selectSpace(doorId: String) {
        val (date, time) = ScheduleFormInput.nowFieldsMexico()
        val (endDate, endTime) = ScheduleFormInput.nowFieldsMexico(plusMinutes = 60)
        _state.update {
            it.copy(
                selectedId = doorId,
                detail = null,
                detailLoading = true,
                message = null,
                bookingError = null,
                bookingTitle = "",
                bookingNotes = "",
                bookingHostId = null,
                bookingStartDate = date,
                bookingStartTime = time,
                bookingEndDate = endDate,
                bookingEndTime = endTime,
            )
        }
        loadDetail(doorId)
    }

    fun clearSpace() = _state.update {
        it.copy(selectedId = null, detail = null, message = null, bookingError = null)
    }

    private fun loadDetail(doorId: String) {
        _state.update { it.copy(detailLoading = true) }
        viewModelScope.launch {
            try {
                val detail = withContext(Dispatchers.IO) { repo.spaceDetail(doorId) }
                _state.update {
                    it.copy(
                        detailLoading = false,
                        detail = detail,
                        policyKey = it.policyKey.takeIf { _ -> it.savingPolicy }
                            ?: detail.card.policy.templateKey,
                    )
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        detailLoading = false,
                        error = e.toUserMessage("No se pudo cargar el espacio"),
                    )
                }
            }
        }
    }

    fun setPolicyKey(key: String) = _state.update { it.copy(policyKey = key, message = null) }

    fun savePolicy() {
        val s = _state.value
        val doorId = s.selectedId ?: return
        val key = s.policyKey ?: return
        if (!s.caps.canControlDoors) {
            _state.update { it.copy(error = "Tu usuario no puede cambiar la política de espacios.") }
            return
        }
        _state.update { it.copy(savingPolicy = true, error = null, message = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.saveSpacePolicy(doorId, key) }
                _state.update { it.copy(savingPolicy = false, message = "Plantilla del espacio guardada.") }
                refreshAfterWrite(doorId)
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        savingPolicy = false,
                        error = e.toUserMessage("No se pudo guardar la plantilla"),
                    )
                }
            }
        }
    }

    fun setBookingTitle(v: String) = _state.update { it.copy(bookingTitle = v, bookingError = null) }
    fun setBookingHost(v: String?) = _state.update { it.copy(bookingHostId = v) }
    fun setBookingStartDate(v: String) = _state.update { it.copy(bookingStartDate = v, bookingError = null) }
    fun setBookingStartTime(v: String) = _state.update { it.copy(bookingStartTime = v, bookingError = null) }
    fun setBookingEndDate(v: String) = _state.update { it.copy(bookingEndDate = v, bookingError = null) }
    fun setBookingEndTime(v: String) = _state.update { it.copy(bookingEndTime = v, bookingError = null) }
    fun setBookingNotes(v: String) = _state.update { it.copy(bookingNotes = v) }

    /**
     * Crea la ventana de uso. Los campos son hora de México y se convierten a
     * un instante UTC antes de salir; el servidor guarda instantes.
     */
    fun createBooking() {
        val s = _state.value
        val doorId = s.selectedId ?: return
        if (!s.caps.canControlDoors) {
            _state.update { it.copy(bookingError = "Tu usuario no puede planificar el uso de espacios.") }
            return
        }
        val invalid = ScheduleFormInput.validateBooking(
            title = s.bookingTitle,
            startDate = s.bookingStartDate,
            startTime = s.bookingStartTime,
            endDate = s.bookingEndDate,
            endTime = s.bookingEndTime,
        )
        if (invalid != null) {
            _state.update { it.copy(bookingError = invalid) }
            return
        }
        val startUtc = ScheduleFormInput.bookingInstantUtc(s.bookingStartDate, s.bookingStartTime)
        val endUtc = ScheduleFormInput.bookingInstantUtc(s.bookingEndDate, s.bookingEndTime)
        if (startUtc == null || endUtc == null) {
            _state.update { it.copy(bookingError = "Fechas no válidas.") }
            return
        }
        _state.update { it.copy(savingBooking = true, bookingError = null, message = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    repo.createBooking(
                        doorId = doorId,
                        title = s.bookingTitle.trim(),
                        startsAtUtc = startUtc,
                        endsAtUtc = endUtc,
                        hostPersonId = s.bookingHostId,
                        notes = s.bookingNotes,
                    )
                }
                _state.update {
                    it.copy(
                        savingBooking = false,
                        bookingTitle = "",
                        bookingNotes = "",
                        bookingHostId = null,
                        message = "Ventana de uso programada.",
                    )
                }
                refreshAfterWrite(doorId)
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        savingBooking = false,
                        bookingError = e.toUserMessage("No se pudo crear la ventana de uso"),
                    )
                }
            }
        }
    }

    fun cancelBooking(bookingId: Long) {
        val s = _state.value
        val doorId = s.selectedId ?: return
        if (!s.caps.canControlDoors) {
            _state.update { it.copy(error = "Tu usuario no puede cancelar ventanas de uso.") }
            return
        }
        _state.update { it.copy(savingBooking = true, error = null, message = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.cancelBooking(bookingId) }
                _state.update { it.copy(savingBooking = false, message = "Ventana cancelada.") }
                refreshAfterWrite(doorId)
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        savingBooking = false,
                        error = e.toUserMessage("No se pudo cancelar la ventana"),
                    )
                }
            }
        }
    }

    /** Tras escribir, refresca detalle y resumen para que los KPI cuadren. */
    private fun refreshAfterWrite(doorId: String) {
        viewModelScope.launch {
            try {
                val (detail, overview) = withContext(Dispatchers.IO) {
                    repo.spaceDetail(doorId) to repo.spacesOverview()
                }
                _state.update {
                    it.copy(
                        detail = detail,
                        overview = overview,
                        policyKey = detail.card.policy.templateKey,
                    )
                }
            } catch (e: Exception) {
                _state.update { it.copy(error = e.toUserMessage("No se pudo refrescar el espacio")) }
            }
        }
    }
}

/** Plantillas que la UI ofrece aunque el sitio aún no publique catálogo. */
internal val FALLBACK_SPACE_TEMPLATE_KEYS = listOf(
    "INDEFINITE" to "Acceso indefinido",
    "TIMED_DAY" to "Solo hoy",
    "TIMED_WEEK" to "7 días",
    "TIMED_30D" to "30 días",
    "BOOKING_ONLY" to "Solo con reserva",
    "CUSTOM" to "Personalizado",
)

/** Etiqueta del estado de vigencia de una persona dentro de un espacio. */
internal fun spaceKindLabel(kind: String): String = when (kind) {
    "indefinite" -> "Indefinido"
    "timed" -> "Temporal"
    "expired" -> "Vencida"
    "off" -> "Deshabilitada"
    else -> "Sin vigencia"
}

/** Plantilla «0» no es un horario vacío: es que esa persona no abre la puerta. */
internal fun planLabelOrNoAccess(catalog: SchedulesCatalog?, planTemplateNo: String?): String {
    if (planTemplateNo == null || planTemplateNo == ScheduleTemplate.NO_ACCESS_ID) {
        return "Sin acceso a esta puerta"
    }
    return catalog?.templateLabel(planTemplateNo) ?: "Plantilla $planTemplateNo"
}
