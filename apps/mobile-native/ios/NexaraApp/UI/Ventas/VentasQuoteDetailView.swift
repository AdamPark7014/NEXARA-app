import SwiftUI
import UIKit

/// Detalle de cotización iOS — paridad Android `VentasQuoteDetailScreen`.
struct VentasQuoteDetailView: View {
    let cotizacionId: Int
    let onBack: () -> Void

    @State private var detail: [String: Any]?
    @State private var loading = true
    @State private var error: String?
    @State private var supplierStats: [String: Any]?
    @State private var supplierLoading = false
    @State private var supplierError: String?

    @State private var pdfData: Data?
    @State private var showPdf = false
    @State private var showSend = false
    @State private var sendEmail = ""
    @State private var sendMessage = ""
    @State private var downloading = false
    @State private var sending = false
    @State private var actionMessage: String?

    private var items: [[String: Any]] {
        detail?["items"] as? [[String: Any]] ?? []
    }

    private var folio: String {
        guard let detail else { return "Cotización" }
        return ConsoleHelpers.mapStr(detail, "quoteNumber", "folio")
    }

    private var economics: (cost: Double, sell: Double, margin: Double, marginPct: Double) {
        var cost = 0.0
        var sell = 0.0
        for row in items {
            let qty = max(1, ConsoleHelpers.mapInt(row, "qty", "quantity"))
            let unitCost = ConsoleHelpers.mapDouble(row, "unitCost")
            let unitPrice = ConsoleHelpers.mapDouble(row, "unitPrice", "precio")
            if unitCost > 0 { cost += unitCost * Double(qty) }
            sell += unitPrice * Double(qty)
        }
        cost = round(cost * 100) / 100
        sell = round(sell * 100) / 100
        let margin = round((sell - cost) * 100) / 100
        let marginPct = sell > 0 ? round((margin / sell) * 1000) / 10 : 0
        return (cost, sell, margin, marginPct)
    }

    var body: some View {
        Group {
            if loading {
                VStack(spacing: 12) {
                    Button("← Cotizaciones", action: onBack)
                    ProgressView("Cargando cotización…")
                }
                .padding()
            } else if let error, detail == nil {
                VStack(spacing: 12) {
                    Button("← Cotizaciones", action: onBack)
                    Text(error).font(.caption).foregroundStyle(.red)
                    Button("Reintentar") { Task { await load() } }
                }
                .padding()
            } else if let detail {
                List {
                    Section {
                        Button("← Cotizaciones", action: onBack)
                    }
                    Section("Cotización") {
                        detailRow("Folio", ConsoleHelpers.mapStr(detail, "quoteNumber", "folio"))
                        detailRow("Cliente", ConsoleHelpers.mapStr(detail, "clientName", "cliente"))
                        detailRow("Proyecto", ConsoleHelpers.mapStr(detail, "projectName", "proyecto"))
                        detailRow("Estado", ConsoleHelpers.mapStr(detail, "status", "estatus"))
                        detailRow("Emisión", String(ConsoleHelpers.mapStr(detail, "issueDate", "fecha").prefix(10)))
                        detailRow("Vigencia", String(ConsoleHelpers.mapStr(detail, "validUntil").prefix(10)))
                        let sent = ConsoleHelpers.mapStr(detail, "sentToEmail")
                        if !sent.isEmpty {
                            detailRow("Enviada a", sent)
                        }
                    }
                    Section("Totales") {
                        let subtotal = ConsoleHelpers.mapDouble(detail, "subtotal")
                        let tax = ConsoleHelpers.mapDouble(detail, "taxTotal")
                        let total = ConsoleHelpers.mapDouble(detail, "total")
                        HStack { Text("Subtotal"); Spacer(); Text(fmtMxn(subtotal)) }
                        HStack { Text("IVA"); Spacer(); Text(fmtMxn(tax)) }
                        HStack { Text("Total").font(.headline); Spacer(); Text(fmtMxn(total)).font(.headline) }
                    }
                    let econ = economics
                    if econ.cost > 0 {
                        Section("Resumen de margen") {
                            HStack { Text("Costo proveedor"); Spacer(); Text(fmtMxn(econ.cost)) }
                            HStack { Text("Venta neta"); Spacer(); Text(fmtMxn(econ.sell)) }
                            HStack {
                                Text("Margen")
                                Spacer()
                                Text("\(fmtMxn(econ.margin)) (\(String(format: "%.1f", econ.marginPct))%)")
                                    .fontWeight(.semibold)
                                    .foregroundStyle(econ.marginPct >= 20 ? .green : .orange)
                            }
                        }
                    }
                    Section("Partidas (\(items.count))") {
                        ForEach(items.indices, id: \.self) { idx in
                            let row = items[idx]
                            VStack(alignment: .leading, spacing: 4) {
                                Text(ConsoleHelpers.mapStr(row, "name", "nombre")).font(.subheadline.weight(.semibold))
                                Text(
                                    "\(ConsoleHelpers.mapInt(row, "qty", "quantity")) × \(fmtMxn(ConsoleHelpers.mapDouble(row, "unitPrice", "precio")))"
                                )
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            }
                        }
                    }
                    Section {
                        SupplierStatsSection(
                            stats: supplierStats,
                            loading: supplierLoading,
                            error: supplierError,
                            onRefresh: { Task { await loadSupplierStats() } }
                        )
                    }
                    if downloading {
                        Section {
                            HStack {
                                ProgressView()
                                Text("Preparando PDF…")
                            }
                        }
                    }
                    if let actionMessage {
                        Section {
                            Text(actionMessage).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
                .listStyle(.insetGrouped)
                .safeAreaInset(edge: .bottom) {
                    quoteActionBar
                }
            }
        }
        .task {
            await load()
            await loadSupplierStats()
        }
        .sheet(isPresented: $showPdf) {
            if let pdfData {
                NavigationStack {
                    PDFViewerScreen(title: folio, data: pdfData)
                        .toolbar {
                            ToolbarItem(placement: .topBarLeading) {
                                Button("Cerrar") { showPdf = false }
                            }
                        }
                }
            }
        }
        .sheet(isPresented: $showSend) {
            sendSheet
        }
    }

    private var quoteActionBar: some View {
        HStack(spacing: 10) {
            Menu {
                Button("PDF cliente") { Task { await downloadPdf(internal: false) } }
                Button("PDF interno") { Task { await downloadPdf(internal: true) } }
            } label: {
                Label("PDF", systemImage: "doc.richtext")
            }
            .disabled(downloading)

            Button {
                Task { await downloadPdf(share: true) }
            } label: {
                Label("Compartir", systemImage: "square.and.arrow.up")
            }
            .buttonStyle(.bordered)
            .disabled(downloading)

            Button {
                sendEmail = ConsoleHelpers.mapStr(detail ?? [:], "clientEmail")
                showSend = true
            } label: {
                Label("Enviar", systemImage: "envelope")
            }
            .buttonStyle(.borderedProminent)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(.bar)
    }

    private var sendSheet: some View {
        NavigationStack {
            Form {
                Section("Destinatario") {
                    TextField("Email del cliente", text: $sendEmail)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.emailAddress)
                    TextField("Mensaje (opcional)", text: $sendMessage, axis: .vertical)
                        .lineLimit(3...6)
                }
            }
            .navigationTitle("Enviar cotización")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { showSend = false }
                        .disabled(sending)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(sending ? "Enviando…" : "Enviar") {
                        Task { await sendQuote() }
                    }
                    .disabled(sendEmail.trimmingCharacters(in: .whitespaces).isEmpty || sending)
                }
            }
        }
        .presentationDetents([.medium])
    }

    @ViewBuilder
    private func detailRow(_ label: String, _ value: String) -> some View {
        if !value.isEmpty {
            HStack { Text(label); Spacer(); Text(value).foregroundStyle(.secondary) }
        }
    }

    private func load() async {
        loading = true
        error = nil
        do {
            detail = try await CrmRepository.shared.cotizacionDetail(id: cotizacionId)
            sendEmail = ConsoleHelpers.mapStr(detail ?? [:], "clientEmail")
        } catch let e {
            self.error = e.localizedDescription
            detail = nil
        }
        loading = false
    }

    private func loadSupplierStats() async {
        supplierLoading = true
        supplierError = nil
        do {
            supplierStats = try await SmartQuoteRepository.shared.supplierStats()
        } catch let e {
            supplierError = e.localizedDescription
        }
        supplierLoading = false
    }

    private func downloadPdf(share: Bool, internal internalPdf: Bool = false) async {
        downloading = true
        actionMessage = nil
        do {
            let data = try await CrmRepository.shared.downloadCotizacionPdf(id: cotizacionId, internal: internalPdf)
            if share {
                await sharePdfData(data)
            } else {
                pdfData = data
                showPdf = true
            }
        } catch {
            actionMessage = error.localizedDescription
        }
        downloading = false
    }

    private func sendQuote() async {
        sending = true
        actionMessage = nil
        let email = sendEmail.trimmingCharacters(in: .whitespaces)
        let message = sendMessage.trimmingCharacters(in: .whitespaces)
        do {
            try await CrmRepository.shared.sendCotizacion(
                id: cotizacionId,
                email: email,
                message: message.isEmpty ? nil : message
            )
            showSend = false
            actionMessage = "Cotización enviada a \(email)"
            await load()
        } catch {
            actionMessage = error.localizedDescription
        }
        sending = false
    }

    @MainActor
    private func sharePdfData(_ data: Data) {
        let temp = FileManager.default.temporaryDirectory
            .appendingPathComponent("cotizacion-\(cotizacionId).pdf")
        do {
            try data.write(to: temp)
            let av = UIActivityViewController(activityItems: [temp], applicationActivities: nil)
            guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
                  let root = scene.windows.first?.rootViewController else { return }
            root.present(av, animated: true)
        } catch {
            actionMessage = error.localizedDescription
        }
    }

    private func fmtMxn(_ value: Double) -> String {
        String(format: "$%.2f MXN", value)
    }
}
