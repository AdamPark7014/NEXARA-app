package mx.nexara.mobile.nativeapp.ui.console.vehiculos

import java.util.Locale
import kotlin.math.round

/**
 * Reglas de «Cargar gasolina» y del regreso con foto del tablero — Kotlin puro, sin Android, igual
 * que `apps/web/lib/vehiculos-ficha.ts` (`aNumero`, `rendimientoDeEstaCarga`).
 *
 * La lectura de la foto es ayuda: llena lo que la persona no ha escrito y nunca pisa lo que sí
 * escribió. Si falla, los campos se quedan como estaban y se captura a mano.
 */
object GasolinaRules {

    /** Lo que mide el rendimiento de una carga anterior. */
    data class CargaPrevia(val odometro: Int, val litros: Double, val tanqueLleno: Boolean)

    data class Rendimiento(val km: Int, val litros: Double, val kmPorLitro: Double)

    // ── Lo que se teclea ────────────────────────────────────────────────────

    /** «Número» de un campo de texto: vacío o basura es null, no cero. Acepta `$` y comas de miles. */
    fun aNumero(texto: String?): Double? {
        val limpio = texto.orEmpty().filterNot { it == '$' || it == ',' || it.isWhitespace() }
        if (limpio.isEmpty()) return null
        return limpio.toDoubleOrNull()?.takeIf { it.isFinite() }
    }

    fun soloDigitos(texto: String, maximo: Int = 7): String = texto.filter(Char::isDigit).take(maximo)

    /** Dígitos y a lo sumo un punto: es lo que se guarda; las comas solo se pintan. */
    fun soloDecimal(texto: String, maximo: Int = 9): String {
        val salida = StringBuilder()
        var hayPunto = false
        for (c in texto) {
            when {
                c.isDigit() -> salida.append(c)
                c == '.' && !hayPunto -> {
                    hayPunto = true
                    salida.append(c)
                }
            }
        }
        return salida.toString().take(maximo)
    }

    /** `52.0` → «52» y `52.3` → «52.3»: el texto que se pone en el campo, sin ceros de más. */
    fun textoCrudo(valor: Double): String {
        val redondeado = round(valor * 100) / 100
        return if (redondeado == round(redondeado)) redondeado.toLong().toString() else redondeado.toString()
    }

    // ── La lectura no pisa ──────────────────────────────────────────────────

    /**
     * Lo que queda en un campo tras leer una foto. Lo escrito por la persona se respeta; si lo borró,
     * cuenta como vacío. Lo que llenó una lectura anterior sí se reemplaza: por eso se repite la foto.
     */
    fun tras(lectura: String?, actual: String, escrito: Boolean): String = when {
        lectura.isNullOrBlank() -> actual
        escrito && actual.isNotBlank() -> actual
        else -> lectura
    }

    // ── Rendimiento ─────────────────────────────────────────────────────────

    /**
     * Lo que mediría esta carga si llena el tanque: km desde el último lleno, entre los litros de lo
     * que se cargó desde entonces. Sin un lleno anterior no se puede medir.
     */
    fun rendimientoDeEstaCarga(cargas: List<CargaPrevia>, odometro: Int, litros: Double): Rendimiento? {
        val previas = cargas.filter { it.odometro < odometro }.sortedByDescending { it.odometro }
        var total = litros
        for (c in previas) {
            if (c.tanqueLleno) {
                val recorridos = odometro - c.odometro
                val rendimiento = recorridos / total
                if (rendimiento < 2 || rendimiento > 40) return null
                return Rendimiento(
                    km = recorridos,
                    litros = round(total * 100) / 100,
                    kmPorLitro = round(rendimiento * 100) / 100,
                )
            }
            total += c.litros
        }
        return null
    }

    /** El km final no puede ser menor que el de salida: sin dato o con error, no hay viaje que mostrar. */
    fun kmDelViaje(inicio: Int?, final: Int?): Int? =
        if (inicio == null || final == null || final < inicio) null else final - inicio

    // ── Textos ──────────────────────────────────────────────────────────────

    private fun numeroMx(valor: Double, decimales: Int): String =
        String.format(Locale.US, "%,.${decimales}f", valor)

    /** 12480 → «12,480». */
    fun miles(valor: Int): String = numeroMx(valor.toDouble(), 0)

    fun km(valor: Int): String = "${miles(valor)} km"

    /** «8.6 km por litro». */
    fun tituloRendimiento(r: Rendimiento): String = "${numeroMx(r.kmPorLitro, 1)} km por litro"

    /** «450 km desde el tanque anterior, entre 52.3 litros.» */
    fun detalleRendimiento(r: Rendimiento): String =
        "${km(r.km)} desde el tanque anterior, entre ${textoCrudo(r.litros)} litros."

    /** Lo que se ve en el campo Gasolina; el valor que viaja sigue siendo `E`, `1/4`… */
    fun textoNivel(nivel: String?): String = when (nivel) {
        "E" -> "Vacío"
        "1/4" -> "1/4 de tanque"
        "1/2" -> "1/2 tanque"
        "3/4" -> "3/4 de tanque"
        "F" -> "Lleno"
        else -> ""
    }

    /**
     * «Nissan Frontier · Instalación de cámaras» y debajo el proyecto. Sin actividad (salida directa
     * de inventario, o una API sin desplegar), el nombre y las placas.
     */
    fun encabezadoRegreso(nombre: String?, placas: String?, actividad: String?, proyecto: String?): List<String> {
        val vehiculo = nombre?.takeIf { it.isNotBlank() } ?: "Vehículo"
        val trabajo = actividad?.takeIf { it.isNotBlank() }
        val primera = listOfNotNull(vehiculo, trabajo ?: placas?.takeIf { it.isNotBlank() }).joinToString(" · ")
        return listOfNotNull(primera, proyecto?.takeIf { trabajo != null && it.isNotBlank() })
    }

    // ── Formulario de la carga ──────────────────────────────────────────────

    /** Texto crudo de cada campo y si lo escribió la persona; la pantalla pinta las comas. */
    data class FormCarga(
        val litros: String = "",
        val litrosEscritos: Boolean = false,
        val total: String = "",
        val totalEscrito: Boolean = false,
        val odometro: String = "",
        val odometroEscrito: Boolean = false,
        val lleno: Boolean = true,
    ) {
        val tieneDatos: Boolean
            get() = litros.isNotBlank() || total.isNotBlank() || odometro.isNotBlank()
    }

    /**
     * Quien no ve costos no ve importes: si el total ya salió del ticket, viaja sin enseñarse. Solo se
     * le pide cuando no se pudo leer, porque el servidor lo exige y lo copia de su propio ticket.
     */
    fun totalLeidoOculto(veCostos: Boolean, form: FormCarga): Boolean =
        !veCostos && !form.totalEscrito && form.total.isNotBlank()

    /**
     * Aplica lo leído del ticket. Con [revisar] sin permiso de costos el total se descarta: la persona
     * no podría revisarlo, así que escribe el del papel.
     */
    fun conTicket(
        form: FormCarga,
        litros: Double?,
        total: Double?,
        revisar: Boolean,
        veCostos: Boolean,
    ): FormCarga {
        val aCiegas = revisar && !veCostos
        return form.copy(
            litros = tras(litros?.let(::textoCrudo), form.litros, form.litrosEscritos),
            total = when {
                aCiegas && !form.totalEscrito -> ""
                aCiegas -> form.total
                else -> tras(total?.let(::textoCrudo), form.total, form.totalEscrito)
            },
        )
    }

    fun conTablero(form: FormCarga, odometroKm: Int?): FormCarga =
        form.copy(odometro = tras(odometroKm?.toString(), form.odometro, form.odometroEscrito))

    /** El aviso tras leer el ticket; `null` si salió bien. */
    fun avisoTicket(legible: Boolean, revisar: Boolean, veCostos: Boolean): String? = when {
        !legible -> "No se pudo leer el ticket: escribe los datos."
        revisar && veCostos -> "Los litros por el precio no dan el total: revisa las cifras."
        revisar -> "Los litros no cuadran con el ticket: revísalos y escribe el total."
        else -> null
    }

    const val AVISO_TABLERO = "No se pudo leer el odómetro: escríbelo."

    /** Lo que falta para guardar; `null` si se puede enviar. Mismo texto que la web. */
    fun faltaEnCarga(form: FormCarga): String? {
        val litros = aNumero(form.litros)
        val total = aNumero(form.total)
        val odometro = aNumero(form.odometro)
        return if (odometro == null || litros == null || litros <= 0 || total == null || total <= 0) {
            "Faltan el odómetro, los litros o el importe"
        } else {
            null
        }
    }

    fun rendimientoDelForm(form: FormCarga, cargas: List<CargaPrevia>): Rendimiento? {
        if (!form.lleno) return null
        val litros = aNumero(form.litros)?.takeIf { it > 0 } ?: return null
        val odometro = aNumero(form.odometro)?.toInt() ?: return null
        return rendimientoDeEstaCarga(cargas, odometro, litros)
    }
}
