package mx.nexara.mobile.nativeapp.data.api

/** Requisición de compra — GET /procurement/requisitions */
data class RequisitionDto(
    val id: Long? = null,
    val reqNumber: String = "",
    val title: String = "",
    val description: String = "",
    val status: String = "",
    val requestedByName: String = "",
    val requestedById: Long? = null,
    val departmentName: String = "",
    val createdAt: String = "",
    val priority: String = "",
) {
    val rowKey: String
        get() = "req-${id ?: 0}-$reqNumber"

    val displayTitle: String
        get() = title.ifBlank { reqNumber.ifBlank { "Requisición" } }

    val canDecide: Boolean
        get() {
            val s = status.uppercase()
            return s == "PENDING" || s == "SUBMITTED"
        }

    fun toFlatMap(): Map<String, Any?> = buildMap {
        put("id", id)
        put("reqNumber", reqNumber)
        put("number", reqNumber)
        put("folio", reqNumber)
        put("title", title)
        put("description", description)
        put("status", status)
        put("estado", status)
        put("requestedBy", requestedByName)
        put("solicitante", requestedByName)
        put("requestedById", requestedById)
        put("departmentName", departmentName)
        put("createdAt", createdAt)
        put("priority", priority)
    }

    companion object {
        fun fromRaw(row: Map<String, Any?>): RequisitionDto {
            @Suppress("UNCHECKED_CAST")
            val requestedBy = row["requestedBy"] as? Map<String, Any?>
            @Suppress("UNCHECKED_CAST")
            val department = row["department"] as? Map<String, Any?>
            return RequisitionDto(
                id = ProcParse.lng(row["id"]),
                reqNumber = ProcParse.str(row["reqNumber"], row["number"], row["folio"]),
                title = ProcParse.str(row["title"], row["titulo"]),
                description = ProcParse.str(row["description"], row["descripcion"]),
                status = ProcParse.str(row["status"], row["estado"]),
                requestedByName = ProcParse.str(
                    requestedBy?.get("nombre"), requestedBy?.get("name"),
                    row["requestedByName"], row["solicitante"], row["requestedBy"],
                ),
                requestedById = ProcParse.lng(requestedBy?.get("id"), row["requestedById"]),
                departmentName = ProcParse.str(
                    department?.get("name"), department?.get("nombre"), row["departmentName"],
                ),
                createdAt = ProcParse.str(row["createdAt"], row["fecha"]),
                priority = ProcParse.str(row["priority"], row["prioridad"]),
            )
        }
    }
}

/** Orden de compra — GET /procurement/purchase-orders */
data class PurchaseOrderDto(
    val id: Long? = null,
    val poNumber: String = "",
    val status: String = "",
    val supplierName: String = "",
    val supplierId: Long? = null,
    val totalAmount: Double? = null,
    val createdAt: String = "",
    val createdByName: String = "",
) {
    val rowKey: String
        get() = "po-${id ?: 0}-$poNumber"

    val displayTitle: String
        get() = poNumber.ifBlank { "OC" }

    fun toFlatMap(): Map<String, Any?> = buildMap {
        put("id", id)
        put("poNumber", poNumber)
        put("number", poNumber)
        put("folio", poNumber)
        put("title", poNumber)
        put("status", status)
        put("estado", status)
        put("supplierName", supplierName)
        put("vendorName", supplierName)
        put("supplierId", supplierId)
        put("totalAmount", totalAmount)
        put("createdAt", createdAt)
        put("createdBy", createdByName)
    }

    companion object {
        fun fromRaw(row: Map<String, Any?>): PurchaseOrderDto {
            @Suppress("UNCHECKED_CAST")
            val supplier = row["supplier"] as? Map<String, Any?>
            @Suppress("UNCHECKED_CAST")
            val createdBy = row["createdBy"] as? Map<String, Any?>
            return PurchaseOrderDto(
                id = ProcParse.lng(row["id"]),
                poNumber = ProcParse.str(row["poNumber"], row["number"], row["folio"]),
                status = ProcParse.str(row["status"], row["estado"]),
                supplierName = ProcParse.str(
                    supplier?.get("name"), supplier?.get("nombre"),
                    row["supplierName"], row["vendorName"],
                ),
                supplierId = ProcParse.lng(supplier?.get("id"), row["supplierId"]),
                totalAmount = ProcParse.dbl(row["totalAmount"], row["amount"], row["total"]),
                createdAt = ProcParse.str(row["createdAt"], row["fecha"]),
                createdByName = ProcParse.str(createdBy?.get("nombre"), createdBy?.get("name"), row["createdBy"]),
            )
        }
    }
}

/** Recepción de mercancía — GET /procurement/goods-receipts */
data class GoodsReceiptDto(
    val id: Long? = null,
    val receiptNumber: String = "",
    val status: String = "",
    val warehouseName: String = "",
    val poNumber: String = "",
    val quantity: Double? = null,
    val createdAt: String = "",
) {
    val displayTitle: String
        get() = receiptNumber.ifBlank { poNumber.ifBlank { "Recepción" } }

    fun toFlatMap(): Map<String, Any?> = buildMap {
        put("id", id)
        put("receiptNumber", receiptNumber)
        put("number", receiptNumber)
        put("folio", receiptNumber)
        put("title", displayTitle)
        put("status", status)
        put("estado", status)
        put("warehouseName", warehouseName)
        put("poNumber", poNumber)
        put("quantity", quantity)
        put("receivedQty", quantity)
        put("createdAt", createdAt)
    }

    companion object {
        fun fromRaw(row: Map<String, Any?>): GoodsReceiptDto {
            @Suppress("UNCHECKED_CAST")
            val warehouse = row["warehouse"] as? Map<String, Any?>
            @Suppress("UNCHECKED_CAST")
            val po = row["purchaseOrder"] as? Map<String, Any?>
            return GoodsReceiptDto(
                id = ProcParse.lng(row["id"]),
                receiptNumber = ProcParse.str(row["receiptNumber"], row["grNumber"], row["number"], row["folio"]),
                status = ProcParse.str(row["status"], row["estado"]),
                warehouseName = ProcParse.str(
                    warehouse?.get("name"), warehouse?.get("nombre"), row["warehouseName"],
                ),
                poNumber = ProcParse.str(po?.get("poNumber"), row["poNumber"], row["purchaseOrderNumber"]),
                quantity = ProcParse.dbl(row["quantity"], row["receivedQty"], row["totalItems"]),
                createdAt = ProcParse.str(row["createdAt"], row["receiptDate"], row["fecha"]),
            )
        }
    }
}

internal object ProcParse {
    fun str(vararg keys: Any?): String {
        for (v in keys) {
            when (v) {
                is String -> if (v.isNotBlank() && v != "null") return v
                is Number -> return v.toString()
                is Map<*, *> -> {
                    val n = v["name"] ?: v["nombre"] ?: v["code"]
                    if (n != null) return n.toString()
                }
            }
        }
        return ""
    }

    fun lng(vararg keys: Any?): Long? {
        for (v in keys) {
            when (v) {
                is Number -> return v.toLong()
                is String -> v.toLongOrNull()?.let { return it }
            }
        }
        return null
    }

    fun dbl(vararg keys: Any?): Double? {
        for (v in keys) {
            when (v) {
                is Number -> return v.toDouble()
                is String -> v.toDoubleOrNull()?.let { return it }
            }
        }
        return null
    }
}
