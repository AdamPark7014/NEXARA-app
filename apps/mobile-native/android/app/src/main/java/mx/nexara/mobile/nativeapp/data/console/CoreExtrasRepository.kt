package mx.nexara.mobile.nativeapp.data.console

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.ApiClient
import mx.nexara.mobile.nativeapp.data.api.CoreExtrasApi
import mx.nexara.mobile.nativeapp.data.api.KpisEquipoDto
import mx.nexara.mobile.nativeapp.data.api.OrgNodeDto
import mx.nexara.mobile.nativeapp.data.api.ProyectoResumenDto
import mx.nexara.mobile.nativeapp.data.api.StockLevelDto

/**
 * Lectura de los cuatro módulos de consulta de «Más»: KPIs del equipo,
 * organigrama, proyectos y almacén.
 *
 * Son de solo lectura a propósito: en el teléfono no se edita el organigrama ni
 * se mueve inventario. Lo que la app no hace, lo dice la pantalla; no hay ningún
 * botón que eche al navegador.
 */
class CoreExtrasRepository(context: Context) {
    private val authRepo = AuthRepository(context)
    private val api: CoreExtrasApi = ApiClient.authed(
        tokenProvider = { authRepo.token() },
        companyIdProvider = { authRepo.companyId() },
    ).create(CoreExtrasApi::class.java)

    suspend fun kpisEquipo(desde: String, hasta: String): KpisEquipoDto =
        withContext(Dispatchers.IO) { api.kpisEquipo(desde, hasta) }

    suspend fun orgchart(): List<OrgNodeDto> =
        withContext(Dispatchers.IO) { api.orgchart() }

    suspend fun proyectos(): List<ProyectoResumenDto> =
        withContext(Dispatchers.IO) { api.proyectos() }

    /** Existencias y alertas de mínimo. */
    data class Almacen(
        val niveles: List<StockLevelDto>,
        val bajoMinimo: List<StockLevelDto>,
    )

    /**
     * Las dos consultas de almacén van en paralelo. Si `alerts/low-stock`
     * falla pero las existencias llegan, la pantalla se pinta igual: el bajo
     * mínimo se deduce de los propios niveles (misma regla que el servidor,
     * `cantidad <= punto de reorden` con punto > 0). Al revés no: sin
     * existencias no hay nada que enseñar y el error sube.
     */
    suspend fun almacen(): Almacen = coroutineScope {
        val nivelesTask = async(Dispatchers.IO) { api.stockLevels() }
        val alertasTask = async(Dispatchers.IO) { runCatching { api.lowStock() } }
        val niveles = nivelesTask.await()
        val bajoMinimo = alertasTask.await().getOrNull()
            ?: niveles.filter { mx.nexara.mobile.nativeapp.ui.console.more.AlmacenRules.bajoMinimo(it) }
        Almacen(niveles = niveles, bajoMinimo = bajoMinimo)
    }
}
