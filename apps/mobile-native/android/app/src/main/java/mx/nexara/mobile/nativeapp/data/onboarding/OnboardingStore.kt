package mx.nexara.mobile.nativeapp.data.onboarding

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.onboardingDataStore: DataStore<Preferences> by preferencesDataStore(
    name = "nexara_onboarding",
)

class OnboardingStore(context: Context) {
    private val appContext = context.applicationContext
    private val completedKey = booleanPreferencesKey("onboarding_completed")

    val isCompleted: Flow<Boolean> = appContext.onboardingDataStore.data
        .map { prefs -> prefs[completedKey] ?: false }

    suspend fun markCompleted() {
        appContext.onboardingDataStore.edit { prefs ->
            prefs[completedKey] = true
        }
    }
}
