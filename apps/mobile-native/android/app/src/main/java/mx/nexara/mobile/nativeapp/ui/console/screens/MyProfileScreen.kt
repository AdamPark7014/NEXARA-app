package mx.nexara.mobile.nativeapp.ui.console.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
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
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import mx.nexara.mobile.nativeapp.R
import mx.nexara.mobile.nativeapp.access.PermissionLabels
import mx.nexara.mobile.nativeapp.access.PlatformAccounts
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.console.ConsoleRepository
import mx.nexara.mobile.nativeapp.data.api.HybridItemDto
import mx.nexara.mobile.nativeapp.data.api.MyIdentityDto
import mx.nexara.mobile.nativeapp.data.api.UpdateUserProfileBody
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.profile.ProfileIdentityRepository
import mx.nexara.mobile.nativeapp.ui.console.activities.CoreActivityKinds
import mx.nexara.mobile.nativeapp.ui.console.activities.DatePickerField
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.toAbsoluteAssetUrl
import mx.nexara.mobile.nativeapp.security.AppLock
import mx.nexara.mobile.nativeapp.ui.NexaraAppMeta
import mx.nexara.mobile.nativeapp.ui.enterprise.NxAppMetaFooter
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.util.openExternalUrl

/**
 * Pantalla nativa para "Mi perfil" — sesión local + datos editables vía API.
 */
data class MyProfileUiState(
    val loading: Boolean = true,
    val saving: Boolean = false,
    val error: String? = null,
    val saveMessage: String? = null,
    val telefono: String = "",
    val fechaNacimiento: String = "",
    val direccion: String = "",
    val colonia: String = "",
    val ciudad: String = "",
    val estado: String = "",
    val codigoPostal: String = "",
    val pais: String = "",
    val curp: String = "",
    val rfc: String = "",
    val ineNumero: String = "",
    val nss: String = "",
    val contactoEmergenciaNombre: String = "",
    val contactoEmergenciaTelefono: String = "",
    val profileStatus: String? = null,
    /** Identidad ERP↔ACS (`integra/identity/me`); null si Integra no contestó. */
    val identity: MyIdentityDto? = null,
    /** Fila de hoy del contraste híbrido (`attendance/hybrid?date=`). */
    val hybrid: HybridItemDto? = null,
    val employeeNumber: String? = null,
    val roleName: String? = null,
    val departmentName: String? = null,
) {
    /** «Perfil completo»: los mismos 7 campos que cuenta la web. */
    val completeness: Int
        get() {
            val campos = listOf(telefono, curp, rfc, nss, fechaNacimiento, ciudad, estado)
            return Math.round(campos.count { it.isNotBlank() } * 100f / campos.size)
        }

    /** Nº de empleado con la misma cadena de respaldo que la web. */
    val acsEmployeeNumber: String
        get() = identity?.user?.employeeNumber
            ?: identity?.user?.companyEmployeeNumber
            ?: employeeNumber
            ?: "—"

    /** Texto de «Estado Integra», igual que en el panel. */
    val integraStatusLabel: String
        get() = when (identity?.status) {
            "linked" -> "Vinculado · " +
                (identity.acsPerson?.personName ?: identity.acsPerson?.personId ?: "")
            "erp_only" -> "Tu número aún no está en control de acceso"
            "unlinked" -> "Sin número de empleado"
            else -> "—"
        }
}

class MyProfileViewModel(app: android.app.Application) : AndroidViewModel(app) {
    private val repo = ConsoleRepository(app.applicationContext)
    private val identityRepo = ProfileIdentityRepository(app.applicationContext)
    private val _state = MutableStateFlow(MyProfileUiState())
    val state: StateFlow<MyProfileUiState> = _state

    init { load() }

    fun setField(field: String, value: String) {
        _state.update {
            when (field) {
                "telefono" -> it.copy(telefono = value)
                "fechaNacimiento" -> it.copy(fechaNacimiento = value)
                "direccion" -> it.copy(direccion = value)
                "colonia" -> it.copy(colonia = value)
                "ciudad" -> it.copy(ciudad = value)
                "estado" -> it.copy(estado = value)
                "codigoPostal" -> it.copy(codigoPostal = value)
                "pais" -> it.copy(pais = value)
                "curp" -> it.copy(curp = value)
                "rfc" -> it.copy(rfc = value)
                "ineNumero" -> it.copy(ineNumero = value)
                "nss" -> it.copy(nss = value)
                "contactoEmergenciaNombre" -> it.copy(contactoEmergenciaNombre = value)
                "contactoEmergenciaTelefono" -> it.copy(contactoEmergenciaTelefono = value)
                else -> it
            }
        }
    }

    fun load() {
        _state.update { it.copy(loading = true, error = null, saveMessage = null) }
        viewModelScope.launch {
            try {
                val me = withContext(Dispatchers.IO) { repo.myProfile() }
                // Integra y el contraste híbrido son opcionales: si no contestan,
                // el perfil se muestra igual (como en la web, con `.catch`).
                val hoy = CoreActivityKinds.todayInMexico()
                val identity = withContext(Dispatchers.IO) { identityRepo.myIdentityOrNull() }
                val hybrid = withContext(Dispatchers.IO) { identityRepo.hybridDayOrNull(hoy) }
                val p = me.perfil
                _state.update {
                    it.copy(
                        loading = false,
                        telefono = p?.telefono.orEmpty(),
                        fechaNacimiento = p?.fechaNacimiento.orEmpty().take(10),
                        direccion = p?.direccion.orEmpty(),
                        colonia = p?.colonia.orEmpty(),
                        ciudad = p?.ciudad.orEmpty(),
                        estado = p?.estado.orEmpty(),
                        codigoPostal = p?.codigoPostal.orEmpty(),
                        pais = p?.pais.orEmpty(),
                        curp = p?.curp.orEmpty(),
                        rfc = p?.rfc.orEmpty(),
                        ineNumero = p?.ineNumero.orEmpty(),
                        nss = p?.nss.orEmpty(),
                        contactoEmergenciaNombre = p?.contactoEmergenciaNombre.orEmpty(),
                        contactoEmergenciaTelefono = p?.contactoEmergenciaTelefono.orEmpty(),
                        profileStatus = p?.estatus,
                        identity = identity,
                        hybrid = hybrid?.items?.firstOrNull(),
                        employeeNumber = me.employeeNumber,
                        roleName = me.role?.nombre,
                        departmentName = me.department?.nombre,
                    )
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(loading = false, error = e.toUserMessage("No se pudo cargar el perfil"))
                }
            }
        }
    }

    fun save() {
        val s = _state.value
        _state.update { it.copy(saving = true, saveMessage = null, error = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    repo.updateMyProfile(
                        UpdateUserProfileBody(
                            telefono = s.telefono.trim().ifBlank { null },
                            fechaNacimiento = s.fechaNacimiento.trim().ifBlank { null },
                            direccion = s.direccion.trim().ifBlank { null },
                            colonia = s.colonia.trim().ifBlank { null },
                            ciudad = s.ciudad.trim().ifBlank { null },
                            estado = s.estado.trim().ifBlank { null },
                            codigoPostal = s.codigoPostal.trim().ifBlank { null },
                            pais = s.pais.trim().ifBlank { null },
                            curp = s.curp.trim().ifBlank { null },
                            rfc = s.rfc.trim().ifBlank { null },
                            ineNumero = s.ineNumero.trim().ifBlank { null },
                            nss = s.nss.trim().ifBlank { null },
                            contactoEmergenciaNombre = s.contactoEmergenciaNombre.trim().ifBlank { null },
                            contactoEmergenciaTelefono = s.contactoEmergenciaTelefono.trim().ifBlank { null },
                        ),
                    )
                }
                _state.update { it.copy(saving = false, saveMessage = "Perfil guardado") }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        saving = false,
                        saveMessage = e.toUserMessage("No se pudo guardar"),
                    )
                }
            }
        }
    }
}

@Composable
fun MyProfileScreen(
    contentPadding: PaddingValues = PaddingValues(20.dp),
    onOpenOfflineQueue: (() -> Unit)? = null,
    /** Cierre de sesión: vive aquí, al final y con confirmación (ya no en la barra superior). */
    onLogout: (() -> Unit)? = null,
) {
    val context = LocalContext.current
    val authRepo = remember(context) { AuthRepository(context) }
    val user = authRepo.loadSession()
    val vm: MyProfileViewModel = viewModel(
        factory = object : androidx.lifecycle.ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : androidx.lifecycle.ViewModel> create(modelClass: Class<T>): T =
                MyProfileViewModel(context.applicationContext as android.app.Application) as T
        },
    )
    val profileState by vm.state.collectAsState()
    val isSuperAdmin = user?.isSuperAdmin == true
    var appLockEnabled by remember { mutableStateOf(AppLock.isEnabled(context)) }
    var confirmLogout by remember { mutableStateOf(false) }
    val lockAvailable = remember(context) { AppLock.canAuthenticate(context) }
    val Brand = NxColors.Brand
    val Slate = Color(0xFF0F172A)
    val Sub = Color(0xFF64748B)

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(contentPadding),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (user == null) {
            item { Text("No hay sesión activa.", color = Sub) }
            return@LazyColumn
        }

        // ── Avatar + name banner ──────────────────────────────────────────
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(20.dp),
                colors = CardDefaults.cardColors(containerColor = if (isSuperAdmin) Color(0xFF0F172A) else Color(0xFFF8FAFC)),
                elevation = CardDefaults.cardElevation(2.dp),
            ) {
                Column(
                    modifier = Modifier.padding(24.dp).fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    if (isSuperAdmin) {
                        Box(
                            modifier = Modifier.size(80.dp).clip(RoundedCornerShape(16.dp)).background(Brand),
                            contentAlignment = Alignment.Center,
                        ) {
                            androidx.compose.foundation.Image(
                                painter = painterResource(R.drawable.logo_nexara),
                                contentDescription = "NEXARA",
                                modifier = Modifier.size(60.dp),
                                contentScale = ContentScale.Fit,
                            )
                        }
                    } else if (!user.avatarUrl.isNullOrBlank()) {
                        AsyncImage(
                            model = toAbsoluteAssetUrl(user.avatarUrl),
                            contentDescription = user.nombre,
                            modifier = Modifier.size(80.dp).clip(CircleShape).border(3.dp, Brand, CircleShape),
                            contentScale = ContentScale.Crop,
                        )
                    } else {
                        val initials = user.nombre.split(" ").take(2).map { it.firstOrNull()?.uppercaseChar() ?: '?' }.joinToString("")
                        Box(
                            modifier = Modifier.size(80.dp).clip(CircleShape).background(Brand),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(initials, style = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.Bold, color = Color.White))
                        }
                    }

                    Text(
                        user.nombre.ifBlank { "Usuario" },
                        style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                        color = if (isSuperAdmin) Color.White else Slate,
                    )
                    Text(
                        user.email,
                        style = MaterialTheme.typography.bodyMedium,
                        color = if (isSuperAdmin) Color(0xFF94A3B8) else Sub,
                    )
                    // Role badge
                    val roleBadge = when {
                        isSuperAdmin -> "Super Administrador"
                        user.isClient -> "Portal Cliente"
                        user.isBranchUser -> "Portal Sucursal"
                        else -> user.role.ifBlank { "Usuario" }
                    }
                    Box(
                        modifier = Modifier.clip(RoundedCornerShape(8.dp))
                            .background(if (isSuperAdmin) Brand else NxColors.BrandSoft)
                            .padding(horizontal = 12.dp, vertical = 5.dp),
                    ) {
                        Text(roleBadge, style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold), color = if (isSuperAdmin) Color.White else Brand)
                    }
                }
            }
        }

        // Dirección (Christian, Claudia) y cuentas de sistema no llevan expediente de RH ni checador.
        val cuentaDireccion = PlatformAccounts.isCeoEquivalentEmail(user.email) ||
            PlatformAccounts.isNonEmployeeEmail(user.email)

        // ── Completitud, identidad ACS y asistencia de hoy ────────────────
        if (!profileState.loading && profileState.error == null && !cuentaDireccion) {
            item {
                ProfileCoreSummary(state = profileState, brand = Brand, sub = Sub, slate = Slate)
            }
        }

        // ── Info fields (API) ─────────────────────────────────────────────
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                elevation = CardDefaults.cardElevation(1.dp),
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(if (cuentaDireccion) "Contacto" else "Datos personales", fontWeight = FontWeight.SemiBold, color = Slate)
                    if (profileState.loading) {
                        CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterHorizontally))
                    } else {
                        profileState.error?.let { err ->
                            Text(err, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                            TextButton(onClick = { vm.load() }) { Text("Reintentar") }
                        }
                        ProfileField("Teléfono", profileState.telefono) { vm.setField("telefono", it) }
                        if (!cuentaDireccion) DatePickerField(
                            label = "Fecha de nacimiento",
                            value = profileState.fechaNacimiento,
                            onValueChange = { vm.setField("fechaNacimiento", it) },
                        )
                        if (!cuentaDireccion) {
                            ProfileField("Dirección", profileState.direccion) { vm.setField("direccion", it) }
                            ProfileField("Colonia", profileState.colonia) { vm.setField("colonia", it) }
                            ProfileField("Ciudad", profileState.ciudad) { vm.setField("ciudad", it) }
                            ProfileField("Estado", profileState.estado) { vm.setField("estado", it) }
                            ProfileField("C.P.", profileState.codigoPostal) { vm.setField("codigoPostal", it) }
                            ProfileField("País", profileState.pais) { vm.setField("pais", it) }
                            ProfileField("CURP", profileState.curp) { vm.setField("curp", it) }
                            ProfileField("RFC", profileState.rfc) { vm.setField("rfc", it) }
                            ProfileField("Número de INE", profileState.ineNumero) { vm.setField("ineNumero", it) }
                            ProfileField("NSS", profileState.nss) { vm.setField("nss", it) }
                        }
                        ProfileField("Contacto emergencia", profileState.contactoEmergenciaNombre) {
                            vm.setField("contactoEmergenciaNombre", it)
                        }
                        ProfileField("Tel. emergencia", profileState.contactoEmergenciaTelefono) {
                            vm.setField("contactoEmergenciaTelefono", it)
                        }
                        profileState.profileStatus?.takeIf { it.isNotBlank() }?.let { st ->
                            ProfileInfoRow("Estatus perfil", st, Brand, Sub)
                        }
                        if (!profileState.saveMessage.isNullOrBlank()) {
                            Text(
                                profileState.saveMessage!!,
                                color = if (profileState.saveMessage!!.contains("guardado", true)) Color(0xFF059669) else MaterialTheme.colorScheme.error,
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                        Button(
                            onClick = { vm.save() },
                            enabled = !profileState.saving && !profileState.loading,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            if (profileState.saving) {
                                CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                            } else {
                                Text("Guardar perfil")
                            }
                        }
                    }
                }
            }
        }

        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                elevation = CardDefaults.cardElevation(1.dp),
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    if (user.department.isNotBlank()) ProfileInfoRow("Departamento", user.department, Brand, Sub)
                    if (user.email.isNotBlank()) ProfileInfoRow("Correo", user.email, Brand, Sub)
                }
            }
        }

        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                elevation = CardDefaults.cardElevation(1.dp),
            ) {
                Row(
                    Modifier.padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Column(Modifier.weight(1f).padding(end = 12.dp)) {
                        Text("Bloqueo de app", fontWeight = FontWeight.SemiBold, color = Slate)
                        Text(
                            if (lockAvailable) {
                                "Biometría o PIN al volver a la app"
                            } else {
                                "No disponible en este dispositivo"
                            },
                            style = MaterialTheme.typography.bodySmall,
                            color = Sub,
                        )
                    }
                    Switch(
                        checked = appLockEnabled,
                        enabled = lockAvailable,
                        onCheckedChange = { on ->
                            appLockEnabled = on
                            AppLock.setEnabled(context, on)
                        },
                    )
                }
            }
        }

        if (onOpenOfflineQueue != null) {
            item {
                Card(
                    onClick = onOpenOfflineQueue,
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFFEFF6FF)),
                ) {
                    Row(
                        Modifier.padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text("Cola offline", fontWeight = FontWeight.SemiBold, color = Slate)
                            Text(
                                "Ver y sincronizar cambios pendientes",
                                style = MaterialTheme.typography.bodySmall,
                                color = Sub,
                            )
                        }
                        Text("›", color = Sub, fontSize = 20.sp)
                    }
                }
            }
        }

        // ── Lo que puedes hacer (permisos traducidos) ────────────────────
        if (user.permissions.isNotEmpty()) {
            item {
                PermisosAmigables(
                    permisos = user.permissions,
                    accesoTotal = user.isSuperAdmin || PlatformAccounts.isCeoEquivalentEmail(user.email),
                    slate = Slate,
                    sub = Sub,
                    brand = Brand,
                )
            }
        }

        if (onLogout != null) {
            item {
                OutlinedButton(
                    onClick = { confirmLogout = true },
                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                    shape = RoundedCornerShape(12.dp),
                    border = androidx.compose.foundation.BorderStroke(1.dp, NxColors.Danger.copy(alpha = 0.5f)),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = NxColors.Danger),
                ) {
                    Text("Cerrar sesión", fontWeight = FontWeight.SemiBold)
                }
            }
        }

        item {
            NxAppMetaFooter(
                onOpenPrivacy = { openExternalUrl(context, NexaraAppMeta.PRIVACY_URL) },
            )
        }

        item { Spacer(Modifier.height(24.dp)) }
    }

    if (confirmLogout && onLogout != null) {
        AlertDialog(
            onDismissRequest = { confirmLogout = false },
            title = { Text("¿Cerrar sesión?") },
            text = { Text("Tendrás que volver a entrar con tu correo y contraseña.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmLogout = false
                    onLogout()
                }) { Text("Cerrar sesión", color = NxColors.Danger, fontWeight = FontWeight.SemiBold) }
            },
            dismissButton = {
                TextButton(onClick = { confirmLogout = false }) { Text("Cancelar") }
            },
        )
    }
}

/** «hh:mm» en hora de México a partir de un instante ISO del servidor. */
private fun hhmmMexico(iso: String?): String? = iso?.takeIf { it.isNotBlank() }?.let { raw ->
    runCatching {
        java.time.Instant.parse(raw)
            .atZone(CoreActivityKinds.MEXICO)
            .format(java.time.format.DateTimeFormatter.ofPattern("HH:mm"))
    }.getOrNull()
}

/**
 * Espejo de las tarjetas de `/erp/my-profile`: KPI de perfil completo, ficha de
 * identidad ACS y el contraste de asistencia de hoy (checador ERP vs puertas).
 */
@Composable
private fun ProfileCoreSummary(
    state: MyProfileUiState,
    brand: Color,
    sub: Color,
    slate: Color,
) {
    val pct = state.completeness
    val pctColor = when {
        pct >= 80 -> Color(0xFF059669)
        pct >= 50 -> Color(0xFFD97706)
        else -> Color(0xFFDC2626)
    }
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(1.dp),
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Perfil completo", fontWeight = FontWeight.SemiBold, color = slate)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(
                    "$pct%",
                    style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold),
                    color = pctColor,
                )
                LinearProgressIndicator(
                    progress = { pct / 100f },
                    modifier = Modifier.weight(1f),
                    color = pctColor,
                )
            }
            Text(
                "Cuenta teléfono, CURP, RFC, NSS, fecha de nacimiento, ciudad y estado.",
                style = MaterialTheme.typography.bodySmall,
                color = sub,
            )

            HorizontalDivider()

            ProfileInfoRow("Departamento", state.departmentName ?: "—", brand, sub)
            ProfileInfoRow("Rol", state.roleName ?: "—", brand, sub)
            ProfileInfoRow("Nº de empleado", state.acsEmployeeNumber, brand, sub)
            ProfileInfoRow("Control de acceso", state.integraStatusLabel, brand, sub)

            HorizontalDivider()

            Text("Acceso y asistencia (hoy)", fontWeight = FontWeight.SemiBold, color = slate)
            val erp = state.hybrid?.erp
            val acs = state.hybrid?.acs
            val erpTexto = when {
                erp?.checkIn != null -> buildString {
                    append("Entrada ${hhmmMexico(erp.checkIn) ?: "—"}")
                    hhmmMexico(erp.checkOut)?.let { append(" · Salida $it") }
                }
                else -> "Sin entrada"
            }
            val acsTexto = when {
                acs?.firstAt != null ->
                    "${acs.passes ?: 0} pases · ${acs.firstDoor ?: "puerta"} · desde ${hhmmMexico(acs.firstAt) ?: "—"}"
                state.identity?.status == "linked" -> "Sin pases hoy"
                else -> "Sin vincular"
            }
            ProfileInfoRow("Checador de la app", erpTexto, brand, sub)
            ProfileInfoRow("Pases en puertas", acsTexto, brand, sub)
            Text(
                "El checador de la app es el que cuenta para tu nómina.",
                style = MaterialTheme.typography.bodySmall,
                color = sub,
            )
            if (state.identity?.status != "linked") {
                Text(
                    // El texto de la API es para administradores (Integra, employeeNo); aquí va el del empleado.
                    "Pide a RH que vincule tu número de empleado con el control de acceso.",
                    style = MaterialTheme.typography.bodySmall,
                    color = sub,
                )
            }
        }
    }
}

/** «Lo que puedes hacer»: permisos por módulo en lenguaje llano; lo heredado de otros paneles, plegado. */
@Composable
private fun PermisosAmigables(
    permisos: List<String>,
    accesoTotal: Boolean,
    slate: Color,
    sub: Color,
    brand: Color,
) {
    val grupos = remember(permisos) { PermissionLabels.agrupar(permisos) }
    val core = grupos.filter { it.modulo.core }
    val otros = grupos.filter { !it.modulo.core }
    var verOtros by remember { mutableStateOf(false) }
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(1.dp),
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Lo que puedes hacer", fontWeight = FontWeight.SemiBold, color = slate)
            Text(
                if (accesoTotal) "Tienes acceso completo de dirección a NEXARA." else "Según tu puesto en la empresa.",
                style = MaterialTheme.typography.bodySmall,
                color = sub,
            )
            core.forEach { g -> PermisoFila(g, slate, sub, brand) }
            if (otros.isNotEmpty()) {
                TextButton(onClick = { verOtros = !verOtros }) {
                    Text(
                        if (verOtros) "Ocultar módulos fuera de la app" else "Ver módulos fuera de la app (${otros.size})",
                        color = brand,
                    )
                }
                if (verOtros) otros.forEach { g -> PermisoFila(g, slate, sub, brand) }
            }
        }
    }
}

@Composable
private fun PermisoFila(grupo: PermissionLabels.Grupo, slate: Color, sub: Color, brand: Color) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(Color(0xFFF8FAFC))
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(
            Modifier
                .size(8.dp)
                .clip(CircleShape)
                .background(if (grupo.modulo.core) brand else sub),
        )
        Column(Modifier.weight(1f)) {
            Text(grupo.modulo.nombre, fontWeight = FontWeight.SemiBold, color = slate, fontSize = 14.sp)
            Text(PermissionLabels.unirAcciones(grupo.acciones), style = MaterialTheme.typography.bodySmall, color = sub)
        }
    }
}

@Composable
private fun ProfileInfoRow(label: String, value: String, brand: Color, sub: Color) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = sub)
        Text(value, style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold), color = Color(0xFF0F172A))
    }
}

@Composable
private fun ProfileField(label: String, value: String, onValueChange: (String) -> Unit) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        singleLine = label != "Dirección",
        modifier = Modifier.fillMaxWidth(),
    )
}
