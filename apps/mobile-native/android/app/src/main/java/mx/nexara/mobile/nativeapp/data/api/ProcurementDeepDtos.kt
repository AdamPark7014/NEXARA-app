package mx.nexara.mobile.nativeapp.data.api

/**
 * Compras — el detalle que la web tenía y el móvil no.
 *
 * `ProcurementDtos.kt` sólo modelaba las tres listas (`requisitions`,
 * `purchase-orders`, `goods-receipts`). La consola web además abre cada ficha,
 * aprueba la orden de compra y lleva el ciclo completo de RFQ
 * (cotizar → comparar → adjudicar / cancelar). Eso es lo que falta aquí.
 *
 * Todos los `fromRaw` son tolerantes: el API devuelve Prisma crudo con
 * `Decimal` serializado como string, relaciones anidadas y nombres en inglés,
 * y algunos despliegues antiguos usan alias en castellano. `ProcParse`
 * (en `ProcurementDtos.kt`) ya resuelve esa mezcla; se reutiliza tal cual.
 */

/** Proveedor — GET /procurement/purchase-orders/suppliers */
data class SupplierDto(
    val id: Long? = null,
    val name: String = "",
    val rfc: String = "",
    val description: String = "",
) {
    val displayTitle: String get() = name.ifBlank { "Proveedor" }

    companion object {
        fun fromRaw(row: Map<String, Any?>): SupplierDto = SupplierDto(
            id = ProcParse.lng(row["id"]),
            name = ProcParse.str(row["name"], row["nombre"]),
            rfc = ProcParse.str(row["rfc"]),
            description = ProcParse.str(row["description"], row["descripcion"]),
        )
    }
}

/** Partida de una orden de compra. */
data class PurchaseOrderItemDto(
    val id: Long? = null,
    val description: String = "",
    val sku: String = "",
    val quantity: Double? = null,
    val receivedQty: Double? = null,
    val unitPrice: Double? = null,
    val total: Double? = null,
) {
    val rowKey: String get() = "poi-${id ?: description.hashCode()}"

    /** Lo que aún no llega. Negativo nunca: el API puede sobre-recibir. */
    val pendingQty: Double
        get() = ((quantity ?: 0.0) - (receivedQty ?: 0.0)).coerceAtLeast(0.0)

    companion object {
        fun fromRaw(row: Map<String, Any?>): PurchaseOrderItemDto {
            @Suppress("UNCHECKED_CAST")
            val product = row["product"] as? Map<String, Any?>
            return PurchaseOrderItemDto(
                id = ProcParse.lng(row["id"]),
                description = ProcParse.str(
                    row["description"], row["descripcion"],
                    product?.get("name"), product?.get("nombre"),
                ),
                sku = ProcParse.str(product?.get("sku"), row["sku"]),
                quantity = ProcParse.dbl(row["quantity"], row["cantidad"]),
                receivedQty = ProcParse.dbl(row["receivedQty"], row["recibido"]),
                unitPrice = ProcParse.dbl(row["unitPrice"], row["precioUnitario"]),
                total = ProcParse.dbl(row["total"], row["importe"]),
            )
        }
    }
}

/** Orden de compra completa — GET /procurement/purchase-orders/:id */
data class PurchaseOrderDetailDto(
    val id: Long? = null,
    val poNumber: String = "",
    val status: String = "",
    val supplierName: String = "",
    val supplierRfc: String = "",
    val orderDate: String = "",
    val expectedDate: String = "",
    val currency: String = "MXN",
    val subtotal: Double? = null,
    val taxAmount: Double? = null,
    val totalAmount: Double? = null,
    val paymentTerms: String = "",
    val shippingAddress: String = "",
    val notes: String = "",
    val createdByName: String = "",
    val approvedByName: String = "",
    val approvedAt: String = "",
    val requisitionNumber: String = "",
    val items: List<PurchaseOrderItemDto> = emptyList(),
    val receiptCount: Int = 0,
) {
    val displayTitle: String get() = poNumber.ifBlank { "Orden de compra" }

    /**
     * Sólo un borrador se aprueba. El servicio mueve `DRAFT → CONFIRMED`; si la
     * OC ya está confirmada, recibida o cancelada el botón no debe existir —
     * en la web tampoco aparece.
     */
    val canApprove: Boolean get() = status.uppercase() == "DRAFT"

    val isApproved: Boolean get() = approvedByName.isNotBlank() || approvedAt.isNotBlank()

    companion object {
        fun fromRaw(row: Map<String, Any?>): PurchaseOrderDetailDto {
            @Suppress("UNCHECKED_CAST")
            val supplier = row["supplier"] as? Map<String, Any?>
            @Suppress("UNCHECKED_CAST")
            val createdBy = row["createdBy"] as? Map<String, Any?>
            @Suppress("UNCHECKED_CAST")
            val approvedBy = row["approvedBy"] as? Map<String, Any?>
            @Suppress("UNCHECKED_CAST")
            val requisition = row["requisition"] as? Map<String, Any?>
            val rawItems = (row["items"] as? List<*>).orEmpty()
            val rawReceipts = (row["receipts"] as? List<*>).orEmpty()
            return PurchaseOrderDetailDto(
                id = ProcParse.lng(row["id"]),
                poNumber = ProcParse.str(row["poNumber"], row["number"], row["folio"]),
                status = ProcParse.str(row["status"], row["estado"]),
                supplierName = ProcParse.str(
                    supplier?.get("name"), supplier?.get("nombre"), row["supplierName"],
                ),
                supplierRfc = ProcParse.str(supplier?.get("rfc")),
                orderDate = ProcParse.str(row["orderDate"], row["fecha"]).take(10),
                expectedDate = ProcParse.str(row["expectedDate"]).take(10),
                currency = ProcParse.str(row["currency"]).ifBlank { "MXN" },
                subtotal = ProcParse.dbl(row["subtotal"]),
                taxAmount = ProcParse.dbl(row["taxAmount"]),
                totalAmount = ProcParse.dbl(row["totalAmount"], row["total"]),
                paymentTerms = ProcParse.str(row["paymentTerms"]),
                shippingAddress = ProcParse.str(row["shippingAddress"]),
                notes = ProcParse.str(row["notes"], row["notas"]),
                createdByName = ProcParse.str(createdBy?.get("nombre"), createdBy?.get("name")),
                approvedByName = ProcParse.str(approvedBy?.get("nombre"), approvedBy?.get("name")),
                approvedAt = ProcParse.str(row["approvedAt"]).take(10),
                requisitionNumber = ProcParse.str(requisition?.get("reqNumber")),
                items = rawItems.filterIsInstance<Map<String, Any?>>()
                    .map { PurchaseOrderItemDto.fromRaw(it) },
                receiptCount = rawReceipts.size,
            )
        }
    }
}

/** Partida recibida dentro de una recepción de mercancía. */
data class GoodsReceiptItemDto(
    val id: Long? = null,
    val description: String = "",
    val sku: String = "",
    val quantityReceived: Double? = null,
    val quantityRejected: Double? = null,
    val lotNumber: String = "",
    val unitPrice: Double? = null,
    val landedCostAllocated: Double? = null,
    val notes: String = "",
) {
    val rowKey: String get() = "gri-${id ?: description.hashCode()}"

    val hasRejection: Boolean get() = (quantityRejected ?: 0.0) > 0.0

    companion object {
        fun fromRaw(row: Map<String, Any?>): GoodsReceiptItemDto {
            @Suppress("UNCHECKED_CAST")
            val poItem = row["purchaseOrderItem"] as? Map<String, Any?>
            @Suppress("UNCHECKED_CAST")
            val product = poItem?.get("product") as? Map<String, Any?>
            return GoodsReceiptItemDto(
                id = ProcParse.lng(row["id"]),
                description = ProcParse.str(
                    poItem?.get("description"), product?.get("name"),
                    row["description"], row["descripcion"],
                ),
                sku = ProcParse.str(product?.get("sku"), row["sku"]),
                quantityReceived = ProcParse.dbl(row["quantityReceived"], row["cantidadRecibida"]),
                quantityRejected = ProcParse.dbl(row["quantityRejected"], row["cantidadRechazada"]),
                lotNumber = ProcParse.str(row["lotNumber"], row["lote"]),
                unitPrice = ProcParse.dbl(poItem?.get("unitPrice"), row["unitPrice"]),
                landedCostAllocated = ProcParse.dbl(row["landedCostAllocated"]),
                notes = ProcParse.str(row["notes"], row["notas"]),
            )
        }
    }
}

/** Recepción completa — GET /procurement/goods-receipts/:id */
data class GoodsReceiptDetailDto(
    val id: Long? = null,
    val receiptNumber: String = "",
    val receiptDate: String = "",
    val warehouseName: String = "",
    val warehouseCode: String = "",
    val poNumber: String = "",
    val supplierName: String = "",
    val receivedByName: String = "",
    val notes: String = "",
    val freightCost: Double? = null,
    val insuranceCost: Double? = null,
    val customsCost: Double? = null,
    val otherLandedCost: Double? = null,
    val items: List<GoodsReceiptItemDto> = emptyList(),
) {
    val displayTitle: String get() = receiptNumber.ifBlank { poNumber.ifBlank { "Recepción" } }

    /** Suma de los cargos prorrateados; 0 significa «sin landed cost». */
    val landedCostTotal: Double
        get() = (freightCost ?: 0.0) + (insuranceCost ?: 0.0) +
            (customsCost ?: 0.0) + (otherLandedCost ?: 0.0)

    val rejectedLines: Int get() = items.count { it.hasRejection }

    companion object {
        fun fromRaw(row: Map<String, Any?>): GoodsReceiptDetailDto {
            @Suppress("UNCHECKED_CAST")
            val warehouse = row["warehouse"] as? Map<String, Any?>
            @Suppress("UNCHECKED_CAST")
            val po = row["purchaseOrder"] as? Map<String, Any?>
            @Suppress("UNCHECKED_CAST")
            val supplier = po?.get("supplier") as? Map<String, Any?>
            @Suppress("UNCHECKED_CAST")
            val receivedBy = row["receivedBy"] as? Map<String, Any?>
            val rawItems = (row["items"] as? List<*>).orEmpty()
            return GoodsReceiptDetailDto(
                id = ProcParse.lng(row["id"]),
                receiptNumber = ProcParse.str(row["receiptNumber"], row["grNumber"], row["folio"]),
                receiptDate = ProcParse.str(row["receiptDate"], row["fecha"]).take(10),
                warehouseName = ProcParse.str(warehouse?.get("name"), row["warehouseName"]),
                warehouseCode = ProcParse.str(warehouse?.get("code")),
                poNumber = ProcParse.str(po?.get("poNumber"), row["poNumber"]),
                supplierName = ProcParse.str(supplier?.get("name"), row["supplierName"]),
                receivedByName = ProcParse.str(receivedBy?.get("nombre"), receivedBy?.get("name")),
                notes = ProcParse.str(row["notes"], row["notas"]),
                freightCost = ProcParse.dbl(row["freightCost"]),
                insuranceCost = ProcParse.dbl(row["insuranceCost"]),
                customsCost = ProcParse.dbl(row["customsCost"]),
                otherLandedCost = ProcParse.dbl(row["otherLandedCost"]),
                items = rawItems.filterIsInstance<Map<String, Any?>>()
                    .map { GoodsReceiptItemDto.fromRaw(it) },
            )
        }
    }
}

/** Línea de RFQ: un producto pedido a un proveedor concreto. */
data class RfqLineDto(
    val id: Long? = null,
    val supplierId: Long? = null,
    val supplierName: String = "",
    val description: String = "",
    val sku: String = "",
    val quantity: Double? = null,
    val unitPrice: Double? = null,
    val leadTimeDays: Int? = null,
    val notes: String = "",
    val quotedAt: String = "",
) {
    val rowKey: String get() = "rfql-${id ?: 0}"

    /** Sin precio no hay cotización: el API rechaza adjudicar así. */
    val isQuoted: Boolean get() = unitPrice != null

    val lineTotal: Double? get() = unitPrice?.let { it * (quantity ?: 0.0) }

    companion object {
        fun fromRaw(row: Map<String, Any?>): RfqLineDto {
            @Suppress("UNCHECKED_CAST")
            val supplier = row["supplier"] as? Map<String, Any?>
            @Suppress("UNCHECKED_CAST")
            val product = row["product"] as? Map<String, Any?>
            return RfqLineDto(
                id = ProcParse.lng(row["id"]),
                supplierId = ProcParse.lng(supplier?.get("id"), row["supplierId"]),
                supplierName = ProcParse.str(supplier?.get("name"), row["supplierName"]),
                description = ProcParse.str(
                    row["description"], row["descripcion"], product?.get("name"),
                ),
                sku = ProcParse.str(product?.get("sku"), row["sku"]),
                quantity = ProcParse.dbl(row["quantity"], row["cantidad"]),
                // `unitPrice` es nullable en el modelo: null = todavía sin cotizar.
                unitPrice = ProcParse.dbl(row["unitPrice"]),
                leadTimeDays = ProcParse.lng(row["leadTimeDays"])?.toInt(),
                notes = ProcParse.str(row["notes"], row["notas"]),
                quotedAt = ProcParse.str(row["quotedAt"]).take(10),
            )
        }
    }
}

/** Solicitud de cotización — GET /procurement/rfq */
data class RfqDto(
    val id: Long? = null,
    val rfqNumber: String = "",
    val status: String = "",
    val requisitionNumber: String = "",
    val requisitionTitle: String = "",
    val dueDate: String = "",
    val notes: String = "",
    val lineCount: Int = 0,
    val createdAt: String = "",
    val awardedPoNumber: String = "",
    val lines: List<RfqLineDto> = emptyList(),
) {
    val rowKey: String get() = "rfq-${id ?: 0}-$rfqNumber"

    val displayTitle: String get() = rfqNumber.ifBlank { "RFQ" }

    val isClosed: Boolean
        get() = status.uppercase() == "AWARDED" || status.uppercase() == "CANCELLED"

    /** Una RFQ adjudicada ya no se cancela — el servicio devuelve 400. */
    val canCancel: Boolean get() = !isClosed

    val canAward: Boolean get() = !isClosed

    companion object {
        fun fromRaw(row: Map<String, Any?>): RfqDto {
            @Suppress("UNCHECKED_CAST")
            val requisition = row["requisition"] as? Map<String, Any?>
            @Suppress("UNCHECKED_CAST")
            val counts = row["_count"] as? Map<String, Any?>
            @Suppress("UNCHECKED_CAST")
            val awarded = row["awardedPurchaseOrder"] as? Map<String, Any?>
            val rawLines = (row["lines"] as? List<*>).orEmpty()
                .filterIsInstance<Map<String, Any?>>()
                .map { RfqLineDto.fromRaw(it) }
            return RfqDto(
                id = ProcParse.lng(row["id"]),
                rfqNumber = ProcParse.str(row["rfqNumber"], row["folio"]),
                status = ProcParse.str(row["status"], row["estado"]),
                requisitionNumber = ProcParse.str(requisition?.get("reqNumber")),
                requisitionTitle = ProcParse.str(requisition?.get("title")),
                dueDate = ProcParse.str(row["dueDate"]).take(10),
                notes = ProcParse.str(row["notes"], row["notas"]),
                // `_count.lines` sólo viene en el listado; en el detalle contamos.
                lineCount = ProcParse.lng(counts?.get("lines"))?.toInt() ?: rawLines.size,
                createdAt = ProcParse.str(row["createdAt"]).take(10),
                awardedPoNumber = ProcParse.str(awarded?.get("poNumber")),
                lines = rawLines,
            )
        }
    }
}

/** Un proveedor dentro de la comparativa — GET /procurement/rfq/:id/compare */
data class RfqSupplierQuoteDto(
    val supplierId: Long? = null,
    val supplierName: String = "",
    val totalPrice: Double = 0.0,
    val maxLeadTimeDays: Int = 0,
    val quotedLines: Int = 0,
    val totalLines: Int = 0,
    val lines: List<RfqLineDto> = emptyList(),
) {
    val rowKey: String get() = "rfqsup-${supplierId ?: 0}"

    /** Adjudicar exige todas las líneas del proveedor con precio. */
    val isComplete: Boolean get() = totalLines > 0 && quotedLines == totalLines

    companion object {
        fun fromRaw(row: Map<String, Any?>): RfqSupplierQuoteDto = RfqSupplierQuoteDto(
            supplierId = ProcParse.lng(row["supplierId"]),
            supplierName = ProcParse.str(row["supplierName"]),
            totalPrice = ProcParse.dbl(row["totalPrice"]) ?: 0.0,
            maxLeadTimeDays = ProcParse.lng(row["maxLeadTimeDays"])?.toInt() ?: 0,
            quotedLines = ProcParse.lng(row["quotedLines"])?.toInt() ?: 0,
            totalLines = ProcParse.lng(row["totalLines"])?.toInt() ?: 0,
            lines = (row["lines"] as? List<*>).orEmpty()
                .filterIsInstance<Map<String, Any?>>()
                .map { RfqLineDto.fromRaw(it) },
        )
    }
}

/** Comparativa completa de una RFQ. */
data class RfqComparisonDto(
    val rfq: RfqDto = RfqDto(),
    val suppliers: List<RfqSupplierQuoteDto> = emptyList(),
    val bestPriceSupplierId: Long? = null,
    val bestLeadTimeSupplierId: Long? = null,
) {
    companion object {
        fun fromRaw(row: Map<String, Any?>): RfqComparisonDto {
            @Suppress("UNCHECKED_CAST")
            val rfq = row["rfq"] as? Map<String, Any?>
            return RfqComparisonDto(
                rfq = rfq?.let { RfqDto.fromRaw(it) } ?: RfqDto(),
                suppliers = (row["suppliers"] as? List<*>).orEmpty()
                    .filterIsInstance<Map<String, Any?>>()
                    .map { RfqSupplierQuoteDto.fromRaw(it) },
                bestPriceSupplierId = ProcParse.lng(row["bestPriceSupplierId"]),
                bestLeadTimeSupplierId = ProcParse.lng(row["bestLeadTimeSupplierId"]),
            )
        }
    }
}

/** Cuerpo de POST /procurement/rfq/:id/lines/:lineId/quote */
data class RfqQuoteBody(
    val unitPrice: Double,
    val leadTimeDays: Int? = null,
    val notes: String? = null,
)

/** Cuerpo de POST /procurement/rfq/:id/award */
data class RfqAwardBody(
    val supplierId: Long,
)
