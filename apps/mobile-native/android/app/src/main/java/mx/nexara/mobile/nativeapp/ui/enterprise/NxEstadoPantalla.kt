package mx.nexara.mobile.nativeapp.ui.enterprise

/**
 * En qué estado está una pantalla de lista. Son cuatro y **se excluyen**: nunca
 * se pinta el esqueleto de carga encima de un estado vacío, ni un «no hay nada»
 * cuando lo que pasó es que la petición falló.
 *
 * Pasaba justo eso: la pantalla dibujaba el error, el «cargando» y el «sin
 * registros» uno debajo de otro y el técnico no sabía si esperar, reintentar o
 * llamar a su encargado. Al ser una función pura se puede probar en la JVM
 * (`NxEstadoPantallaTest`) en vez de confiar en que cada `if` de cada pantalla
 * esté bien ordenado.
 */
enum class NxEstadoPantalla { CARGANDO, ERROR, VACIO, CONTENIDO }

/**
 * @param cargando petición en vuelo.
 * @param error mensaje del servidor, si lo hubo.
 * @param hayDatos si ya hay algo que enseñar (aunque esté recargando).
 *
 * Con datos en mano, recargar **no** borra la pantalla: se sigue viendo el
 * contenido y el refresco se anuncia con el indicador de «tirar para recargar».
 */
fun nxEstadoPantalla(cargando: Boolean, error: String?, hayDatos: Boolean): NxEstadoPantalla = when {
    hayDatos -> NxEstadoPantalla.CONTENIDO
    cargando -> NxEstadoPantalla.CARGANDO
    !error.isNullOrBlank() -> NxEstadoPantalla.ERROR
    else -> NxEstadoPantalla.VACIO
}
