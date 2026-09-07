package mx.nexara.mobile.nativeapp.ui.integra

import android.app.Application
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
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
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone
import mx.nexara.mobile.nativeapp.ui.integra.common.GENDERS
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraConfirmDialog
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraDetailLine
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraFormat
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraNotice
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraOpMessage
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraPicker
import mx.nexara.mobile.nativeapp.ui.integra.common.USER_TYPES
import mx.nexara.mobile.nativeapp.ui.integra.common.Validity
import mx.nexara.mobile.nativeapp.ui.integra.common.bool
import mx.nexara.mobile.nativeapp.ui.integra.common.credencialesLabel
import mx.nexara.mobile.nativeapp.ui.integra.common.describeValidity
import mx.nexara.mobile.nativeapp.ui.integra.common.genderLabel
import mx.nexara.mobile.nativeapp.ui.integra.common.int
import mx.nexara.mobile.nativeapp.ui.integra.common.nestedPerson
import mx.nexara.mobile.nativeapp.ui.integra.common.str
import mx.nexara.mobile.nativeapp.ui.integra.common.strOrNull
import mx.nexara.mobile.nativeapp.ui.integra.common.stringList
import mx.nexara.mobile.nativeapp.ui.integra.common.subMap
import mx.nexara.mobile.nativeapp.ui.integra.common.userTypeLabel
import mx.nexara.mobile.nativeapp.ui.integra.common.vigenciaLabel
import mx.nexara.mobile.nativeapp.ui.integra.common.vigenciaTone
import java.time.Instant
import java.time.ZoneId

/** Acciones irreversibles de la ficha. Cada una pide confirmación por su nombre. */
enum class PersonOp { QuitarRostro, Eliminar }

data class IntegraPersonDetailUiState(
    val loading: Boolean = true,
    val error: String? = null,
    val data: Map<String, Any?> = emptyMap(),
    val acting: Boolean = false,
    val message: String? = null,
    val messageIsError: Boolean = false,
    val pending: PersonOp? = null,
    val forceDelete: Boolean = false,
    val zone: ZoneId = IntegraFormat.MexicoCity,
)

class IntegraPersonDetailViewModel(
    app: Application,
    private val personId: String,
) : AndroidViewModel(app) {
    private val repo = IntegraRepository(app.applicationContext)
    private val _state = MutableStateFlow(IntegraPersonDetailUiState(zone = ZoneId.systemDefault()))
    val state: StateFlow<IntegraPersonDetailUiState> = _state

    init { refresh() }

    fun clearMessage() = _state.update { it.copy(message = null) }
    fun setForceDelete(v: Boolean) = _state.update { it.copy(forceDelete = v) }
    fun pedirConfirmacion(op: PersonOp) = _state.update { it.copy(pending = op, message = null) }

    /** No se cancela una operación que ya salió hacia los terminales. */
    fun cancelarConfirmacion() = _state.update { if (it.acting) it else it.copy(pending = null) }

    fun person(): Map<String, Any?> = nestedPerson(_state.value.data)

    fun validity(): Validity {
        val p = person()
        val zone = _state.value.zone
        val validTo = strOrNull(p, "validTo")
        return describeValidity(
            validEnable = bool(p, "validEnable"),
            validTo = validTo,
            nowEpochDay = Instant.now().atZone(zone).toLocalDate().toEpochDay(),
            validToEpochDay = IntegraFormat.epochDay(validTo, zone),
        )
    }

    fun refresh() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            try {
                val data = withContext(Dispatchers.IO) { repo.personDetail(personId) }
                _state.update { it.copy(loading = false, data = data) }
            } catch (e: Exception) {
                _state.update {
                    it.copy(loading = false, error = e.toUserMessage("No se pudo cargar la persona"))
                }
            }
        }
    }

    fun update(
        name: String?,
        gender: String?,
        userType: String?,
        validFrom: String?,
        validTo: String?,
        validEnable: Boolean?,
    ) {
        if (_state.value.acting) return
        _state.update { it.copy(acting = true, message = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    repo.updatePerson(
                        personId = personId,
                        personName = name,
                        gender = gender,
                        userType = userType,
                        validFrom = validFrom,
                        validTo = validTo,
                        validEnable = validEnable,
                    )
                }
                _state.update {
                    it.copy(acting = false, message = "Ficha guardada en los terminales", messageIsError = false)
                }
                refresh()
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        acting = false,
                        message = e.toUserMessage("No se pudo guardar la ficha"),
                        messageIsError = true,
                    )
                }
            }
        }
    }

    fun uploadFace(imageBase64: String) {
        if (_state.value.acting) return
        _state.update { it.copy(acting = true, message = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.uploadPersonFace(personId, imageBase64) }
                _state.update {
                    it.copy(acting = false, message = "Rostro enrolado", messageIsError = false)
                }
                refresh()
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        acting = false,
                        message = e.toUserMessage("No se pudo enrolar el rostro"),
                        messageIsError = true,
                    )
                }
            }
        }
    }

    fun confirmar(onDeleted: (() -> Unit)?) {
        val s = _state.value
        if (s.acting) return
        val op = s.pending ?: return
        _state.update { it.copy(acting = true) }
        viewModelScope.launch {
            try {
                when (op) {
                    PersonOp.QuitarRostro -> {
                        withContext(Dispatchers.IO) { repo.deletePersonFace(personId) }
                        _state.update {
                            it.copy(
                                acting = false,
                                pending = null,
                                message = "Rostro eliminado de los terminales",
                                messageIsError = false,
                            )
                        }
                        refresh()
                    }
                    PersonOp.Eliminar -> {
                        withContext(Dispatchers.IO) {
                            repo.deletePerson(personId, force = s.forceDelete)
                        }
                        _state.update { it.copy(acting = false, pending = null) }
                        onDeleted?.invoke()
                    }
                }
            } catch (e: Exception) {
                // Un borrado parcial es lo normal cuando un terminal no contesta:
                // se ofrece el forzado en vez de dejar a la persona a medias.
                _state.update {
                    it.copy(
                        acting = false,
                        pending = null,
                        forceDelete = it.forceDelete || op == PersonOp.Eliminar,
                        message = e.toUserMessage(
                            when (op) {
                                PersonOp.QuitarRostro -> "No se pudo quitar el rostro"
                                PersonOp.Eliminar -> "No se pudo eliminar en todos los terminales"
                            },
                        ),
                        messageIsError = true,
                    )
                }
            }
        }
    }

    companion object {
        fun factory(app: Application, personId: String) = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T =
                IntegraPersonDetailViewModel(app, personId) as T
        }
    }
}

/**
 * Ficha de una persona ACS.
 *
 * Tres cosas que la versión anterior no decía y aquí sí:
 *
 *  - **Qué credenciales tiene.** Una persona vigente sin rostro, tarjeta ni
 *    huella no entra por ninguna puerta, y eso no se veía en ningún sitio.
 *  - **Cuándo caduca de verdad.** `2037-12-31` es lo que el terminal escribe
 *    cuando no hay fecha: se dice «Indefinida», no «vence en 4 000 días».
 *  - **Qué se puede deshacer.** Quitar el rostro y dar de baja son
 *    irreversibles y piden confirmación por su nombre; guardar la ficha no.
 */
@Composable
fun IntegraPersonDetailScreen(personId: String, onDeleted: (() -> Unit)? = null) {
    val app = LocalContext.current.applicationContext as Application
    val context = LocalContext.current
    val vm: IntegraPersonDetailViewModel = viewModel(
        key = "integra-person-$personId",
        factory = IntegraPersonDetailViewModel.factory(app, personId),
    )
    val s by vm.state.collectAsState()
    val person = vm.person()
    val validity = vm.validity()

    var editName by remember(person) { mutableStateOf(str(person, "name", "personName")) }
    var editGender by remember(person) { mutableStateOf(str(person, "gender")) }
    var editUserType by remember(person) { mutableStateOf(str(person, "userType")) }
    var editValidFrom by remember(person) {
        mutableStateOf(str(person, "validFrom").take(19))
    }
    var editValidTo by remember(person) { mutableStateOf(str(person, "validTo").take(19)) }
    var editValidEnable by remember(person) {
        mutableStateOf(bool(person, "validEnable") != false)
    }

    val pickFace = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent(),
    ) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        val bytes = runCatching {
            context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
        }.getOrNull()
        if (bytes == null || bytes.isEmpty()) return@rememberLauncherForActivityResult
        val b64 = android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP)
        vm.uploadFace(b64)
    }

    s.pending?.let { op ->
        val nombre = str(person, "name", "personName").ifBlank { personId }
        IntegraConfirmDialog(
            title = when (op) {
                PersonOp.QuitarRostro -> "Quitar el rostro"
                PersonOp.Eliminar -> "Eliminar a $nombre"
            },
            message = when (op) {
                PersonOp.QuitarRostro ->
                    "Se borra el modelo facial de $nombre en todos los terminales y el JPEG " +
                        "guardado en NEXARA. Dejará de poder abrir mirando al lector y sus " +
                        "eventos saldrán sin foto. Para recuperarlo hay que volver a capturarla."
                PersonOp.Eliminar -> if (s.forceDelete) {
                    "FORZADO: $nombre sale del espejo de NEXARA aunque algún terminal no " +
                        "conteste, y el borrado se reintenta después en los equipos caídos. " +
                        "No se puede deshacer."
                } else {
                    "Se borra a $nombre de todos los terminales. Dejará de abrir cualquier " +
                        "puerta. Si algún equipo falla, se conserva en NEXARA para que no quede " +
                        "a medias: entonces marca «Forzar baja» e insiste. No se puede deshacer."
                }
            },
            confirmLabel = when (op) {
                PersonOp.QuitarRostro -> "Quitar rostro"
                PersonOp.Eliminar -> if (s.forceDelete) "Eliminar (forzado)" else "Eliminar"
            },
            sending = s.acting,
            onConfirm = { vm.confirmar(onDeleted) },
            onDismiss = vm::cancelarConfirmacion,
        )
    }

    when {
        s.loading -> NxLoadingBlock("Cargando ficha…")
        s.error != null -> NxErrorBlock(s.error.orEmpty()) { vm.refresh() }
        else -> LazyColumn(
            Modifier.fillMaxSize().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            item {
                Text(
                    str(person, "name", "personName").ifBlank { personId },
                    style = MaterialTheme.typography.titleLarge,
                    color = NxColors.Slate,
                )
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    NxStatusChip(validity.label, validity.tone)
                    NxStatusChip(
                        vigenciaLabel(bool(person, "validEnable")),
                        vigenciaTone(bool(person, "validEnable")),
                    )
                }
            }
            item { IntegraOpMessage(s.message, s.messageIsError) }

            // ── Identidad ────────────────────────────────────────────────────
            item { NxSectionHeader(title = "Identidad", subtitle = "Ficha en el control de acceso") }
            item { IntegraDetailLine("ID ACS", personId) }
            item { IntegraDetailLine("Código", str(person, "code", "personCode")) }
            item { IntegraDetailLine("Tipo", userTypeLabel(strOrNull(person, "userType"))) }
            item { IntegraDetailLine("Género", genderLabel(strOrNull(person, "gender"))) }
            item { IntegraDetailLine("Departamento", str(person, "orgName")) }
            item {
                IntegraDetailLine(
                    "Vigencia",
                    listOf(
                        IntegraFormat.dateTime(str(person, "validFrom"), s.zone),
                        IntegraFormat.dateTime(str(person, "validTo"), s.zone),
                    ).filter { it != IntegraFormat.EMPTY }.joinToString(" → "),
                )
            }
            item {
                IntegraDetailLine(
                    "Terminal",
                    listOf(str(person, "sourceName"), str(person, "sourceIp"))
                        .filter { it.isNotBlank() }.joinToString(" · "),
                )
            }
            item {
                val puertas = stringList(person, "doorNames")
                IntegraDetailLine(
                    "Puede abrir",
                    if (puertas.isNotEmpty()) puertas.joinToString(" · ") else str(person, "doorRight"),
                )
            }

            // ── Credenciales ─────────────────────────────────────────────────
            item {
                NxSectionHeader(
                    title = "Credenciales",
                    subtitle = "Con qué se identifica en el lector",
                )
            }
            item {
                IntegraDetailLine(
                    "Enroladas",
                    credencialesLabel(
                        numOfFace = int(person, "numOfFace"),
                        numOfCard = int(person, "numOfCard"),
                        numOfFP = int(person, "numOfFP"),
                        hasLocalFace = bool(person, "hasLocalFace"),
                    ),
                )
            }
            item {
                val tarjetas = stringList(person, "cardNos")
                IntegraDetailLine("Nº de tarjeta", tarjetas.joinToString(" · "))
            }
            if (bool(person, "hasLocalFace") != true && bool(person, "hasFace") == true) {
                item {
                    IntegraNotice(
                        "Rostro enrolado en el terminal, pero sin JPEG guardado en NEXARA: el " +
                            "modelo biométrico no se puede exportar. Vuelve a subir la foto si " +
                            "la quieres disponible aquí.",
                        NxTone.Warning,
                    )
                }
            }

            // ── Usuario ERP ──────────────────────────────────────────────────
            val erp = subMap(s.data, "erpUser") ?: subMap(person, "erpUser")
            if (erp != null) {
                item {
                    NxSectionHeader(
                        title = "Usuario ERP",
                        subtitle = "Vínculo User.employeeNumber ↔ ACS employeeNo",
                    )
                }
                item { IntegraDetailLine("Usuario", str(erp, "nombre", "email")) }
                item { IntegraDetailLine("Correo", str(erp, "email")) }
                item { IntegraDetailLine("Nº empleado", str(erp, "employeeNumber")) }
                item { IntegraDetailLine("Rol", str(erp, "role")) }
                item { IntegraDetailLine("Departamento", str(erp, "department")) }
            } else {
                item {
                    IntegraNotice(
                        "Sin vínculo ERP: sus eventos no resuelven a un usuario de NEXARA, así " +
                            "que no aparece en asistencia híbrida ni en actividades. El enlace se " +
                            "hace por el mismo código en employeeNumber y personId.",
                        NxTone.Neutral,
                    )
                }
            }

            // ── Editar ───────────────────────────────────────────────────────
            item {
                NxSectionHeader(
                    title = "Editar ficha",
                    subtitle = "Se escribe en todos los terminales del sitio",
                )
            }
            item {
                OutlinedTextField(
                    value = editName,
                    onValueChange = { editName = it },
                    label = { Text("Nombre") },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !s.acting,
                    singleLine = true,
                )
            }
            item {
                IntegraPicker(
                    label = "Tipo de usuario",
                    options = USER_TYPES,
                    selected = editUserType,
                    emptyLabel = "Sin cambiar",
                    onSelect = { editUserType = it },
                    enabled = !s.acting,
                )
            }
            item {
                IntegraPicker(
                    label = "Género",
                    options = GENDERS,
                    selected = editGender,
                    emptyLabel = "Sin cambiar",
                    onSelect = { editGender = it },
                    enabled = !s.acting,
                )
            }
            item {
                OutlinedTextField(
                    value = editValidFrom,
                    onValueChange = { editValidFrom = it },
                    label = { Text("Vigencia desde") },
                    placeholder = { Text("2020-01-01T00:00:00") },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !s.acting,
                    singleLine = true,
                )
            }
            item {
                OutlinedTextField(
                    value = editValidTo,
                    onValueChange = { editValidTo = it },
                    label = { Text("Vigencia hasta") },
                    placeholder = { Text("2037-12-31T23:59:59") },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !s.acting,
                    singleLine = true,
                )
            }
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(
                        checked = editValidEnable,
                        onCheckedChange = { editValidEnable = it },
                        enabled = !s.acting,
                    )
                    Text("Vigencia activa", style = MaterialTheme.typography.bodyMedium)
                }
            }
            item {
                Button(
                    onClick = {
                        vm.update(
                            name = editName.trim().ifBlank { null },
                            gender = editGender.ifBlank { null },
                            userType = editUserType.ifBlank { null },
                            validFrom = editValidFrom.trim().ifBlank { null },
                            validTo = editValidTo.trim().ifBlank { null },
                            validEnable = editValidEnable,
                        )
                    },
                    enabled = !s.acting,
                    modifier = Modifier.fillMaxWidth(),
                ) { Text(if (s.acting) "Guardando…" else "Guardar en terminales") }
            }

            // ── Rostro ───────────────────────────────────────────────────────
            item {
                NxSectionHeader(
                    title = "Rostro",
                    subtitle = "Face ID en las terminales DS-K1T",
                )
            }
            item {
                IntegraNotice(
                    "El rostro es dato personal sensible (LFPDPPP): se captura sólo con " +
                        "consentimiento expreso de la persona.",
                    NxTone.Warning,
                )
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(
                        onClick = { pickFace.launch("image/jpeg") },
                        enabled = !s.acting,
                        modifier = Modifier.weight(1f),
                    ) { Text("Subir JPEG") }
                    OutlinedButton(
                        onClick = { vm.pedirConfirmacion(PersonOp.QuitarRostro) },
                        enabled = !s.acting && bool(person, "hasFace") == true,
                        modifier = Modifier.weight(1f),
                    ) { Text("Quitar rostro") }
                }
            }
            item {
                Text(
                    "JPEG frontal, buena luz. Los DS-K1T no aceptan bien PNG.",
                    style = MaterialTheme.typography.labelSmall,
                    color = NxColors.Muted,
                )
            }

            // ── Baja ─────────────────────────────────────────────────────────
            item {
                NxSectionHeader(
                    title = "Dar de baja",
                    subtitle = "Irreversible: se borra en los terminales",
                )
            }
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(
                        checked = s.forceDelete,
                        onCheckedChange = vm::setForceDelete,
                        enabled = !s.acting,
                    )
                    Text(
                        "Forzar baja aunque algún terminal no conteste",
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
            item {
                OutlinedButton(
                    onClick = { vm.pedirConfirmacion(PersonOp.Eliminar) },
                    enabled = !s.acting,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Eliminar persona", color = NxColors.Danger, fontWeight = FontWeight.SemiBold)
                }
            }
            item { IntegraDetailLine("Fuente del dato", str(s.data, "source", "provider")) }
        }
    }
}
