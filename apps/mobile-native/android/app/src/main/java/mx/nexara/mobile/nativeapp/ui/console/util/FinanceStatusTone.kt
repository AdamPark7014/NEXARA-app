package mx.nexara.mobile.nativeapp.ui.console.util

import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone

fun financeStatusTone(status: String?): NxTone {
    val s = (status ?: "").lowercase()
    return when {
        s.contains("pagad") || s.contains("paid") || s.contains("aprob") ||
            s.contains("approved") || s.contains("complet") || s.contains("posted") -> NxTone.Success
        s.contains("pendiente") || s.contains("pending") || s.contains("parcial") ||
            s.contains("open") || s.contains("borrador") || s.contains("draft") -> NxTone.Warning
        s.contains("cancel") || s.contains("rechaz") || s.contains("reject") ||
            s.contains("vencid") || s.contains("overdue") -> NxTone.Danger
        else -> NxTone.Info
    }
}
