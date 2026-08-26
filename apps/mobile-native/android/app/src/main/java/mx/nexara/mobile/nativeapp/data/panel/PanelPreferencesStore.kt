package mx.nexara.mobile.nativeapp.data.panel

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import mx.nexara.mobile.nativeapp.access.PanelId

private val Context.panelPreferencesDataStore: DataStore<Preferences> by preferencesDataStore(
    name = "nexara_panel_preferences",
)

class PanelPreferencesStore(context: Context) {
    private val appContext = context.applicationContext
    private val lastPanelKey = stringPreferencesKey("last_panel_key")

    val lastPanel: Flow<PanelId?> = appContext.panelPreferencesDataStore.data
        .map { prefs -> PanelId.fromKey(prefs[lastPanelKey].orEmpty()) }

    suspend fun setLastPanel(panel: PanelId) {
        appContext.panelPreferencesDataStore.edit { prefs ->
            prefs[lastPanelKey] = panel.key
        }
    }
}
