package mx.nexara.mobile.nativeapp.ui.screens

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.AuthRepository

data class LoginUiState(
    val email: String = "",
    val password: String = "",
    val isLoading: Boolean = false,
    val error: String? = null,
)

class LoginViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = AuthRepository(app.applicationContext)

    private val _state = MutableStateFlow(LoginUiState())
    val state: StateFlow<LoginUiState> = _state

    fun setEmail(value: String) = _state.update { it.copy(email = value, error = null) }
    fun setPassword(value: String) = _state.update { it.copy(password = value, error = null) }

    fun submit(onLoggedIn: () -> Unit) {
        val snapshot = _state.value
        if (snapshot.isLoading) return
        if (snapshot.email.isBlank() || snapshot.password.isBlank()) return

        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    repo.login(snapshot.email.trim(), snapshot.password)
                }
                _state.update { it.copy(isLoading = false, error = null) }
                onLoggedIn()
            } catch (e: Exception) {
                val msg = e.message?.takeIf { it.isNotBlank() } ?: "No se pudo iniciar sesión"
                _state.update { it.copy(isLoading = false, error = msg) }
            }
        }
    }
}

