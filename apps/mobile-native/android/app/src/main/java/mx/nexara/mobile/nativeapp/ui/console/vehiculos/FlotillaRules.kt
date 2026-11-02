package mx.nexara.mobile.nativeapp.ui.console.vehiculos

import java.util.Locale
import mx.nexara.mobile.nativeapp.access.PlatformAccounts
import mx.nexara.mobile.nativeapp.access.RoleKeys
import mx.nexara.mobile.nativeapp.data.api.ProximoServicioDto
import mx.nexara.mobile.nativeapp.data.api.RepartoMesDto
import mx.nexara.mobile.nativeapp.data.api.VehiculoFlotaDto

/**
 * Reglas de la vista de dirección de Vehículos — Kotlin puro. Espejo de `apps/web/lib/vehiculos-ficha.ts`
 * (`repartoDelMes`, `textoServicio`, `fechaCorta`).
 *
 * El CEO no pide vehículos: en vez de «Solicitar» y «Salida» ve quién trae cada uno y lo que cuesta.
 */
object FlotillaRules {

    fun esDireccion(
        email: String?,
        roleKey: String?,
        orgRoleKey: String?,
        role: String?,
        isSuperAdmin: Boolean,
    ): Boolean =
        isSuperAdmin ||
            PlatformAccounts.isCeoEquivalentEmail(email) ||
            RoleKeys.canonicalRoleKey(roleKey, orgRoleKey, role) == RoleKeys.CEO

    // ── Mes ─────────────────────────────────────────────────────────────────

    private val MESES = listOf(
        "enero", "febrero", "marzo", "abril", "mayo", "junio",
        "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
    )
    private val MESES_CORTOS = listOf("ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic")

    private fun partes(mes: String): Pair<Int, Int>? {
        val m = Regex("""^(\d{4})-(\d{2})$""").find(mes) ?: return null
        val numero = m.groupValues[2].toInt()
        return if (numero in 1..12) m.groupValues[1].toInt() to numero else null
    }

    /** `2026-11` → «Noviembre 2026». */
    fun nombreMes(mes: String): String {
        val (anio, numero) = partes(mes) ?: return mes
        return "${MESES[numero - 1].replaceFirstChar { it.uppercase() }} $anio"
    }

    fun mesAnterior(mes: String): String {
        val (anio, numero) = partes(mes) ?: return mes
        return if (numero == 1) "%04d-12".format(anio - 1) else "%04d-%02d".format(anio, numero - 1)
    }

    fun mesSiguiente(mes: String): String {
        val (anio, numero) = partes(mes) ?: return mes
        return if (numero == 12) "%04d-01".format(anio + 1) else "%04d-%02d".format(anio, numero + 1)
    }

    // ── Textos ──────────────────────────────────────────────────────────────

    private fun numero(valor: Double, decimales: Int): String =
        String.format(Locale.US, "%,.${decimales}f", valor)

    /** Sin dato es «—», no cero. */
    fun pesos(valor: Double?): String = if (valor == null) "—" else "$${numero(valor, 0)}"

    fun pesos2(valor: Double?): String = if (valor == null) "—" else "$${numero(valor, 2)}"

    fun km(valor: Double?): String = if (valor == null) "—" else "${numero(valor, 0)} km"

    fun kmPorLitro(valor: Double?): String = if (valor == null) "—" else "${numero(valor, 1)} km/L"

    fun litros(valor: Double?): String = if (valor == null) "—" else "${GasolinaRules.textoCrudo(valor)} L"

    /** `2026-10-28…` → «28 oct». No pasa por fecha: un día sin hora se correría en México. */
    fun fechaCorta(iso: String?): String {
        val m = Regex("""^(\d{4})-(\d{2})-(\d{2})""").find(iso.orEmpty()) ?: return "—"
        val mes = m.groupValues[2].toInt()
        if (mes !in 1..12) return "—"
        return "${m.groupValues[3].toInt()} ${MESES_CORTOS[mes - 1]}"
    }

    /** «En 7,540 km», «Vencido por 320 km» o la fecha, si solo va por tiempo. */
    fun textoServicio(p: ProximoServicioDto?): String {
        if (p == null) return "Sin programa"
        val faltan = p.faltanKm
        if (faltan != null) {
            return if (faltan < 0) "Vencido por ${km(-faltan)}" else "En ${km(faltan)}"
        }
        if (p.fecha != null) return "${if (p.estado == "VENCIDO") "Venció" else "El"} ${fechaCorta(p.fecha)}"
        return "Sin programa"
    }

    /** «Nissan Frontier · TXA-12-34». */
    fun nombre(v: VehiculoFlotaDto): String =
        listOfNotNull(v.nombre?.takeIf { it.isNotBlank() }, v.placas?.takeIf { it.isNotBlank() })
            .joinToString(" · ")
            .ifBlank { "Vehículo" }

    /** Quién lo trae, y si no, en qué está. */
    fun quienLoTrae(v: VehiculoFlotaDto): String {
        val conductor = v.conductor?.nombre?.takeIf { it.isNotBlank() }
        return when {
            conductor != null -> "Lo trae $conductor"
            v.disponible == true -> "Libre"
            else -> v.estatus?.takeIf { it.isNotBlank() } ?: "Sin asignar"
        }
    }

    // ── A dónde se fue el dinero ────────────────────────────────────────────

    data class RenglonGasto(
        val nombre: String,
        val nota: String,
        val km: Double?,
        val importe: Double,
        val pct: Int,
    )

    /** Lo que vale cero no se pinta. */
    fun repartoDelMes(r: RepartoMesDto?): List<RenglonGasto> {
        if (r == null) return emptyList()
        val crudos = listOf(
            Triple("A proyectos", "Costo directo del proyecto", r.proyectos),
            Triple("A cotizaciones sin proyecto", "Pasa al proyecto si se gana; si no, es costo de venta", r.cotizaciones),
            Triple("Oficina", "Trámites y compras: indirecto", r.oficina),
            Triple("Sin ligar", "Falta decir a qué trabajo fue", r.sinLigar),
        ).map { (nombre, nota, renglon) -> RenglonGasto(nombre, nota, renglon?.km, renglon?.importe ?: 0.0, 0) } +
            RenglonGasto("Parado", "Seguro y dinero invertido aunque no salga: indirecto", null, r.parado ?: 0.0, 0)
        val total = crudos.sumOf { it.importe }
        if (total <= 0) return emptyList()
        return crudos
            .filter { it.importe > 0 }
            .map { it.copy(pct = Math.round(it.importe / total * 100).toInt()) }
    }
}
