package mx.nexara.mobile.nativeapp.ui.integra.governance

import mx.nexara.mobile.nativeapp.data.api.NotificationRowDto

/**
 * Triaje del centro de notificaciones.
 *
 * Espejo de `apps/web/app/(panels)/erp/notifications-center/page.tsx` — que es
 * a donde redirige `/integra/notifications-center`, así que el contrato de
 * paridad es ese y no otro.
 *
 * La regla que da sentido a la pantalla: **prioriza, no acumula**. Una lista
 * cronológica de 80 avisos no ayuda a nadie; lo que se necesita saber al abrir
 * la app es qué hay que atender ahora.
 */

enum class BucketNotif(val clave: String, val etiqueta: String) {
    TODAS("all", "Todas"),
    /** ACS, puertas, alarmas, seguridad: lo propio de este panel. */
    INTEGRA("integra", "INTEGRA"),
    OPS("ops", "Ops / SLA"),
    SALES("sales", "CRM / Cotiz."),
    ERP("erp", "ERP / OC"),
    OTRAS("other", "Otras"),
}

/** Pestañas del centro. */
enum class VistaNotificaciones(val etiqueta: String) {
    ACCION("Acción ahora"),
    BANDEJA("Bandeja"),
    SENALES("Señales INTEGRA"),
}

/**
 * Clasifica por dominio. Una categoría desconocida cae en «Otras», que es una
 * casilla legítima: el backend inventa categorías nuevas sin avisar a la app
 * (`ops-acs` y `margin-alert` aparecieron así) y la pantalla no debe romperse
 * ni esconder el aviso por no reconocerlo.
 */
fun bucketDeCategoria(category: String?): BucketNotif {
    val c = category?.trim()?.lowercase().orEmpty()
    if (c.isEmpty()) return BucketNotif.OTRAS
    if (c.contains("acs") || c.contains("integra") || c.contains("access") ||
        c.contains("door") || c.contains("visitor") || c == "security"
    ) {
        return BucketNotif.INTEGRA
    }
    if (c.contains("sla") || c == "activity" || c == "activities" || c == "noc" ||
        c == "evidence" || c == "evidences"
    ) {
        return BucketNotif.OPS
    }
    if (c.contains("quote") || c == "crm" || c == "sales" || c == "margin-alert") {
        return BucketNotif.SALES
    }
    if (c == "erp" || c.contains("purchase") || c.contains("stock") ||
        c == "finance" || c == "approval" || c == "orders" || c == "workflow"
    ) {
        return BucketNotif.ERP
    }
    return BucketNotif.OTRAS
}

private val ETIQUETA_CATEGORIA: Map<String, String> = mapOf(
    "attendance" to "Asistencia",
    "activity" to "OT",
    "activities" to "OT",
    "tool" to "Herramientas",
    "tools" to "Herramientas",
    "finance" to "Finanzas",
    "noc" to "NOC",
    "crm" to "CRM",
    "approval" to "Aprobación",
    "workflow" to "Aprobación",
    "evidence" to "Evidencias",
    "evidences" to "Evidencias",
    "sales" to "Ventas",
    "quotes" to "Cotizaciones",
    "sla-alert" to "SLA",
    "sla-breach" to "SLA",
    "erp" to "ERP",
    "confirmations" to "Confirmación",
    "tickets" to "Tickets",
    "viatics" to "Viáticos",
    "vehicles" to "Vehículos",
    "stock-alert" to "Inventario",
    "margin-alert" to "Margen",
    "security" to "Seguridad",
    "ops-acs" to "Accesos",
    "lunch_break" to "Comida",
    "lunch_breaks" to "Comida",
    "profile" to "Perfil",
    "orders" to "Órdenes",
    "fines" to "Multas",
    "chat" to "Chat",
    "asc" to "ACS",
)

/** El código crudo si no está catalogada: mejor eso que un hueco. */
fun etiquetaCategoria(category: String?): String {
    val c = category?.trim().orEmpty()
    if (c.isEmpty()) return "Sin categoría"
    return ETIQUETA_CATEGORIA[c.lowercase()] ?: c
}

/**
 * Lo que hay que atender ahora: sin leer y con peso operativo.
 * Una notificación ya leída nunca es accionable, por prioritaria que fuera.
 */
fun esAccionable(n: NotificationRowDto): Boolean {
    if (n.isRead == true) return false
    if (n.priority?.trim()?.lowercase() == "high") return true
    return when (bucketDeCategoria(n.category)) {
        BucketNotif.INTEGRA, BucketNotif.OPS, BucketNotif.SALES, BucketNotif.ERP -> true
        else -> false
    }
}

fun esAltaPrioridad(n: NotificationRowDto): Boolean =
    n.isRead != true && n.priority?.trim()?.lowercase() == "high"

/**
 * Orden del triaje: primero lo urgente, luego lo no leído, al final lo leído; y
 * dentro de cada grupo, lo más reciente arriba. Una fecha ilegible no manda la
 * fila al fondo en silencio: se ordena como la más antigua pero se sigue viendo.
 */
fun ordenarParaTriaje(items: List<NotificationRowDto>): List<NotificationRowDto> =
    items.sortedWith(
        compareBy<NotificationRowDto> { n ->
            when {
                esAltaPrioridad(n) -> 0
                n.isRead != true -> 1
                else -> 2
            }
        }.thenByDescending { instanteDeIso(it.createdAt) ?: Long.MIN_VALUE },
    )

/** Lo que se pinta según pestaña y filtro de dominio. */
fun filtrarNotificaciones(
    items: List<NotificationRowDto>,
    vista: VistaNotificaciones,
    bucket: BucketNotif,
): List<NotificationRowDto> {
    val base = when {
        vista == VistaNotificaciones.ACCION -> items.filter { esAccionable(it) }
        bucket == BucketNotif.TODAS -> items
        else -> items.filter { bucketDeCategoria(it.category) == bucket }
    }
    return ordenarParaTriaje(base)
}

/** Antigüedad para la fila; si la fecha no se puede leer se dice, no se oculta. */
fun antiguedadNotificacion(iso: String?, ahoraMs: Long = System.currentTimeMillis()): String {
    val corto = haceCuanto(iso, ahoraMs)
    if (corto.isNotBlank()) return corto
    return formatearFechaAbsoluta(iso)
}
