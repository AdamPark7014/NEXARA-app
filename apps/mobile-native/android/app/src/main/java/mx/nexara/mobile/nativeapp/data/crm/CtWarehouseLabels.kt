package mx.nexara.mobile.nativeapp.data.crm

import mx.nexara.mobile.nativeapp.data.api.StockByWarehouseDto

private val CATALOG_CODE_LABELS = mapOf(
    "PUE" to "Puebla",
    "MTY" to "Monterrey",
    "GDL" to "Guadalajara",
    "CDMX" to "CDMX",
    "DFA" to "CDMX",
    "TPC" to "Toluca",
    "HMO" to "Hermosillo",
    "CHI" to "Chihuahua",
    "LEO" to "León",
    "14A" to "Puebla",
    "35A" to "Monterrey",
    "46A" to "Guadalajara",
    "13A" to "CDMX",
    "01A" to "Hermosillo",
    "03A" to "Chihuahua",
    "07A" to "León",
)

fun warehouseLabel(code: String): String {
    val key = code.trim().uppercase()
    return CATALOG_CODE_LABELS[key] ?: key.ifBlank { "—" }
}

fun warehouseRowLabel(row: StockByWarehouseDto): String {
    return row.label?.takeIf { it.isNotBlank() } ?: warehouseLabel(row.code)
}

/** Códigos de catálogo que corresponden a una ciudad (Puebla, Monterrey, …). */
fun codesForCity(city: String): List<String> {
    val c = city.lowercase()
    return when {
        "puebla" in c -> listOf("PUE", "14A")
        "monterrey" in c -> listOf("MTY", "35A")
        "guadalajara" in c -> listOf("GDL", "46A")
        "cdmx" in c || "mexico" in c -> listOf("CDMX", "DFA", "13A")
        "hermosillo" in c -> listOf("HMO", "01A")
        else -> emptyList()
    }
}

fun stockAtPreferred(rows: List<StockByWarehouseDto>?, preferredCodes: List<String>): Int {
    if (rows.isNullOrEmpty() || preferredCodes.isEmpty()) return 0
    val set = preferredCodes.map { it.uppercase() }.toSet()
    return rows.sumOf { if (set.contains(it.code.uppercase())) it.qty else 0 }
}

fun sortedWarehouseRows(
    rows: List<StockByWarehouseDto>?,
    preferredCodes: List<String> = emptyList(),
    max: Int = 5,
): List<StockByWarehouseDto> {
    if (rows.isNullOrEmpty()) return emptyList()
    val pref = preferredCodes.map { it.uppercase() }.toSet()
    return rows
        .filter { it.qty > 0 }
        .sortedWith(
            compareByDescending<StockByWarehouseDto> { pref.contains(it.code.uppercase()) }
                .thenByDescending { it.qty },
        )
        .take(max)
}

fun formatStockByWarehouse(
    rows: List<StockByWarehouseDto>?,
    max: Int = 4,
    preferredCodes: List<String> = emptyList(),
): String {
    return sortedWarehouseRows(rows, preferredCodes, max)
        .joinToString(" · ") { "${warehouseRowLabel(it)} ${it.qty}" }
}

fun formatLeadTimeDays(days: Int): String = when {
    days <= 0 -> ""
    days <= 1 -> "Inmediata"
    else -> "$days días"
}

fun hasPromotion(promociones: List<Map<String, Any?>>?): Boolean = !promociones.isNullOrEmpty()

fun badgeLabelEs(badge: String): String = when (badge.uppercase()) {
    "RECOMMENDED" -> "Top"
    "BEST_PRICE" -> "Mejor precio"
    "BEST_STOCK" -> "Más stock"
    "FASTEST" -> "Más rápido"
    "BEST_MARGIN" -> "Mejor margen"
    "SUBSTITUTE" -> "Sustituto"
    else -> badge
}
