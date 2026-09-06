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
import mx.nexara.mobile.nativeapp.data.api.UpdateUserProfileBody
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.toAbsoluteAssetUrl
import mx.nexara.mobile.nativeapp.security.AppLock
import mx.nexara.mobile.nativeapp.ui.NexaraAppMeta
import mx.nexara.mobile.nativeapp.ui.enterprise.NxAppMetaFooter
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
    val direccion: String = "",
    val colonia: String = "",
    val ciudad: String = "",
    val estado: String = "",
    val codigoPostal: String = "",
    val curp: String = "",
    val rfc: String = "",
    val nss: String = "",
    val contactoEmergenciaNombre: String = "",
    val contactoEmergenciaTelefono: String = "",
    val profileStatus: String? = null,
)

class MyProfileViewModel(app: android.app.Application) : AndroidViewModel(app) {
    private val repo = ConsoleRepository(app.applicationContext)
    private val _state = MutableStateFlow(MyProfileUiState())
    val state: StateFlow<MyProfileUiState> = _state

    init { load() }

    fun setField(field: String, value: String) {
        _state.update {
            when (field) {
                "telefono" -> it.copy(telefono = value)
                "direccion" -> it.copy(direccion = value)
                "colonia" -> it.copy(colonia = value)
                "ciudad" -> it.copy(ciudad = value)
                "estado" -> it.copy(estado = value)
                "codigoPostal" -> it.copy(codigoPostal = value)
                "curp" -> it.copy(curp = value)
                "rfc" -> it.copy(rfc = value)
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
                val p = me.perfil
                _state.update {
                    it.copy(
                        loading = false,
                        telefono = p?.telefono.orEmpty(),
                        direccion = p?.direccion.orEmpty(),
                        colonia = p?.colonia.orEmpty(),
                        ciudad = p?.ciudad.orEmpty(),
                        estado = p?.estado.orEmpty(),
                        codigoPostal = p?.codigoPostal.orEmpty(),
                        curp = p?.curp.orEmpty(),
                        rfc = p?.rfc.orEmpty(),
                        nss = p?.nss.orEmpty(),
                        contactoEmergenciaNombre = p?.contactoEmergenciaNombre.orEmpty(),
                        contactoEmergenciaTelefono = p?.contactoEmergenciaTelefono.orEmpty(),
                        profileStatus = p?.estatus,
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
                            direccion = s.direccion.trim().ifBlank { null },
                            colonia = s.colonia.trim().ifBlank { null },
                            ciudad = s.ciudad.trim().ifBlank { null },
                            estado = s.estado.trim().ifBlank { null },
                            codigoPostal = s.codigoPostal.trim().ifBlank { null },
                            curp = s.curp.trim().ifBlank { null },
                            rfc = s.rfc.trim().ifBlank { null },
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
    val lockAvailable = remember(context) { AppLock.canAuthenticate(context) }
    val Teal = Color(0xFF0D9488)
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
                            modifier = Modifier.size(80.dp).clip(RoundedCornerShape(16.dp)).background(Teal),
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
                            modifier = Modifier.size(80.dp).clip(CircleShape).border(3.dp, Teal, CircleShape),
                            contentScale = ContentScale.Crop,
                        )
                    } else {
                        val initials = user.nombre.split(" ").take(2).map { it.firstOrNull()?.uppercaseChar() ?: '?' }.joinToString("")
                        Box(
                            modifier = Modifier.size(80.dp).clip(CircleShape).background(Teal),
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
                            .background(if (isSuperAdmin) Teal else Color(0xFFCCFBF1))
                            .padding(horizontal = 12.dp, vertical = 5.dp),
                    ) {
                        Text(roleBadge, style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold), color = if (isSuperAdmin) Color.White else Teal)
                    }
                }
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
                    Text("Datos personales", fontWeight = FontWeight.SemiBold, color = Slate)
                    if (profileState.loading) {
                        CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterHorizontally))
                    } else {
                        profileState.error?.let { err ->
                            Text(err, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                            TextButton(onClick = { vm.load() }) { Text("Reintentar") }
                        }
                        ProfileField("Teléfono", profileState.telefono) { vm.setField("telefono", it) }
                        ProfileField("Dirección", profileState.direccion) { vm.setField("direccion", it) }
                        ProfileField("Colonia", profileState.colonia) { vm.setField("colonia", it) }
                        ProfileField("Ciudad", profileState.ciudad) { vm.setField("ciudad", it) }
                        ProfileField("Estado", profileState.estado) { vm.setField("estado", it) }
                        ProfileField("C.P.", profileState.codigoPostal) { vm.setField("codigoPostal", it) }
                        ProfileField("CURP", profileState.curp) { vm.setField("curp", it) }
                        ProfileField("RFC", profileState.rfc) { vm.setField("rfc", it) }
                        ProfileField("NSS", profileState.nss) { vm.setField("nss", it) }
                        ProfileField("Contacto emergencia", profileState.contactoEmergenciaNombre) {
                            vm.setField("contactoEmergenciaNombre", it)
                        }
                        ProfileField("Tel. emergencia", profileState.contactoEmergenciaTelefono) {
                            vm.setField("contactoEmergenciaTelefono", it)
                        }
                        profileState.profileStatus?.takeIf { it.isNotBlank() }?.let { st ->
                            ProfileInfoRow("Estatus perfil", st, Teal, Sub)
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
                    if (user.department.isNotBlank()) ProfileInfoRow("Departamento", user.department, Teal, Sub)
                    if (user.clientId != null) ProfileInfoRow("Client ID", user.clientId.toString(), Teal, Sub)
                    if (user.branchId != null) ProfileInfoRow("Branch ID", user.branchId.toString(), Teal, Sub)
                    ProfileInfoRow("ID de usuario", user.id.toString(), Teal, Sub)
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

        // ── Permissions ──────────────────────────────────────────────────
        if (user.permissions.isNotEmpty()) {
            item {
                Text(
                    "Permisos (${user.permissions.size})",
                    style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold, letterSpacing = 0.8.sp),
                    color = Sub,
                    modifier = Modifier.padding(horizontal = 2.dp, vertical = 2.dp),
                )
            }
            items(user.permissions) { p ->
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(10.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFFF8FAFC)),
                    elevation = CardDefaults.cardElevation(0.dp),
                ) {
                    Text(
                        p,
                        style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Medium),
                        color = Slate,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                    )
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
}

@Composable
private fun ProfileInfoRow(label: String, value: String, teal: Color, sub: Color) {
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
