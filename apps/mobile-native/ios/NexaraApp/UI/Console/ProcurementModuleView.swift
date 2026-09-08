import SwiftUI

/// Compras — requisiciones, órdenes, recepciones y proveedores.
///
/// Antes esto era un triple listado sin fondo: se veía "OC-0042 · Proveedor X ·
/// APPROVED" y nada más. Ahora cada documento se abre y enseña sus partidas, y
/// la requisición y la orden enseñan además por dónde va su trámite de
/// aprobación (`workflow/entity/...`), que es lo que hace falta para decidir
/// desde el teléfono.
struct ProcurementModuleView: View {
  @State private var tab = 0
  @State private var requisitions: [RequisitionItem] = []
  @State private var orders: [PurchaseOrderItem] = []
  @State private var goodsReceipts: [GoodsReceiptItem] = []
  @State private var suppliers: [SupplierItem] = []
  @State private var evaluations: [SupplierEvaluation] = []
  @State private var query = ""
  @State private var isLoading = true
  @State private var message: String?
  @State private var rejectReason = ""
  @State private var actingId: Int64?

  // Selección: sólo una a la vez; cambiar de pestaña las limpia todas.
  @State private var selected: RequisitionItem?
  @State private var selectedOrder: PurchaseOrderItem?
  @State private var selectedReceipt: GoodsReceiptItem?
  @State private var selectedSupplier: SupplierItem?

  // Detalle cargado bajo demanda.
  @State private var reqDetailData: RequisitionDetail?
  @State private var poDetailData: PurchaseOrderDetail?
  @State private var grDetailData: GoodsReceiptDetail?
  @State private var trail: [WorkflowInstanceItem] = []
  @State private var isLoadingDetail = false

  private var filteredRequisitions: [RequisitionItem] {
    guard !query.isEmpty else { return requisitions }
    let q = query.lowercased()
    return requisitions.filter {
      $0.displayTitle.lowercased().contains(q) ||
      $0.requestedByName.lowercased().contains(q) ||
      $0.reqNumber.lowercased().contains(q)
    }
  }

  private var filteredOrders: [PurchaseOrderItem] {
    guard !query.isEmpty else { return orders }
    let q = query.lowercased()
    return orders.filter {
      $0.displayTitle.lowercased().contains(q) || $0.supplierName.lowercased().contains(q)
    }
  }

  private var filteredReceipts: [GoodsReceiptItem] {
    guard !query.isEmpty else { return goodsReceipts }
    let q = query.lowercased()
    return goodsReceipts.filter {
      $0.displayTitle.lowercased().contains(q) ||
      $0.warehouseName.lowercased().contains(q) ||
      $0.poNumber.lowercased().contains(q)
    }
  }

  private var filteredSuppliers: [SupplierItem] {
    guard !query.isEmpty else { return suppliers }
    let q = query.lowercased()
    return suppliers.filter {
      $0.displayName.lowercased().contains(q) || $0.rfc.lowercased().contains(q)
    }
  }

  var body: some View {
    Group {
      if let s = selected, tab == 0 {
        reqDetail(s)
      } else if let o = selectedOrder, tab == 1 {
        poDetail(o)
      } else if let g = selectedReceipt, tab == 2 {
        grDetail(g)
      } else if let sup = selectedSupplier, tab == 3 {
        supplierDetail(sup)
      } else {
        listBody
      }
    }
    .navigationTitle("Compras")
    .toolbar {
      ToolbarItem(placement: .navigationBarTrailing) {
        // Las RFQ viven en su propia pantalla: el selector segmentado ya lleva
        // cuatro secciones y una quinta etiqueta no cabe legible.
        if !hasSelection {
          NavigationLink { ProcurementRfqView() } label: {
            Image(systemName: "list.bullet.rectangle.portrait")
          }
        }
      }
    }
    .task { await reload() }
    .refreshable { await reload() }
  }

  private var hasSelection: Bool {
    selected != nil || selectedOrder != nil || selectedReceipt != nil || selectedSupplier != nil
  }

  // MARK: – Listados

  private var listBody: some View {
    VStack(spacing: 0) {
      Picker("Sección", selection: $tab) {
        Text("Requis.").tag(0)
        Text("Órdenes").tag(1)
        Text("Recep.").tag(2)
        Text("Proveed.").tag(3)
      }
      .pickerStyle(.segmented)
      .padding()
      .onChange(of: tab) { _ in clearSelection() }

      if let message {
        Text(message).font(.footnote).foregroundColor(.green).padding(.horizontal)
      }

      HStack {
        Image(systemName: "magnifyingglass").foregroundColor(.secondary)
        TextField("Buscar…", text: $query).autocorrectionDisabled()
      }
      .padding(10)
      .background(Color(.secondarySystemGroupedBackground))
      .clipShape(RoundedRectangle(cornerRadius: 12))
      .padding(.horizontal)

      if isLoading {
        Spacer(); ProgressView(); Spacer()
      } else {
        switch tab {
        case 1: ordersList
        case 2: receiptsList
        case 3: suppliersList
        default: requisitionsList
        }
      }
    }
  }

  @ViewBuilder
  private var requisitionsList: some View {
    if filteredRequisitions.isEmpty {
      emptyLabel("Sin registros")
    } else {
      List(filteredRequisitions.prefix(80), id: \.rowKey) { r in
        Button {
          selected = r
          if let id = r.id { loadRequisitionDetail(id) }
        } label: {
          VStack(alignment: .leading, spacing: 4) {
            Text(r.displayTitle).font(.headline)
            Text(r.requestedByName).font(.caption).foregroundColor(.secondary)
            HStack {
              Text(r.status).font(.caption2).bold()
              Spacer()
              Text(String(r.createdAt.prefix(10))).font(.caption2).foregroundColor(.secondary)
            }
          }
          .padding(.vertical, 4)
        }
      }
      .listStyle(.plain)
    }
  }

  @ViewBuilder
  private var ordersList: some View {
    if filteredOrders.isEmpty {
      emptyLabel("Sin registros")
    } else {
      List(filteredOrders.prefix(80), id: \.rowKey) { r in
        Button {
          selectedOrder = r
          if let id = r.id { loadOrderDetail(id) }
        } label: {
          VStack(alignment: .leading, spacing: 4) {
            HStack {
              Text(r.displayTitle).font(.headline)
              Spacer()
              if let t = r.totalAmount { Text(fmtProc(t)).font(.subheadline).bold() }
            }
            Text(r.supplierName).font(.caption).foregroundColor(.secondary)
            HStack {
              Text(r.status).font(.caption2).bold()
              Spacer()
              Text(String(r.createdAt.prefix(10))).font(.caption2).foregroundColor(.secondary)
            }
          }
          .padding(.vertical, 4)
        }
      }
      .listStyle(.plain)
    }
  }

  @ViewBuilder
  private var receiptsList: some View {
    if filteredReceipts.isEmpty {
      emptyLabel("Sin recepciones de mercancía")
    } else {
      List(filteredReceipts.prefix(80), id: \.rowKey) { r in
        Button {
          selectedReceipt = r
          if let id = r.id { loadReceiptDetail(id) }
        } label: {
          VStack(alignment: .leading, spacing: 4) {
            Text(r.displayTitle).font(.headline)
            Text(r.warehouseName).font(.caption).foregroundColor(.secondary)
            HStack {
              Text(r.status).font(.caption2).bold()
              Spacer()
              if let qty = r.quantity {
                Text("Cantidad: \(qty)").font(.caption2).foregroundColor(.teal)
              }
            }
          }
          .padding(.vertical, 4)
        }
      }
      .listStyle(.plain)
    }
  }

  @ViewBuilder
  private var suppliersList: some View {
    if filteredSuppliers.isEmpty {
      emptyLabel("Sin proveedores")
    } else {
      List(filteredSuppliers.prefix(120), id: \.rowKey) { s in
        Button {
          selectedSupplier = s
          loadSupplierEvaluations(s.id)
        } label: {
          VStack(alignment: .leading, spacing: 4) {
            Text(s.displayName).font(.headline).lineLimit(1)
            HStack(spacing: 8) {
              if s.rfc.isEmpty {
                // Sin RFC el proveedor no puede salir en la DIOT; es un dato
                // que Compras tiene que completar, y se ve de un vistazo.
                Text("sin RFC").font(.caption2).bold().foregroundColor(.orange)
              } else {
                Text(s.rfc).font(.caption).foregroundColor(.secondary)
              }
              Spacer()
            }
            if !s.description.isEmpty {
              Text(s.description).font(.caption2).foregroundColor(.secondary).lineLimit(1)
            }
          }
          .padding(.vertical, 4)
        }
      }
      .listStyle(.plain)
    }
  }

  @ViewBuilder
  private func emptyLabel(_ text: String) -> some View {
    Spacer()
    Text(text).foregroundColor(.secondary)
    Spacer()
  }

  // MARK: – Detalle de requisición

  private func reqDetail(_ r: RequisitionItem) -> some View {
    let d = reqDetailData
    return List {
      Section {
        Button("← Compras") { clearSelection() }
      }
      Section("Requisición") {
        detailRow("Título", d?.displayTitle ?? r.displayTitle)
        detailRow("Número", r.reqNumber)
        detailRow("Solicitante", d?.requestedByName ?? r.requestedByName)
        detailRow("Estado", d?.status ?? r.status)
        detailRow("Departamento", d?.departmentName ?? r.departmentName)
        detailRow("Prioridad", d?.priority ?? r.priority)
        if let d {
          detailRow("Requerida para", String(d.requiredDate.prefix(10)))
          detailRow("Aprobó", d.approvedByName)
          detailRow("Motivo rechazo", d.rejectionReason)
        }
      }
      linesSection(d?.items ?? [], estimated: d?.estimatedTotal)
      if let d, !d.description.isEmpty {
        Section("Descripción") { Text(d.description).font(.subheadline) }
      }
      workflowSection
      if let id = r.id, (d?.canDecide ?? r.canDecide) {
        Section("Aprobación") {
          TextField("Motivo rechazo", text: $rejectReason)
          Button("Aprobar") { Task { await approve(id) } }.disabled(actingId != nil)
          Button("Rechazar", role: .destructive) { Task { await reject(id) } }.disabled(actingId != nil)
        }
      }
      if let message {
        Section { Text(message).font(.footnote).foregroundColor(.green) }
      }
    }
    .listStyle(.insetGrouped)
  }

  // MARK: – Detalle de orden de compra

  private func poDetail(_ o: PurchaseOrderItem) -> some View {
    let d = poDetailData
    return List {
      Section {
        Button("← Compras") { clearSelection() }
      }
      // Dos secciones y no una: el `ViewBuilder` de SwiftUI admite como mucho
      // diez vistas por bloque y aquí ya se rozaba el tope.
      Section("Orden de compra") {
        detailRow("Número", d?.displayTitle ?? o.displayTitle)
        detailRow("Proveedor", d?.supplierName ?? o.supplierName)
        detailRow("RFC proveedor", d?.supplierRfc ?? "")
        detailRow("Estado", d?.status ?? o.status)
        detailRow("Fecha", String((d?.orderDate ?? o.createdAt).prefix(10)))
        detailRow("Entrega esperada", String((d?.expectedDate ?? "").prefix(10)))
      }
      Section("Trazabilidad") {
        detailRow("Condiciones de pago", d?.paymentTerms ?? "")
        detailRow("Requisición origen", d?.requisitionNumber ?? "")
        detailRow("Creó", d?.createdByName ?? o.createdByName)
        detailRow("Aprobó", d?.approvedByName ?? "")
        detailRow("Fecha aprobación", String((d?.approvedAt ?? "").prefix(10)))
      }
      if let d {
        Section("Importes") {
          amountRow("Subtotal", d.subtotal)
          amountRow("Impuestos", d.taxAmount)
          amountRow("Total", d.totalAmount, bold: true)
          if !d.currency.isEmpty {
            HStack { Text("Moneda"); Spacer(); Text(d.currency).foregroundColor(.secondary) }
          }
          if d.receiptsCount > 0 {
            HStack {
              Text("Recepciones")
              Spacer()
              Text("\(d.receiptsCount)").foregroundColor(.teal)
            }
          }
        }
      } else if let t = o.totalAmount {
        Section("Importes") { amountRow("Total", t, bold: true) }
      }
      linesSection(d?.items ?? [], showReceived: true)
      if let d, !d.notes.isEmpty {
        Section("Notas") { Text(d.notes).font(.subheadline) }
      }
      workflowSection
      if let id = o.id, d?.canApprove == true {
        Section {
          Button("Aprobar orden") { Task { await approveOrder(id) } }
            .disabled(actingId != nil)
        } header: {
          Text("Aprobación")
        } footer: {
          // El servidor exige `PROCUREMENT_APPROVE`; sin ese permiso la
          // llamada devuelve 403 y aquí se enseña ese error, no un falso "ok".
          Text("Requiere permiso de aprobación de compras.")
            .font(.caption2)
        }
      }
      if let message {
        Section { Text(message).font(.footnote).foregroundColor(.green) }
      }
    }
    .listStyle(.insetGrouped)
  }

  // MARK: – Detalle de recepción

  private func grDetail(_ g: GoodsReceiptItem) -> some View {
    let d = grDetailData
    return List {
      Section {
        Button("← Compras") { clearSelection() }
      }
      Section("Recepción") {
        detailRow("Número", d?.displayTitle ?? g.displayTitle)
        detailRow("Fecha", d?.dateLabel ?? String(g.createdAt.prefix(10)))
        detailRow("Almacén", d?.warehouseName ?? g.warehouseName)
        detailRow("Orden de compra", d?.poNumber ?? g.poNumber)
        detailRow("Proveedor", d?.supplierName ?? "")
        detailRow("Recibió", d?.receivedByName ?? "")
      }
      if let d, d.landedCostTotal > 0 {
        Section {
          amountRow("Flete", d.freightCost)
          amountRow("Seguro", d.insuranceCost)
          amountRow("Aduana", d.customsCost)
          amountRow("Otros", d.otherLandedCost)
          amountRow("Total", d.landedCostTotal, bold: true)
        } header: {
          Text("Landed cost")
        } footer: {
          Text("Se prorratea sobre el costo unitario recibido, así que cambia el valor del inventario.")
            .font(.caption2)
        }
      }
      linesSection(d?.items ?? [], quantityLabel: "Recibido")
      if let d, !d.notes.isEmpty {
        Section("Notas") { Text(d.notes).font(.subheadline) }
      }
    }
    .listStyle(.insetGrouped)
  }

  // MARK: – Detalle de proveedor

  private func supplierDetail(_ s: SupplierItem) -> some View {
    List {
      Section {
        Button("← Compras") { clearSelection() }
      }
      Section("Proveedor") {
        detailRow("Nombre", s.displayName)
        detailRow("RFC", s.rfc)
        detailRow("Descripción", s.description)
        detailRow("API", s.apiUrl)
      }
      if s.missingRfc {
        Section {
          Label(
            "Sin RFC: este proveedor no puede declararse en la DIOT.",
            systemImage: "exclamationmark.triangle"
          )
          .font(.caption).foregroundColor(.orange)
        }
      }
      Section("Evaluaciones") {
        if isLoadingDetail {
          ProgressView().frame(maxWidth: .infinity)
        } else if evaluations.isEmpty {
          Text("Sin evaluaciones registradas.").font(.caption).foregroundColor(.secondary)
        } else {
          ForEach(evaluations, id: \.rowKey) { e in
            VStack(alignment: .leading, spacing: 4) {
              HStack {
                Text(e.dateLabel).font(.caption).foregroundColor(.secondary)
                Spacer()
                Text(String(format: "%.1f", e.overallScore))
                  .font(.subheadline).bold()
                  .foregroundColor(scoreColor(e.overallScore))
              }
              HStack(spacing: 10) {
                scoreChip("Calidad", e.qualityScore)
                scoreChip("Entrega", e.deliveryScore)
                scoreChip("Precio", e.priceScore)
                scoreChip("Servicio", e.serviceScore)
              }
              if !e.notes.isEmpty {
                Text(e.notes).font(.caption2).foregroundColor(.secondary)
              }
            }
            .padding(.vertical, 3)
          }
        }
      }
    }
    .listStyle(.insetGrouped)
  }

  // MARK: – Secciones compartidas

  /// Partidas del documento. Sin ellas el detalle no aporta nada sobre el
  /// listado, así que se dice explícitamente cuándo no llegaron.
  @ViewBuilder
  private func linesSection(
    _ lines: [ProcurementLine],
    showReceived: Bool = false,
    quantityLabel: String = "Cantidad",
    estimated: Double? = nil
  ) -> some View {
    Section("Partidas") {
      if isLoadingDetail && lines.isEmpty {
        ProgressView().frame(maxWidth: .infinity)
      } else if lines.isEmpty {
        Text("Este documento no trae partidas.").font(.caption).foregroundColor(.secondary)
      } else {
        ForEach(lines, id: \.rowKey) { line in
          VStack(alignment: .leading, spacing: 3) {
            Text(line.displayDescription).font(.subheadline)
            if !line.sku.isEmpty {
              Text(line.sku).font(.caption2).foregroundColor(.secondary)
            }
            HStack {
              Text("\(quantityLabel): \(fmtQty(line.quantity))")
                .font(.caption).foregroundColor(.secondary)
              if showReceived && line.quantity > 0 {
                Text("· recibido \(fmtQty(line.receivedQty))")
                  .font(.caption)
                  .foregroundColor(line.isFullyReceived ? .green : .orange)
              }
              Spacer()
              if line.unitPrice > 0 {
                Text(fmtProc(line.total > 0 ? line.total : line.unitPrice * line.quantity))
                  .font(.caption).bold()
              }
            }
          }
          .padding(.vertical, 2)
        }
        if let estimated, estimated > 0 {
          HStack {
            Text("Estimado").bold()
            Spacer()
            Text(fmtProc(estimated)).bold()
          }
        }
      }
    }
  }

  /// Historial de aprobación de la entidad abierta.
  @ViewBuilder
  private var workflowSection: some View {
    if !trail.isEmpty {
      Section("Trámite de aprobación") {
        ForEach(trail, id: \.rowKey) { inst in
          VStack(alignment: .leading, spacing: 4) {
            HStack {
              Text(inst.displayTitle).font(.subheadline).bold()
              Spacer()
              Text(inst.statusLabel).font(.caption2).bold().foregroundColor(.blue)
            }
            if !inst.startedByName.isEmpty {
              Text("Inició: \(inst.startedByName)").font(.caption2).foregroundColor(.secondary)
            }
            ForEach(inst.steps, id: \.rowKey) { step in
              HStack(spacing: 6) {
                Image(systemName: stepIcon(step))
                  .font(.caption2)
                  .foregroundColor(stepColor(step))
                Text(step.displayName).font(.caption)
                Spacer()
                if !step.decidedByName.isEmpty {
                  Text(step.decidedByName).font(.caption2).foregroundColor(.secondary)
                }
                if !step.decidedLabel.isEmpty {
                  Text(step.decidedLabel).font(.caption2).foregroundColor(.secondary)
                }
              }
              if !step.comments.isEmpty {
                Text(step.comments).font(.caption2).foregroundColor(.secondary)
                  .padding(.leading, 18)
              }
            }
          }
          .padding(.vertical, 3)
        }
      }
    }
  }

  @ViewBuilder private func detailRow(_ k: String, _ v: String) -> some View {
    if !v.isEmpty { HStack { Text(k); Spacer(); Text(v).foregroundColor(.secondary) } }
  }

  @ViewBuilder private func amountRow(_ k: String, _ v: Double, bold destacado: Bool = false) -> some View {
    HStack {
      Text(k).fontWeight(destacado ? .bold : .regular)
      Spacer()
      Text(fmtProc(v))
        .fontWeight(destacado ? .bold : .regular)
        .foregroundColor(destacado ? .primary : .secondary)
    }
  }

  @ViewBuilder private func scoreChip(_ label: String, _ value: Int) -> some View {
    VStack(spacing: 1) {
      Text("\(value)").font(.caption2).bold().foregroundColor(scoreColor(Double(value)))
      Text(label).font(.system(size: 9)).foregroundColor(.secondary)
    }
  }

  private func scoreColor(_ v: Double) -> Color {
    if v >= 8 { return .green }
    if v >= 6 { return .orange }
    if v > 0 { return .red }
    return .secondary
  }

  private func stepIcon(_ s: WorkflowApprovalStep) -> String {
    if s.isApproved { return "checkmark.circle.fill" }
    if s.isRejected { return "xmark.circle.fill" }
    return "clock"
  }

  private func stepColor(_ s: WorkflowApprovalStep) -> Color {
    if s.isApproved { return .green }
    if s.isRejected { return .red }
    return .orange
  }

  // MARK: – Carga

  private func clearSelection() {
    selected = nil
    selectedOrder = nil
    selectedReceipt = nil
    selectedSupplier = nil
    reqDetailData = nil
    poDetailData = nil
    grDetailData = nil
    evaluations = []
    trail = []
    isLoadingDetail = false
  }

  private func reload() async {
    isLoading = true
    defer { isLoading = false }
    async let r = ExtraRepository.shared.requisitionItems()
    async let o = ExtraRepository.shared.purchaseOrderItems()
    async let g = ExtraRepository.shared.goodsReceiptItems()
    async let s = ProcurementRepository.shared.suppliers()
    requisitions = await r
    orders = await o
    goodsReceipts = await g
    suppliers = await s
  }

  private func loadRequisitionDetail(_ id: Int64) {
    reqDetailData = nil
    trail = []
    isLoadingDetail = true
    Task { @MainActor in
      async let d = ProcurementRepository.shared.requisition(id: id)
      async let w = ProcurementRepository.shared.workflowForEntity(
        entityType: "REQUISITION", entityId: id
      )
      let (detalle, flujo) = await (d, w)
      reqDetailData = detalle.hasData ? detalle : nil
      trail = flujo
      isLoadingDetail = false
    }
  }

  private func loadOrderDetail(_ id: Int64) {
    poDetailData = nil
    trail = []
    isLoadingDetail = true
    Task { @MainActor in
      async let d = ProcurementRepository.shared.purchaseOrder(id: id)
      async let w = ProcurementRepository.shared.workflowForEntity(
        entityType: "PURCHASE_ORDER", entityId: id
      )
      let (detalle, flujo) = await (d, w)
      poDetailData = detalle.hasData ? detalle : nil
      trail = flujo
      isLoadingDetail = false
    }
  }

  private func loadReceiptDetail(_ id: Int64) {
    grDetailData = nil
    isLoadingDetail = true
    Task { @MainActor in
      let d = await ProcurementRepository.shared.goodsReceipt(id: id)
      grDetailData = d.hasData ? d : nil
      isLoadingDetail = false
    }
  }

  private func loadSupplierEvaluations(_ id: Int64) {
    evaluations = []
    isLoadingDetail = true
    Task { @MainActor in
      evaluations = await ProcurementRepository.shared.supplierEvaluations(supplierId: id)
      isLoadingDetail = false
    }
  }

  // MARK: – Acciones

  private func approve(_ id: Int64) async {
    actingId = id
    defer { actingId = nil }
    do {
      _ = try await OpsRepository.shared.approveRequisition(id: id)
      message = "Requisición aprobada"
      clearSelection()
      await reload()
    } catch { message = error.toUserMessage() }
  }

  private func reject(_ id: Int64) async {
    let reason = rejectReason.trimmingCharacters(in: .whitespaces)
    guard !reason.isEmpty else { message = "Escribe el motivo"; return }
    actingId = id
    defer { actingId = nil }
    do {
      _ = try await OpsRepository.shared.rejectRequisition(id: id, reason: reason)
      message = "Requisición rechazada"
      clearSelection()
      rejectReason = ""
      await reload()
    } catch { message = error.toUserMessage() }
  }

  private func approveOrder(_ id: Int64) async {
    actingId = id
    defer { actingId = nil }
    do {
      _ = try await ProcurementRepository.shared.approvePurchaseOrder(id: id)
      message = "Orden de compra aprobada"
      clearSelection()
      await reload()
    } catch { message = error.toUserMessage() }
  }
}

// MARK: – Formato

private func fmtProc(_ v: Double) -> String {
  let f = NumberFormatter()
  f.numberStyle = .currency
  f.currencyCode = "MXN"
  f.maximumFractionDigits = 2
  return f.string(from: NSNumber(value: v)) ?? "$\(v)"
}

/// Las cantidades vienen como Decimal(14,4): "3.0000" se lee mal en una lista.
private func fmtQty(_ v: Double) -> String {
  if v == v.rounded() { return String(Int(v)) }
  return String(format: "%.2f", v)
}
