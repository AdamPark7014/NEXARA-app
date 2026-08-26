package mx.nexara.mobile.nativeapp.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.loginPreferencesDataStore: DataStore<Preferences> by preferencesDataStore(
    name = "nexara_login_preferences",
)

class LoginPreferencesStore(private val context: Context) {
    private val lastEmailKey = stringPreferencesKey("last_email")

    val lastEmail: Flow<String> = context.loginPreferencesDataStore.data
        .map { prefs -> prefs[lastEmailKey].orEmpty() }

    suspend fun saveLastEmail(email: String) {
        val trimmed = email.trim()
        if (trimmed.isBlank()) return
        context.loginPreferencesDataStore.edit { prefs ->
            prefs[lastEmailKey] = trimmed
        }
    }
}
