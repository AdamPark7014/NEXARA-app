import Foundation

/// Repositorio de compras: el detalle que faltaba y la traza de aprobación.
///
/// `ExtraRepository` ya trae los tres listados (requisiciones, órdenes,
/// recepciones) y `OpsRepository` ya aprueba y rechaza requisiciones; aquí no se
/// duplica ninguno de los dos. Lo que se añade es lo que no existía en iOS:
/// abrir un documento y ver sus partidas, el directorio de proveedores, sus
/// evaluaciones y el historial de aprobaciones de la entidad.
///
/// Las rutas se escriben enteras dentro de cada `get(...)` a propósito: metidas
/// en un ayudante privado dejan de ser greppables y el informe de paridad no las
/// ve.
final class ProcurementRepository {
    static let shared = ProcurementRepository()
    private let api = ApiClient.shared
    private init() {}

    private func rows(_ data: Data?) -> [[String: Any]] {
        guard let data else { return [] }
        return ApiClient.decodeMapList(data)
    }

    private func single(_ data: Data?) -> [String: Any] {
        guard let data,
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return [:]
        }
        return obj
    }

    // MARK: Proveedores

    /// GET /procurement/purchase-orders/suppliers
    func suppliers() async -> [SupplierItem] {
        rows(try? await api.get("procurement/purchase-orders/suppliers"))
            .map { SupplierItem(raw: $0) }
    }

    /// GET /procurement/supplier-evaluations
    func supplierEvaluations(supplierId: Int64? = nil) async -> [SupplierEvaluation] {
        var q: [String: String] = [:]
        if let supplierId { q["supplierId"] = String(supplierId) }
        return rows(try? await api.get("procurement/supplier-evaluations", query: q))
            .map { SupplierEvaluation(raw: $0) }
    }

    // MARK: Documentos con partidas

    /// GET /procurement/requisitions/:id
    func requisition(id: Int64) async -> RequisitionDetail {
        RequisitionDetail(raw: single(try? await api.get("procurement/requisitions/\(id)")))
    }

    /// GET /procurement/purchase-orders/:id
    func purchaseOrder(id: Int64) async -> PurchaseOrderDetail {
        PurchaseOrderDetail(raw: single(try? await api.get("procurement/purchase-orders/\(id)")))
    }

    /// GET /procurement/goods-receipts/:id
    func goodsReceipt(id: Int64) async -> GoodsReceiptDetail {
        GoodsReceiptDetail(raw: single(try? await api.get("procurement/goods-receipts/\(id)")))
    }

    // MARK: Aprobación de órdenes de compra

    /// PATCH /procurement/purchase-orders/:id/approve
    ///
    /// Se implementa como flujo operativo de compras, igual que la aprobación de
    /// requisiciones que ya existía: no es facturación fiscal, ni contabilidad,
    /// ni nómina. Aun así compromete dinero con un proveedor, y por eso el
    /// servidor lo protege con el permiso `PROCUREMENT_APPROVE`: sin él la
    /// llamada responde 403 y la pantalla enseña ese error tal cual, en vez de
    /// fingir que funcionó.
    func approvePurchaseOrder(id: Int64) async throws -> [String: Any] {
        struct Empty: Encodable {}
        let data = try await api.patchJSON("procurement/purchase-orders/\(id)/approve", body: Empty())
        return (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
    }

    // MARK: RFQ (sólo consulta)
    //
    // Adjudicar (`POST rfq/:id/award`), cancelar (`PATCH rfq/:id/cancel`) y
    // capturar precios (`POST rfq/:id/lines/:id/quote`) NO se implementan: la
    // adjudicación genera una orden de compra —compromete dinero— y la captura
    // de precios es teclear una tabla, que no es trabajo de teléfono. Aquí sólo
    // se lee y se compara.

    /// GET /procurement/rfq
    func rfqs(requisitionId: Int64? = nil, status: String? = nil) async -> [RfqItem] {
        var q: [String: String] = [:]
        if let requisitionId { q["requisitionId"] = String(requisitionId) }
        if let status, !status.isEmpty { q["status"] = status }
        return rows(try? await api.get("procurement/rfq", query: q)).map { RfqItem(raw: $0) }
    }

    /// GET /procurement/rfq/:id/compare — comparativa por proveedor con el
    /// mejor precio y el mejor plazo ya calculados por la API.
    func rfqComparison(id: Int64) async -> RfqComparison {
        RfqComparison(raw: single(try? await api.get("procurement/rfq/\(id)/compare")))
    }

    // MARK: Traza de aprobación (workflow)

    /// GET /workflow/instances/:id
    func workflowInstance(id: Int64) async -> WorkflowInstanceItem {
        WorkflowInstanceItem(raw: single(try? await api.get("workflow/instances/\(id)")))
    }

    /// GET /workflow/entity/:entityType/:entityId
    /// `entityType` va en mayúsculas porque el servicio hace `toUpperCase()`
    /// antes de consultar; mandarlo ya normalizado evita depender de eso.
    func workflowForEntity(entityType: String, entityId: Int64) async -> [WorkflowInstanceItem] {
        let tipo = entityType.uppercased()
        return rows(try? await api.get("workflow/entity/\(tipo)/\(entityId)"))
            .map { WorkflowInstanceItem(raw: $0) }
    }
}
