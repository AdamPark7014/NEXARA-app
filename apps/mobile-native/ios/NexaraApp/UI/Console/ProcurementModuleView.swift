import SwiftUI

/// Compras — requisiciones, órdenes y recepciones.
struct ProcurementModuleView: View {
  @State private var tab = 0
  @State private var requisitions: [[String: Any]] = []
  @State private var orders: [[String: Any]] = []
  @State private var goodsReceipts: [[String: Any]] = []
  @State private var query = ""
  @State private var isLoading = true
  @State private var message: String?
  @State private var rejectReason = ""
  @State private var actingId: Int64?
  @State private var selected: [String: Any]?

  private var items: [[String: Any]] {
    switch tab {
    case 1: return orders
    case 2: return goodsReceipts
    default: return requisitions
    }
  }

  private var filtered: [[String: Any]] {
    guard !query.isEmpty else { return items }
    let q = query.lowercased()
    return items.filter {
      opsStr($0, "title", "description", "descripcion", "folio", "number", "poNumber").lowercased().contains(q) ||
      opsStr($0, "requestedBy", "solicitante", "vendorName", "supplierName").lowercased().contains(q)
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
      } else if filtered.isEmpty {
        Spacer()
        Text(tab == 2 ? "Sin recepciones de mercancía" : "Sin registros").foregroundColor(.secondary)
        Spacer()
      } else {
        List(filtered.prefix(80), id: \.procId) { row in
          if tab == 0 {
            Button { selected = row } label: { procRow(row) }
          } else {
            procRow(row)
          }
        }
        .listStyle(.plain)
      }
    }
  }

  private func procRow(_ r: [String: Any]) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      let title = opsStr(r, "title", "description", "descripcion", "folio", "number", "poNumber")
      Text(title.isEmpty ? "Registro" : title).font(.headline)
      Text(opsStr(r, "requestedBy", "solicitante", "vendorName", "supplierName", "warehouseName")).font(.caption).foregroundColor(.secondary)
      HStack {
        Text(opsStr(r, "status", "estado")).font(.caption2).bold()
        Spacer()
        Text(String(opsStr(r, "createdAt").prefix(10))).font(.caption2).foregroundColor(.secondary)
      }
    }
    .padding(.vertical, 4)
  }

  private func reqDetail(_ r: [String: Any]) -> some View {
    let id = ConsoleHelpers.mapInt64(r, "id")
    let status = opsStr(r, "status", "estado").uppercased()
    return List {
      Section("Requisición") {
        detailRow("Título", opsStr(r, "title", "description"))
        detailRow("Solicitante", opsStr(r, "requestedBy", "solicitante"))
        detailRow("Estado", opsStr(r, "status", "estado"))
        detailRow("Departamento", opsStr(r, "departmentName"))
      }
      if let id, status == "PENDING" || status == "SUBMITTED" {
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
    async let r = ExtraRepository.shared.requisitions()
    async let o = ExtraRepository.shared.purchaseOrders()
    async let g = ExtraRepository.shared.goodsReceipts()
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

private func opsStr(_ m: [String: Any], _ keys: String...) -> String {
  for k in keys {
    if let v = m[k] {
      let s: String
      if let ss = v as? String { s = ss }
      else if let n = v as? NSNumber { s = n.stringValue }
      else { s = String(describing: v) }
      if !s.isEmpty && s != "null" { return s }
    }
  }
  return ""
}

extension [String: Any] {
  fileprivate var procId: String { "pr-\(self["id"] ?? UUID().uuidString)" }
}
