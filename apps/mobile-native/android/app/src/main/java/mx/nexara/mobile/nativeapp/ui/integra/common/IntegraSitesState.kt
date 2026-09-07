package mx.nexara.mobile.nativeapp.ui.integra.common

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import mx.nexara.mobile.nativeapp.data.integra.IntegraRepository
import mx.nexara.mobile.nativeapp.data.integra.IntegraSiteScope

/**
 * Lista de sitios compartida por las diez pantallas de INTEGRA.
 *
 * Sin esto, cada pantalla pediría `GET integra/sites` por su cuenta al abrirse.
 * Se carga una vez por proceso y se refresca a petición.
 *
 * También decide el sitio inicial con el mismo orden que la web: lo que el
 * usuario eligió la última vez (si sigue existiendo), el marcado como
 * predeterminado, o el primero.
 */
object IntegraSitesCache {
    private val _sites = MutableStateFlow<List<Map<String, Any?>>>(emptyList())
    val sites: StateFlow<List<Map<String, Any?>>> = _sites

    private val _loading = MutableStateFlow(false)
    val loading: StateFlow<Boolean> = _loading

    private val mutex = Mutex()
    private var loaded = false

    /** Carga si aún no hay nada. Un fallo aquí no debe tumbar la pantalla. */
    suspend fun ensure(repo: IntegraRepository) {
        mutex.withLock {
            if (loaded) return
            _loading.value = true
            val result = runCatching { repo.sites() }
            _loading.value = false
            result.onSuccess { list ->
                _sites.value = list
                loaded = true
                reconcile(repo, list)
            }
        }
    }

    suspend fun refresh(repo: IntegraRepository) {
        mutex.withLock {
            _loading.value = true
            val result = runCatching { repo.sites() }
            _loading.value = false
            result.onSuccess { list ->
                _sites.value = list
                loaded = true
                reconcile(repo, list)
            }
        }
    }

    /**
     * Elige sitio si no hay ninguno válido. Si el guardado ya no está en la
     * lista (se borró el sitio, o cambió la empresa) se descarta: seguir
     * mandando ese `siteId` daría 400 o, peor, actuaría sobre otra instalación.
     */
    private fun reconcile(repo: IntegraRepository, list: List<Map<String, Any?>>) {
        val ids = list.mapNotNull { int(it, "id") }.toSet()
        val actual = IntegraSiteScope.current()
        if (actual != null && actual in ids) return
        val elegido = list.firstOrNull { bool(it, "isDefault") == true }?.let { int(it, "id") }
            ?: list.firstOrNull()?.let { int(it, "id") }
        repo.selectSite(elegido)
    }

    /** El sitio activo resuelto contra la lista, para pintar su nombre. */
    fun currentSite(): Map<String, Any?>? {
        val id = IntegraSiteScope.current()
        val list = _sites.value
        return list.firstOrNull { int(it, "id") == id }
            ?: list.firstOrNull { bool(it, "isDefault") == true }
            ?: list.firstOrNull()
    }

    fun currentSiteName(): String = currentSite()?.let { str(it, "label", "name") }.orEmpty()

    /** El proveedor manda: en HCT no existen personas, visitas ni asistencia. */
    fun currentProvider(): String = currentSite()?.let { str(it, "provider") }.orEmpty()
}
