package mx.nexara.mobile.nativeapp.util

/**
 * ¿La ubicación viene de una app de «GPS falso»?
 *
 * Android lo dice de dos maneras según la versión: `Location.isMock` desde
 * API 31 y `Location.isFromMockProvider` (en desuso) antes. La decisión vive
 * aquí, sin tocar Android, para poder probarla en la JVM; quien lee el
 * `Location` solo le pasa los dos valores.
 *
 * Regla: **cualquiera de las dos señales basta**. Un teléfono con la app de
 * simulación activa puede contestar `false` en la nueva y `true` en la vieja
 * (y al revés en algunos fabricantes); ante la duda, se marca como simulada y
 * el servidor decide (contrato A: 422 y aviso a sus jefes).
 */
object MockLocation {

    /** API a partir de la cual existe `Location.isMock`. */
    const val API_IS_MOCK = 31

    /**
     * @param sdkInt `Build.VERSION.SDK_INT` del teléfono.
     * @param isMock `Location.isMock` (API 31+); `null` si no se pudo leer.
     * @param isFromMockProvider `Location.isFromMockProvider`; `null` si no se pudo leer.
     */
    fun isSimulated(sdkInt: Int, isMock: Boolean?, isFromMockProvider: Boolean?): Boolean {
        if (sdkInt >= API_IS_MOCK && isMock == true) return true
        return isFromMockProvider == true
    }
}
