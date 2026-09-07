package mx.nexara.mobile.nativeapp.ui.integra.governance

import android.app.Application
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
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
import mx.nexara.mobile.nativeapp.data.integra.governance.IdentityMeDto
import mx.nexara.mobile.nativeapp.data.integra.governance.IntegraGovernanceRepository
import mx.nexara.mobile.nativeapp.data.integra.governance.UserProfileDto
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone

/**
 * Perfil INTEGRA: vínculo ERP↔ACS y credenciales del espejo.
 *
 * No edita datos personales aquí (eso vive en `/console/my-profile`).
 * Esta pantalla responde a «¿qué abre mi rostro/tarjeta y por qué?».
 * `ProfileCredentials.kt` llegó truncado por límite de sesión; la UI faltaba.
 */
data class IntegraMyProfileUiState(
    val loading: Boolean = true,
    val error: String? = null,
    val identity: IdentityMeDto? = null,
    val profile: UserProfileDto? = null,
    val person: Map<String, Any?> = emptyMap(),
    val personError: String? = null,
)

class IntegraMyProfileViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = IntegraGovernanceRepository(app.applicationContext)
    private val _state = MutableStateFlow(IntegraMyProfileUiState())
    val state: StateFlow<IntegraMyProfileUiState> = _state

    init { refresh() }

    fun refresh() {
        _state.update { it.copy(loading = true, error = null, personError = null) }
        viewModelScope.launch {
            try {
                val identity = withContext(Dispatchers.IO) { repo.identityMe() }
                val profile = withContext(Dispatchers.IO) {
                    runCatching { repo.myProfile() }.getOrNull()
                }
                val personId = identity.acsPerson?.personId
                val person = if (!personId.isNullOrBlank()) {
                    withContext(Dispatchers.IO) {
                        runCatching {
                            repo.personDetail(personId, identity.acsPerson?.siteId)
                        }.getOrElse { emptyMap() }
                    }
                } else {
                    emptyMap()
                }
                _state.update {
                    it.copy(
                        loading = false,
                        identity = identity,
                        profile = profile,
                        person = person,
                        personError = if (personId.isNullOrBlank()) {
                            null
                        } else if (person.isEmpty()) {
                            "El sitio no devolvió la ficha ACS de $personId"
                        } else {
                            null
                        },
                    )
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        loading = false,
                        error = e.toUserMessage("No se pudo cargar el perfil INTEGRA"),
                    )
                }
            }
        }
    }
}

@Composable
fun IntegraMyProfileScreen(vm: IntegraMyProfileViewModel = viewModel()) {
    val s by vm.state.collectAsState()

    when {
        s.loading -> NxLoadingBlock("Cargando perfil ACS…")
        s.error != null && s.identity == null -> NxErrorBlock(s.error!!) { vm.refresh() }
        else -> {
            val identity = s.identity
            val vinculo = estadoVinculo(identity?.status, identity?.acsPerson?.personName)
            val creds = if (s.person.isNotEmpty()) credencialesDe(s.person) else emptyList()

            LazyColumn(
                Modifier.fillMaxSize().background(NxColors.Surface),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                item {
                    Text("Mi perfil · control de acceso", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    Text(
                        "Qué abre cada credencial y de dónde sale el dato. No se inventa un vínculo.",
                        style = MaterialTheme.typography.bodySmall,
                        color = NxColors.Muted,
                    )
                }

                item {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = NxColors.Card),
                    ) {
                        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            RowChipTitle(
                                title = vinculo.titulo,
                                chip = if (vinculo.vinculado) "Vinculado" else "Sin vínculo",
                                tone = if (vinculo.vinculado) NxTone.Success else NxTone.Warning,
                            )
                            Text(vinculo.explicacion, style = MaterialTheme.typography.bodyMedium)
                            identity?.canonicalKey?.takeIf { it.isNotBlank() }?.let {
                                FichaLinea("Clave canónica", it, fuente = "integra/identity/me · canonicalKey")
                            }
                            identity?.howToLink?.takeIf { it.isNotBlank() }?.let {
                                FichaLinea("Cómo vincular", it, fuente = "integra/identity/me · howToLink")
                            }
                            FichaLinea(
                                "Usuario ERP",
                                identity?.user?.nombre ?: s.profile?.nombre,
                                fuente = "integra/identity/me · user / users/profile/me",
                            )
                            FichaLinea(
                                "EmployeeNo",
                                identity?.user?.employeeNumber ?: s.profile?.employeeNumber,
                                fuente = "User.employeeNumber",
                            )
                            FichaLinea(
                                "Persona ACS",
                                identity?.acsPerson?.personName,
                                fuente = "integra/identity/me · acsPerson",
                            )
                            FichaLinea(
                                "personId",
                                identity?.acsPerson?.personId,
                                fuente = "ACS employeeNo / personId",
                            )
                        }
                    }
                }

                item {
                    Text("Credenciales", fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.titleMedium)
                    Text(
                        "Las puertas se conceden a la persona, no a la credencial. Rostro, huella y tarjeta abren el mismo plan.",
                        style = MaterialTheme.typography.bodySmall,
                        color = NxColors.Muted,
                    )
                }

                if (s.personError != null) {
                    item { Text(s.personError!!, color = NxColors.Danger) }
                }

                if (creds.isEmpty()) {
                    item {
                        NxEmptyState(
                            "Sin ficha ACS",
                            "No hay personId vinculado o el espejo no devolvió credenciales.",
                        )
                    }
                } else {
                    items(creds, key = { it.nombre }) { c ->
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            colors = CardDefaults.cardColors(containerColor = NxColors.Card),
                        ) {
                            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                RowChipTitle(
                                    title = c.nombre,
                                    chip = if (c.presente) "Presente" else "Ausente",
                                    tone = if (c.presente) NxTone.Success else NxTone.Neutral,
                                )
                                Text(c.detalle, style = MaterialTheme.typography.bodyMedium)
                                FichaLinea("Qué abre", c.queAbre)
                                FichaLinea("Fuente", c.fuente)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun RowChipTitle(title: String, chip: String, tone: NxTone) {
    androidx.compose.foundation.layout.Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(title, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f).padding(end = 8.dp))
        NxStatusChip(chip, tone)
    }
}
