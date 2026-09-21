package mx.nexara.mobile.nativeapp.ui.console.viaticos

import kotlin.math.abs

/**
 * El cuadre del reparto de un viático, en centavos enteros.
 *
 * Espejo exacto de `apps/api/src/viaticos/viatico-reparto.ts`. La regla que lo
 * sostiene todo: **la suma de las partes es exactamente el total del viático**.
 * Ni más (el costo se duplica en el P&L por proyecto) ni menos (se pierde).
 *
 * Se cuenta en centavos enteros —nunca en `Double`— por el mismo motivo que el
 * servidor: en coma flotante `0.1 + 0.2 != 0.3`, y un reparto legítimo de $0.10
 * y $0.20 sobre un viático de $0.30 sería rechazado sin que nadie entienda por
 * qué. El teclado entrega texto, el texto se vuelve centavos con aritmética
 * entera, y solo al armar la petición se divide entre 100.
 *
 * Este fichero es puro a propósito: sin Android, sin Compose, sin red. Así el
 * cuadre se prueba solo en la JVM (`RepartoViaticoTest`) y la pantalla se limita
 * a enseñar lo que aquí se decide.
 */

/** Una parte del reparto: qué actividad carga cuánto. */
data class ParteReparto(
    val actividadId: Long,
    val centavos: Long,
    val nota: String? = null,
)

/**
 * En qué estado está el reparto que se está capturando.
 *
 * [Falta] y [Sobra] llevan la diferencia para que la pantalla la enseñe en vivo
 * y ofrezca repartirla, en vez de esperar al 400 del servidor.
 */
sealed interface CuadreReparto {
    /** Sin partes: el viático sigue siendo de una sola actividad. Es válido. */
    data object SinReparto : CuadreReparto

    data object Cuadra : CuadreReparto

    /** Faltan [centavos] por repartir. Siempre positivo. */
    data class Falta(val centavos: Long) : CuadreReparto

    /** Sobran [centavos] repartidos de más. Siempre positivo. */
    data class Sobra(val centavos: Long) : CuadreReparto

    /** La misma actividad aparece en dos partes. */
    data class Duplicada(val actividadId: Long) : CuadreReparto

    /** Una parte sin importe (o en cero/negativo): o carga algo, o se quita. */
    data class ParteSinImporte(val actividadId: Long) : CuadreReparto

    /** El viático no trae monto válido: no hay nada que repartir. */
    data object SinTotal : CuadreReparto

    val puedeGuardarse: Boolean get() = this is Cuadra || this is SinReparto
}

object RepartoViatico {

    /** Tope del servidor (`@ArrayMaxSize(50)` en `SetViaticoRepartoDto`). */
    const val MAX_PARTES = 50

    /**
     * Revisa el reparto contra el total. Mismo orden de comprobaciones que el
     * servidor, para que la app nunca acepte algo que allá vaya a rebotar.
     */
    fun revisar(partes: List<ParteReparto>, totalCentavos: Long): CuadreReparto {
        if (partes.isEmpty()) return CuadreReparto.SinReparto
        if (totalCentavos <= 0L) return CuadreReparto.SinTotal

        val vistas = HashSet<Long>(partes.size)
        for (parte in partes) {
            if (!vistas.add(parte.actividadId)) return CuadreReparto.Duplicada(parte.actividadId)
            if (parte.centavos <= 0L) return CuadreReparto.ParteSinImporte(parte.actividadId)
        }

        val diferencia = totalCentavos - partes.sumOf { it.centavos }
        return when {
            diferencia == 0L -> CuadreReparto.Cuadra
            diferencia > 0L -> CuadreReparto.Falta(diferencia)
            else -> CuadreReparto.Sobra(-diferencia)
        }
    }

    /**
     * El aviso que va debajo de los campos mientras se captura. `null` cuando no
     * hay nada que corregir: la pantalla enseña entonces el «cuadra» en verde.
     */
    fun mensaje(cuadre: CuadreReparto): String? = when (cuadre) {
        CuadreReparto.Cuadra, CuadreReparto.SinReparto -> null
        CuadreReparto.SinTotal ->
            "Este viático no tiene monto, así que no hay nada que repartir."
        is CuadreReparto.Falta ->
            "Faltan ${Dinero.pesos(cuadre.centavos)} por repartir."
        is CuadreReparto.Sobra ->
            "Sobran ${Dinero.pesos(cuadre.centavos)}: baja alguna parte."
        is CuadreReparto.Duplicada ->
            "Esa actividad ya está en el reparto. Junta las dos partes en una sola."
        is CuadreReparto.ParteSinImporte ->
            "Hay una actividad sin importe. Captura cuánto carga o quítala del reparto."
    }

    /**
     * Reparte [totalCentavos] entre [cuantas] partes iguales.
     *
     * Los centavos que no caen parejos se suman uno a uno a las primeras partes,
     * así que el resultado **siempre** suma el total exacto: 10.00 entre 3 da
     * 3.34 + 3.33 + 3.33, no tres veces 3.33 con un centavo perdido.
     */
    fun repartirEnPartesIguales(totalCentavos: Long, cuantas: Int): List<Long> {
        if (cuantas <= 0 || totalCentavos <= 0L) return emptyList()
        val base = totalCentavos / cuantas
        val sobrantes = totalCentavos % cuantas
        return List(cuantas) { i -> base + if (i < sobrantes) 1L else 0L }
    }

    /**
     * «Repartir el resto»: acomoda la diferencia sin tocar lo que la persona ya
     * escribió a propósito.
     *
     * - Si faltan centavos, se suman a las partes que siguen vacías; si están
     *   todas capturadas, al resto entre todas (los sobrantes, a las primeras).
     * - Si sobran, se bajan de las partes capturadas de mayor a menor, sin dejar
     *   ninguna en cero: bajar a cero sería borrar una actividad a escondidas.
     *
     * Devuelve la lista con los mismos ids y en el mismo orden. Si no se puede
     * cuadrar sin violar lo anterior, devuelve lo que logró: la pantalla vuelve
     * a enseñar lo que falta y la persona decide.
     */
    fun cuadrarResto(partes: List<ParteReparto>, totalCentavos: Long): List<ParteReparto> {
        if (partes.isEmpty() || totalCentavos <= 0L) return partes
        val diferencia = totalCentavos - partes.sumOf { it.centavos }
        if (diferencia == 0L) return partes

        val montos = partes.map { it.centavos }.toMutableList()

        if (diferencia > 0L) {
            val vacias = montos.indices.filter { montos[it] <= 0L }
            val destinos = vacias.ifEmpty { montos.indices.toList() }
            val trozos = repartirEnPartesIguales(diferencia, destinos.size)
            destinos.forEachIndexed { i, idx -> montos[idx] = montos[idx] + trozos[i] }
        } else {
            // De mayor a menor: quien más carga es quien mejor absorbe el ajuste.
            var porBajar = -diferencia
            val orden = montos.indices.sortedByDescending { montos[it] }
            for (idx in orden) {
                if (porBajar <= 0L) break
                // Nunca a cero: una parte en cero es una actividad que dejó de
                // cargar sin que nadie lo decidiera.
                val disponible = montos[idx] - 1L
                if (disponible <= 0L) continue
                val baja = minOf(disponible, porBajar)
                montos[idx] = montos[idx] - baja
                porBajar -= baja
            }
        }

        return partes.mapIndexed { i, parte -> parte.copy(centavos = montos[i]) }
    }
}

/**
 * Importes como se leen y se escriben en el teléfono.
 *
 * Todo entra y sale en centavos enteros. `Double` solo aparece en el último
 * paso, al serializar la petición: el servidor recibe el importe con dos
 * decimales y vuelve a redondearlo a centavos, así que el viaje es exacto.
 */
object Dinero {

    /** Lo máximo que se admite teclear: $99,999,999.99. Evita desbordes y dedazos. */
    const val MAX_CENTAVOS = 9_999_999_999L

    /**
     * Texto tecleado → centavos. `null` si no es un importe válido.
     *
     * Admite lo que la gente escribe de verdad: `1,234.56`, `$1234.5`, `1234`,
     * y la coma decimal del teclado latino (`1234,56`) cuando no hay punto.
     * Rechaza más de dos decimales: el servidor no los acepta
     * (`@IsNumber({ maxDecimalPlaces: 2 })`).
     */
    fun parsearCentavos(texto: String): Long? {
        var limpio = texto.trim().removePrefix("$").trim()
        if (limpio.isEmpty()) return null
        // Coma decimal solo si no hay punto: en "1,234.56" la coma es de millares.
        limpio = if (limpio.contains('.')) limpio.replace(",", "") else limpio.replace(',', '.')
        if (!limpio.matches(IMPORTE)) return null

        val punto = limpio.indexOf('.')
        val enteros = if (punto < 0) limpio else limpio.substring(0, punto)
        val decimales = if (punto < 0) "" else limpio.substring(punto + 1)
        if (decimales.length > 2) return null

        val pesos = enteros.ifEmpty { "0" }.toLongOrNull() ?: return null
        val centavos = decimales.padEnd(2, '0').ifEmpty { "0" }.toLongOrNull() ?: return null
        if (pesos > MAX_CENTAVOS / 100) return null
        return pesos * 100L + centavos
    }

    /** `123456` → `"1,234.56"`. Sin símbolo: va dentro de un campo de importe. */
    fun formatear(centavos: Long): String {
        val signo = if (centavos < 0L) "-" else ""
        val abs = abs(centavos)
        val enteros = (abs / 100L).toString()
        val decimales = (abs % 100L).toString().padStart(2, '0')
        return "$signo${agruparMillares(enteros)}.$decimales"
    }

    /** `123456` → `"$1,234.56"`. Para leer, no para teclear. */
    fun pesos(centavos: Long): String = "$" + formatear(centavos)

    /**
     * Importe del servidor → centavos.
     *
     * El API manda `Decimal` de Prisma como número JSON, así que aquí ya viaja
     * como `Double`; se redondea igual que `aCentavos` del servidor
     * (`Math.round(n * 100)`) para que los dos lados cuenten lo mismo.
     */
    fun deApi(monto: Double?): Long = when {
        monto == null || !monto.isFinite() -> 0L
        else -> Math.round(monto * 100.0)
    }

    /**
     * Centavos → el número que viaja en la petición.
     *
     * `c / 100.0` es el `Double` más cercano al decimal exacto; el error queda
     * ~15 órdenes de magnitud por debajo de medio centavo, así que el
     * `Math.round(n * 100)` del servidor recupera exactamente [centavos].
     */
    fun aApi(centavos: Long): Double = centavos / 100.0

    /** Solo dígitos y a lo sumo un punto: lo que el campo de importe deja escribir. */
    fun sanitizarEntrada(texto: String): String {
        val filtrado = buildString {
            var puntoUsado = false
            for (c in texto) {
                when {
                    c.isDigit() -> append(c)
                    (c == '.' || c == ',') && !puntoUsado && isNotEmpty() -> {
                        puntoUsado = true
                        append('.')
                    }
                }
            }
        }
        val punto = filtrado.indexOf('.')
        if (punto < 0) return filtrado.take(MAX_ENTEROS)
        val enteros = filtrado.substring(0, punto).take(MAX_ENTEROS)
        val decimales = filtrado.substring(punto + 1).take(2)
        return "$enteros.$decimales"
    }

    /** `"1234567"` → `"1,234,567"`. */
    fun agruparMillares(enteros: String): String {
        if (enteros.length <= 3) return enteros
        return buildString {
            enteros.forEachIndexed { i, c ->
                if (i > 0 && (enteros.length - i) % 3 == 0) append(',')
                append(c)
            }
        }
    }

    /** Dígitos enteros que caben antes del punto (99,999,999). */
    private const val MAX_ENTEROS = 8

    private val IMPORTE = Regex("""^\d*(\.\d*)?$""")
}
