package mx.nexara.mobile.nativeapp.ui.integra.video

/**
 * Rutas del bloque de video, para que quien cablee `IntegraNavHost` no tenga que
 * inventarlas ni copiarlas a mano.
 *
 * Este fichero no navega: solo declara. `IntegraNavHost.kt` es propiedad de otro
 * turno y este paquete no lo toca.
 *
 * Cableado esperado (dentro del `NavHost` de INTEGRA):
 *
 * ```
 * composable(IntegraVideoRoutes.WALL) {
 *     IntegraVideoWallScreen(
 *         onOpenCamera = { id ->
 *             nav.navigate(IntegraVideoRoutes.cameraDetail(id)) { launchSingleTop = true }
 *         },
 *     )
 * }
 * composable(
 *     route = IntegraVideoRoutes.CAMERA_DETAIL,
 *     arguments = listOf(navArgument(IntegraVideoRoutes.ARG_CAMERA_ID) {
 *         type = NavType.StringType
 *     }),
 * ) { backStack ->
 *     IntegraCameraDetailScreen(
 *         cameraId = backStack.arguments
 *             ?.getString(IntegraVideoRoutes.ARG_CAMERA_ID).orEmpty(),
 *     )
 * }
 * ```
 */
object IntegraVideoRoutes {

    const val ARG_CAMERA_ID = "cameraId"

    /** Rejilla de cámaras. */
    const val WALL = "integra/video"

    /** Detalle de una cámara. */
    const val CAMERA_DETAIL = "integra/video/{$ARG_CAMERA_ID}"

    /**
     * Un `cameraIndexCode` de Hikvision es alfanumérico con guiones, pero puede
     * traer caracteres que rompan la ruta. Se codifica para que un id raro no
     * mande la navegación a ninguna parte.
     */
    fun cameraDetail(cameraId: String): String =
        "integra/video/" + java.net.URLEncoder.encode(cameraId, "UTF-8").replace("+", "%20")

    /** Clave de módulo que hay que dar de alta para que la pantalla sea visible. */
    const val MODULE_KEY = "integra-video"

    /** Título de la barra superior para la rejilla. */
    const val TITLE_WALL = "Cámaras"

    /** Título de la barra superior para el detalle. */
    const val TITLE_DETAIL = "Cámara"
}
