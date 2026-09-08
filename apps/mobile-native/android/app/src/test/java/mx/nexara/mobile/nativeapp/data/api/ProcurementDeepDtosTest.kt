package mx.nexara.mobile.nativeapp.data.api

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Los `fromRaw` de compras, comunicados y evaluaciones.
 *
 * El API no serializa: entrega Prisma tal cual. Eso significa `Decimal` como
 * string, relaciones anidadas (`supplier.name`, `purchaseOrderItem.product.sku`)
 * y campos que en unos despliegues llegan en inglés y en otros en castellano.
 * Cada vez que un `fromRaw` se equivoca de camino, la pantalla no falla: enseña
 * un guion donde debería ir el total de la orden, y nadie se entera.
 *
 * Estas pruebas fijan la forma real de las respuestas.
 */
class ProcurementDeepDtosTest {

    // ── Orden de compra ─────────────────────────────────────────────────────

    private fun purchaseOrderRaw(): Map<String, Any?> = mapOf(
        "id" to 42,
        "poNumber" to "OC-2026-0031",
        "status" to "DRAFT",
        // Prisma manda Decimal como string; si el parser sólo mirase Number,
        // los tres importes quedarían en null.
        "subtotal" to "12500.00",
        "taxAmount" to "2000.00",
        "totalAmount" to "14500.00",
        "currency" to "MXN",
        "orderDate" to "2026-09-01T00:00:00.000Z",
        "expectedDate" to "2026-09-15T00:00:00.000Z",
        "paymentTerms" to "30 días",
        "notes" to "Entrega en andén 2",
        "supplier" to mapOf("id" to 7, "name" to "Distribuidora Norte", "rfc" to "DNO900101AB1"),
        "createdBy" to mapOf("id" to 3, "nombre" to "Adam Pozo"),
        "requisition" to mapOf("id" to 11, "reqNumber" to "REQ-0009"),
        "items" to listOf(
            mapOf(
                "id" to 100,
                "description" to "Cámara IP 4MP",
                "quantity" to "10.0000",
                "receivedQty" to "4.0000",
                "unitPrice" to "1250.00",
                "total" to "12500.00",
                "product" to mapOf("id" to 55, "sku" to "HIK-4MP", "name" to "DS-2CD"),
            ),
        ),
        "receipts" to listOf(mapOf("id" to 90), mapOf("id" to 91)),
    )

    @Test
    fun `la orden de compra lee importes en texto y relaciones anidadas`() {
        val po = PurchaseOrderDetailDto.fromRaw(purchaseOrderRaw())

        assertEquals("OC-2026-0031", po.poNumber)
        assertEquals("Distribuidora Norte", po.supplierName)
        assertEquals("DNO900101AB1", po.supplierRfc)
        assertEquals("REQ-0009", po.requisitionNumber)
        assertEquals("Adam Pozo", po.createdByName)
        assertEquals(14500.0, po.totalAmount!!, 0.001)
        assertEquals(12500.0, po.subtotal!!, 0.001)
        // Las fechas ISO se recortan a día: en una ficha no cabe la hora UTC.
        assertEquals("2026-09-01", po.orderDate)
        assertEquals("2026-09-15", po.expectedDate)
        assertEquals(2, po.receiptCount)
    }

    @Test
    fun `solo un borrador se puede aprobar`() {
        val draft = PurchaseOrderDetailDto.fromRaw(purchaseOrderRaw())
        assertTrue("Un DRAFT tiene que ofrecer el botón de aprobar", draft.canApprove)

        val confirmed = PurchaseOrderDetailDto.fromRaw(
            purchaseOrderRaw() + mapOf(
                "status" to "CONFIRMED",
                "approvedBy" to mapOf("id" to 3, "nombre" to "Adam Pozo"),
                "approvedAt" to "2026-09-02T10:00:00.000Z",
            ),
        )
        assertFalse("Una OC confirmada no se vuelve a aprobar", confirmed.canApprove)
        assertTrue(confirmed.isApproved)
        assertEquals("2026-09-02", confirmed.approvedAt)
    }

    @Test
    fun `el pendiente por recibir sale de la partida y nunca es negativo`() {
        val po = PurchaseOrderDetailDto.fromRaw(purchaseOrderRaw())
        assertEquals(6.0, po.items.first().pendingQty, 0.001)
        assertEquals("HIK-4MP", po.items.first().sku)

        // Sobre-recepción: el almacén recibió más de lo pedido. Enseñar «-2
        // pendientes» sería peor que enseñar cero.
        val sobre = PurchaseOrderItemDto.fromRaw(
            mapOf("id" to 1, "quantity" to "10", "receivedQty" to "12"),
        )
        assertEquals(0.0, sobre.pendingQty, 0.001)
    }

    // ── Recepción de mercancía ──────────────────────────────────────────────

    @Test
    fun `la recepcion lee el proveedor a traves de la orden de compra`() {
        val gr = GoodsReceiptDetailDto.fromRaw(
            mapOf(
                "id" to 90,
                "receiptNumber" to "GR-0007",
                "receiptDate" to "2026-09-05T00:00:00.000Z",
                "freightCost" to "800.00",
                "insuranceCost" to "0",
                "customsCost" to "0",
                "otherLandedCost" to "200.50",
                "warehouse" to mapOf("id" to 2, "code" to "CEDIS", "name" to "Central"),
                // El nombre del proveedor cuelga de purchaseOrder.supplier, no
                // de la recepción: buscarlo en la raíz devolvía siempre vacío.
                "purchaseOrder" to mapOf(
                    "id" to 42,
                    "poNumber" to "OC-2026-0031",
                    "supplier" to mapOf("id" to 7, "name" to "Distribuidora Norte"),
                ),
                "receivedBy" to mapOf("id" to 8, "nombre" to "Karla R."),
                "items" to listOf(
                    mapOf(
                        "id" to 300,
                        "quantityReceived" to "4.0000",
                        "quantityRejected" to "1.0000",
                        "lotNumber" to "L-2026-09",
                        "purchaseOrderItem" to mapOf(
                            "id" to 100,
                            "description" to "Cámara IP 4MP",
                            "unitPrice" to "1250.00",
                            "product" to mapOf("sku" to "HIK-4MP", "name" to "DS-2CD"),
                        ),
                    ),
                    mapOf("id" to 301, "quantityReceived" to "2", "quantityRejected" to "0"),
                ),
            ),
        )

        assertEquals("Distribuidora Norte", gr.supplierName)
        assertEquals("OC-2026-0031", gr.poNumber)
        assertEquals("CEDIS", gr.warehouseCode)
        assertEquals("Karla R.", gr.receivedByName)
        assertEquals("2026-09-05", gr.receiptDate)
        assertEquals(1000.5, gr.landedCostTotal, 0.001)
        assertEquals(1, gr.rejectedLines)
        assertEquals("Cámara IP 4MP", gr.items.first().description)
        assertEquals(1250.0, gr.items.first().unitPrice!!, 0.001)
    }

    // ── RFQ ─────────────────────────────────────────────────────────────────

    @Test
    fun `la rfq del listado toma el conteo de lineas del _count`() {
        val rfq = RfqDto.fromRaw(
            mapOf(
                "id" to 5,
                "rfqNumber" to "RFQ-0005",
                "status" to "QUOTED",
                "dueDate" to "2026-09-20T00:00:00.000Z",
                "requisition" to mapOf("id" to 11, "reqNumber" to "REQ-0009", "title" to "Cámaras sucursal"),
                "_count" to mapOf("lines" to 6),
            ),
        )

        assertEquals(6, rfq.lineCount)
        assertEquals("REQ-0009", rfq.requisitionNumber)
        assertEquals("Cámaras sucursal", rfq.requisitionTitle)
        assertEquals("2026-09-20", rfq.dueDate)
        assertTrue("Una RFQ cotizada todavía se adjudica", rfq.canAward)
        assertTrue(rfq.canCancel)
    }

    @Test
    fun `una rfq adjudicada ya no se cancela ni se vuelve a adjudicar`() {
        val rfq = RfqDto.fromRaw(
            mapOf(
                "id" to 5,
                "rfqNumber" to "RFQ-0005",
                "status" to "AWARDED",
                "awardedPurchaseOrder" to mapOf("id" to 42, "poNumber" to "OC-2026-0031"),
            ),
        )
        assertTrue(rfq.isClosed)
        assertFalse("El servidor responde 400 al cancelar una adjudicada", rfq.canCancel)
        assertFalse(rfq.canAward)
        assertEquals("OC-2026-0031", rfq.awardedPoNumber)
    }

    @Test
    fun `una linea sin precio no cuenta como cotizada`() {
        val sinPrecio = RfqLineDto.fromRaw(
            mapOf(
                "id" to 70,
                "description" to "Switch PoE 8p",
                "quantity" to "3",
                "supplier" to mapOf("id" to 7, "name" to "Distribuidora Norte"),
            ),
        )
        assertFalse(sinPrecio.isQuoted)
        assertNull(sinPrecio.lineTotal)

        val conPrecio = RfqLineDto.fromRaw(
            mapOf(
                "id" to 71,
                "description" to "Switch PoE 8p",
                "quantity" to "3",
                "unitPrice" to "2400.00",
                "leadTimeDays" to 7,
                "supplier" to mapOf("id" to 7, "name" to "Distribuidora Norte"),
            ),
        )
        assertTrue(conPrecio.isQuoted)
        assertEquals(7200.0, conPrecio.lineTotal!!, 0.001)
        assertEquals(7, conPrecio.leadTimeDays)
    }

    @Test
    fun `solo se adjudica al proveedor con todas sus lineas cotizadas`() {
        val cmp = RfqComparisonDto.fromRaw(
            mapOf(
                "rfq" to mapOf("id" to 5, "rfqNumber" to "RFQ-0005", "status" to "QUOTED"),
                "bestPriceSupplierId" to 7,
                "bestLeadTimeSupplierId" to 9,
                "suppliers" to listOf(
                    mapOf(
                        "supplierId" to 7,
                        "supplierName" to "Distribuidora Norte",
                        "totalPrice" to 7200.0,
                        "maxLeadTimeDays" to 7,
                        "quotedLines" to 2,
                        "totalLines" to 2,
                        "lines" to emptyList<Map<String, Any?>>(),
                    ),
                    mapOf(
                        "supplierId" to 9,
                        "supplierName" to "Mayoreo Sur",
                        "totalPrice" to 5000.0,
                        "maxLeadTimeDays" to 3,
                        "quotedLines" to 1,
                        "totalLines" to 2,
                        "lines" to emptyList<Map<String, Any?>>(),
                    ),
                ),
            ),
        )

        assertEquals(7L, cmp.bestPriceSupplierId)
        assertEquals(9L, cmp.bestLeadTimeSupplierId)
        assertTrue("Norte tiene sus dos líneas con precio", cmp.suppliers[0].isComplete)
        assertFalse(
            "Sur va a medias: el API rechaza adjudicarle y el botón debe estar apagado",
            cmp.suppliers[1].isComplete,
        )
    }

    // ── Comunicados internos ────────────────────────────────────────────────

    @Test
    fun `el comunicado del listado llega sin cuerpo y con el autor anidado`() {
        val row = InternalComunicadoDto.fromRaw(
            mapOf(
                "id" to 12,
                "titulo" to "Cierre por puente",
                "audiencia" to "Toda la empresa",
                "prioridad" to "Alta",
                "estado" to "Borrador",
                "lecturas" to 0,
                "totalDestinatarios" to 0,
                "autor" to mapOf("id" to 3, "nombre" to "Adam Pozo"),
            ),
        )

        assertEquals("Cierre por puente", row.displayTitle)
        assertEquals("Adam Pozo", row.autorNombre)
        assertTrue(row.isDraft)
        assertTrue(row.isUrgent)
        assertFalse("El listado no trae `cuerpo`: hay que abrir la ficha", row.hasBody)
        assertNull("Sin destinatarios no hay porcentaje que enseñar", row.readPercent)
    }

    @Test
    fun `el porcentaje de lectura sale de lecturas sobre destinatarios`() {
        val row = InternalComunicadoDto.fromRaw(
            mapOf(
                "id" to 13,
                "titulo" to "Nueva póliza",
                "estado" to "Enviado",
                "lecturas" to 30,
                "totalDestinatarios" to 40,
                "cuerpo" to "Texto completo",
            ),
        )
        assertTrue(row.isSent)
        assertTrue(row.hasBody)
        assertEquals(75, row.readPercent)
    }

    // ── Evaluaciones de desempeño ───────────────────────────────────────────

    @Test
    fun `la evaluacion distingue enviar de acusar segun el estatus`() {
        val borrador = HrReviewDto.fromRaw(
            mapOf(
                "id" to 20,
                "status" to "DRAFT",
                "period" to "ANNUAL",
                "reviewDate" to "2026-08-31T00:00:00.000Z",
                "overallRating" to 4.5,
                "user" to mapOf("id" to 8, "nombre" to "Karla R."),
                "reviewer" to mapOf("id" to 3, "nombre" to "Adam Pozo"),
            ),
        )
        assertTrue("Un borrador se envía", borrador.canSubmit)
        assertFalse("Un borrador no se acusa: el API responde 400", borrador.canAcknowledge)
        assertEquals("Karla R.", borrador.userName)
        assertEquals("Adam Pozo", borrador.reviewerName)
        assertEquals("Anual", borrador.periodLabel)
        assertEquals("2026-08-31", borrador.reviewDate)
        assertEquals(4.5, borrador.overallRating!!, 0.001)

        val enviada = HrReviewDto.fromRaw(mapOf("id" to 21, "status" to "SUBMITTED"))
        assertFalse(enviada.canSubmit)
        assertTrue(enviada.canAcknowledge)
        assertEquals("Enviada", enviada.statusLabel)

        val acusada = HrReviewDto.fromRaw(mapOf("id" to 22, "status" to "ACKNOWLEDGED"))
        assertFalse(acusada.canSubmit)
        assertFalse("Acusar dos veces no tiene sentido", acusada.canAcknowledge)
        assertEquals("Acusada", acusada.statusLabel)
    }

    // ── Proveedores ─────────────────────────────────────────────────────────

    @Test
    fun `el proveedor acepta nombre en ingles o en castellano`() {
        assertEquals(
            "Distribuidora Norte",
            SupplierDto.fromRaw(mapOf("id" to 7, "name" to "Distribuidora Norte")).name,
        )
        assertEquals(
            "Mayoreo Sur",
            SupplierDto.fromRaw(mapOf("id" to 9, "nombre" to "Mayoreo Sur")).name,
        )
        assertEquals("Proveedor", SupplierDto.fromRaw(mapOf("id" to 1)).displayTitle)
    }
}
