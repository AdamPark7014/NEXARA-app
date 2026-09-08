package mx.nexara.mobile.nativeapp.data.api

/**
 * Comunicados internos y evaluaciones de desempeño.
 *
 * Dos módulos que la consola web tenía y ninguna de las dos apps:
 *  - `internal-comunicados` (dentro de `/erp/news`, pestaña «Comunicados»),
 *  - `hr/reviews` (dentro de `/erp/hr`, pestaña «Evaluaciones»).
 *
 * Ambos parsean con `ProcParse` — el mismo lector tolerante de
 * `ProcurementDtos.kt` — porque el API entrega Prisma crudo y algunos campos
 * llegan como número, como string o anidados en una relación.
 */

/** Comunicado interno — GET /internal-comunicados */
data class InternalComunicadoDto(
    val id: Long? = null,
    val titulo: String = "",
    val cuerpo: String = "",
    val audiencia: String = "",
    val prioridad: String = "",
    val estado: String = "",
    val scheduledAt: String = "",
    val sentAt: String = "",
    val lecturas: Int = 0,
    val totalDestinatarios: Int = 0,
    val autorNombre: String = "",
    val createdAt: String = "",
) {
    val rowKey: String get() = "com-${id ?: 0}"

    val displayTitle: String get() = titulo.ifBlank { "Comunicado" }

    /** El listado no trae `cuerpo`; hay que abrir la ficha para leerlo. */
    val hasBody: Boolean get() = cuerpo.isNotBlank()

    val isDraft: Boolean get() = estado.equals("Borrador", ignoreCase = true)

    val isSent: Boolean get() = estado.equals("Enviado", ignoreCase = true)

    val isUrgent: Boolean
        get() = prioridad.equals("Urgente", ignoreCase = true) ||
            prioridad.equals("Alta", ignoreCase = true)

    /** Porcentaje de lectura; null cuando aún no hay destinatarios. */
    val readPercent: Int?
        get() = if (totalDestinatarios <= 0) null
        else (lecturas * 100 / totalDestinatarios).coerceIn(0, 100)

    companion object {
        fun fromRaw(row: Map<String, Any?>): InternalComunicadoDto {
            @Suppress("UNCHECKED_CAST")
            val autor = row["autor"] as? Map<String, Any?>
            return InternalComunicadoDto(
                id = ProcParse.lng(row["id"]),
                titulo = ProcParse.str(row["titulo"], row["title"]),
                cuerpo = ProcParse.str(row["cuerpo"], row["body"]),
                audiencia = ProcParse.str(row["audiencia"], row["audience"]),
                prioridad = ProcParse.str(row["prioridad"], row["priority"]),
                estado = ProcParse.str(row["estado"], row["status"]),
                scheduledAt = ProcParse.str(row["scheduledAt"]),
                sentAt = ProcParse.str(row["sentAt"]),
                lecturas = ProcParse.lng(row["lecturas"])?.toInt() ?: 0,
                totalDestinatarios = ProcParse.lng(row["totalDestinatarios"])?.toInt() ?: 0,
                autorNombre = ProcParse.str(autor?.get("nombre"), autor?.get("name"), row["autor"]),
                createdAt = ProcParse.str(row["createdAt"]),
            )
        }
    }
}

/** Evaluación de desempeño — GET /hr/reviews */
data class HrReviewDto(
    val id: Long? = null,
    val userId: Long? = null,
    val userName: String = "",
    val reviewerId: Long? = null,
    val reviewerName: String = "",
    val period: String = "",
    val reviewDate: String = "",
    val overallRating: Double? = null,
    val strengths: String = "",
    val areasOfImprovement: String = "",
    val goals: String = "",
    val comments: String = "",
    val status: String = "",
) {
    val rowKey: String get() = "rev-${id ?: 0}"

    val displayTitle: String
        get() = userName.ifBlank { "Evaluación" }

    /** `DRAFT` → `SUBMITTED`: la envía quien evalúa (requiere `hr.manage`). */
    val canSubmit: Boolean get() = status.uppercase() == "DRAFT"

    /**
     * `SUBMITTED` → `ACKNOWLEDGED`: el acuse lo da el evaluado. El servidor
     * rechaza acusar una que no esté enviada, así que se comprueba antes.
     */
    val canAcknowledge: Boolean get() = status.uppercase() == "SUBMITTED"

    val statusLabel: String
        get() = when (status.uppercase()) {
            "DRAFT" -> "Borrador"
            "SUBMITTED" -> "Enviada"
            "ACKNOWLEDGED" -> "Acusada"
            else -> status.ifBlank { "—" }
        }

    val periodLabel: String
        get() = when (period.uppercase()) {
            "QUARTERLY", "TRIMESTRAL" -> "Trimestral"
            "SEMIANNUAL", "SEMESTRAL" -> "Semestral"
            "ANNUAL", "ANUAL" -> "Anual"
            "MONTHLY", "MENSUAL" -> "Mensual"
            else -> period.ifBlank { "—" }
        }

    companion object {
        fun fromRaw(row: Map<String, Any?>): HrReviewDto {
            @Suppress("UNCHECKED_CAST")
            val user = row["user"] as? Map<String, Any?>
            @Suppress("UNCHECKED_CAST")
            val reviewer = row["reviewer"] as? Map<String, Any?>
            return HrReviewDto(
                id = ProcParse.lng(row["id"]),
                userId = ProcParse.lng(user?.get("id"), row["userId"]),
                userName = ProcParse.str(user?.get("nombre"), user?.get("name"), row["userName"]),
                reviewerId = ProcParse.lng(reviewer?.get("id"), row["reviewerId"]),
                reviewerName = ProcParse.str(reviewer?.get("nombre"), reviewer?.get("name")),
                period = ProcParse.str(row["period"], row["periodo"]),
                reviewDate = ProcParse.str(row["reviewDate"], row["fecha"]).take(10),
                overallRating = ProcParse.dbl(row["overallRating"], row["calificacion"]),
                strengths = ProcParse.str(row["strengths"], row["fortalezas"]),
                areasOfImprovement = ProcParse.str(row["areasOfImprovement"], row["areasMejora"]),
                goals = ProcParse.str(row["goals"], row["objetivos"]),
                comments = ProcParse.str(row["comments"], row["comentarios"]),
                status = ProcParse.str(row["status"], row["estado"]),
            )
        }
    }
}
