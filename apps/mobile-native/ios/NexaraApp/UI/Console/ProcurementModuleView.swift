import SwiftUI

/// Compras — requisiciones, órdenes y recepciones (tipadas).
struct ProcurementModuleView: View {
  @State private var tab = 0
  @State private var requisitions: [RequisitionItem] = []
  @State private var orders: [PurchaseOrderItem] = []
  @State private var goodsReceipts: [GoodsReceiptItem] = []
  @State private var query = ""
  @State private var isLoading = true
  @State private var message: String?
  @State private var rejectReason = ""
  @State private var actingId: Int64?
  @State private var selected: RequisitionItem?

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

  var body: some View {
    Group {
      if let s = selected, tab == 0 { reqDetail(s) } else { listBody }
    }
    .navigationTitle("Compras")
    .task { await reload() }
    .refreshable { await reload() }
  }

  private var listBody: some View {
    VStack(spacing: 0) {
      Picker("Sección", selection: $tab) {
        Text("Requisiciones").tag(0)
        Text("Órdenes").tag(1)
        Text("Recepciones").tag(2)
      }
      .pickerStyle(.segmented)
      .padding()
      .onChange(of: tab) { _ in selected = nil }

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
        case 1:
          if filteredOrders.isEmpty {
            emptyLabel("Sin registros")
          } else {
            List(filteredOrders.prefix(80), id: \.rowKey) { r in
              VStack(alignment: .leading, spacing: 4) {
                Text(r.displayTitle).font(.headline)
                Text(r.supplierName).font(.caption).foregroundColor(.secondary)
                HStack {
                  Text(r.status).font(.caption2).bold()
                  Spacer()
                  Text(String(r.createdAt.prefix(10))).font(.caption2).foregroundColor(.secondary)
                }
              }
              .padding(.vertical, 4)
            }
            .listStyle(.plain)
          }
        case 2:
          if filteredReceipts.isEmpty {
            emptyLabel("Sin recepciones de mercancía")
          } else {
            List(filteredReceipts.prefix(80), id: \.rowKey) { r in
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
            .listStyle(.plain)
          }
        default:
          if filteredRequisitions.isEmpty {
            emptyLabel("Sin registros")
          } else {
            List(filteredRequisitions.prefix(80), id: \.rowKey) { r in
              Button { selected = r } label: {
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
      }
    }
  }

  @ViewBuilder
  private func emptyLabel(_ text: String) -> some View {
    Spacer()
    Text(text).foregroundColor(.secondary)
    Spacer()
  }

  private func reqDetail(_ r: RequisitionItem) -> some View {
    List {
      Section("Requisición") {
        detailRow("Título", r.displayTitle)
        detailRow("Número", r.reqNumber)
        detailRow("Solicitante", r.requestedByName)
        detailRow("Estado", r.status)
        detailRow("Departamento", r.departmentName)
        detailRow("Prioridad", r.priority)
      }
      if let id = r.id, r.canDecide {
        Section("Aprobación") {
          TextField("Motivo rechazo", text: $rejectReason)
          Button("Aprobar") { Task { await approve(id) } }.disabled(actingId != nil)
          Button("Rechazar", role: .destructive) { Task { await reject(id) } }.disabled(actingId != nil)
        }
      }
      Button("Volver") { selected = nil }
    }
  }

  @ViewBuilder private func detailRow(_ k: String, _ v: String) -> some View {
    if !v.isEmpty { HStack { Text(k); Spacer(); Text(v).foregroundColor(.secondary) } }
  }

  private func reload() async {
    isLoading = true
    defer { isLoading = false }
    async let r = ExtraRepository.shared.requisitionItems()
    async let o = ExtraRepository.shared.purchaseOrderItems()
    async let g = ExtraRepository.shared.goodsReceiptItems()
    requisitions = await r
    orders = await o
    goodsReceipts = await g
  }

  private func approve(_ id: Int64) async {
    actingId = id
    defer { actingId = nil }
    do {
      _ = try await OpsRepository.shared.approveRequisition(id: id)
      message = "Requisición aprobada"
      selected = nil
      await reload()
    } catch { message = error.localizedDescription }
  }

  private func reject(_ id: Int64) async {
    let reason = rejectReason.trimmingCharacters(in: .whitespaces)
    guard !reason.isEmpty else { message = "Escribe el motivo"; return }
    actingId = id
    defer { actingId = nil }
    do {
      _ = try await OpsRepository.shared.rejectRequisition(id: id, reason: reason)
      message = "Requisición rechazada"
      selected = nil
      rejectReason = ""
      await reload()
    } catch { message = error.localizedDescription }
  }
}
