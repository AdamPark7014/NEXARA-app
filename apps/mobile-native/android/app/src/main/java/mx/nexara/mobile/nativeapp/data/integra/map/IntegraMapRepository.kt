package mx.nexara.mobile.nativeapp.data.integra.map

import android.content.Context
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.ApiClient
import mx.nexara.mobile.nativeapp.data.integra.IntegraSiteScope

/**
 * Lectura del plano del sitio.
 *
 * **Este repositorio no escribe nada, y es una decisión, no una carencia.**
 *
 * El servidor sí admite crear planos, colocar pines y borrarlos
 * (`POST integra/floorplans`, `POST integra/floorplans/:id/pins`,
 * `DELETE integra/map-pins/:id`, todos detrás de `integraCanSettings`). Situar
 * una cámara sobre una planta es trabajo de precisión con una imagen grande, y
 * hacerlo con el dedo sobre una pantalla de cinco pulgadas sale mal: en la
 * consola web, hasta hace poco, **tocar un pin lo borraba en el acto y sin
 * preguntar** —y el texto de ayuda lo anunciaba como si fuera una función—. En
 * un teléfono, donde el toque accidental es la norma y no la excepción, eso
 * sería peor todavía.
 *
 * Así que aquí el plano se consulta: se acerca, se arrastra y se toca un pin
 * para ver qué es y cómo está **ahora mismo**, que es lo que hace falta cuando
 * uno está de pie delante de la instalación. Editar posiciones se queda en la
 * consola web. El módulo se declara `SOLO_LECTURA` en el catálogo, la pantalla
 * lo dice con todas las letras y no hay ningún botón que insinúe otra cosa.
 */
class IntegraMapRepository(context: Context) {

    private val authRepo = AuthRepository(context)

    private val api: IntegraMapApi = ApiClient.authed(
        tokenProvider = { authRepo.token() },
        companyIdProvider = { authRepo.companyId() },
    ).create(IntegraMapApi::class.java)

    private fun site(): Int? = IntegraSiteScope.current()

    /**
     * Planos + inventario en paralelo.
     *
     * El inventario es **complementario**: si `doors` o `cameras` fallan, el
     * plano se sigue enseñando con los pines y sin estado vivo, en vez de
     * quedarse en blanco por un endpoint secundario. Los pines pasan entonces a
     * «sin dato», que es la verdad, no un cero.
     */
    suspend fun snapshot(): MapSnapshot = coroutineScope {
        val siteId = site()
        val plansJob = async { MapJson.list(api.listFloorplans(siteId = siteId)) }
        val doorsJob = async {
            runCatching { MapJson.list(api.listDoors(siteId = siteId)) }.getOrDefault(emptyList())
        }
        val camsJob = async {
            runCatching { MapJson.list(api.listCameras(siteId = siteId)) }.getOrDefault(emptyList())
        }

        MapSnapshot(
            floorplans = plansJob.await().mapNotNull { Floorplan.fromMap(it) },
            doors = doorsJob.await().mapNotNull { MapEntity.door(it) },
            cameras = camsJob.await().mapNotNull { MapEntity.camera(it) },
        )
    }
}
