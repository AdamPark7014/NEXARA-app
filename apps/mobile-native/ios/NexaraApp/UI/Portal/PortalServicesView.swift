import SwiftUI

/// Portal «Mis servicios» — paridad web `tickets/mis-servicios` y Android `PortalServicesScreen`.
struct PortalServicesView: View {
    @State private var loading = true
    @State private var error: String?
    @State private var summary: [String: Any] = [:]
    @State private var invoices: [[String: Any]] = []
    @State private var quotes: [[String: Any]] = []
    @State private var downloading: String?
    @State private var pdfItem: PortalPDFItem?

    var body: some View {
        Group {
            if loading {
                ProgressView("Cargando mis servicios…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error {
                ContentUnavailableView("No se pudo cargar", systemImage: "exclamationmark.triangle", description: Text(error))
                    .overlay(alignment: .bottom) {
                        Button("Reintentar") { Task { await reload() } }
                            .padding(.bottom, 40)
                    }
            } else {
                List {
                    let stats = summary["summary"] as? [String: Any] ?? [:]
                    let projects = portalMapList(summary, key: "projects")
                    let contracts = portalMapList(summary, key: "contracts")
                    let visits = portalMapList(summary, key: "upcomingVisits")
                    let tickets = portalMapList(summary, key: "recentTickets")

                    Section {
                        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                            portalKpi("Proyectos", "\(ConsoleHelpers.mapInt(stats, "activeProjects"))")
                            portalKpi("Contratos", "\(ConsoleHelpers.mapInt(stats, "activeContracts"))")
                            portalKpi("Visitas", "\(ConsoleHelpers.mapInt(stats, "upcomingVisits"))")
                            portalKpi("Tickets", "\(ConsoleHelpers.mapInt(stats, "openTickets"))")
                        }
                        Text("Cierre \(ConsoleHelpers.mapInt(stats, "completionRate"))% · Sucursales \(ConsoleHelpers.mapInt(stats, "branches"))")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    if !projects.isEmpty {
                        Section("Proyectos en ejecución") {
                            ForEach(projects.indices, id: \.self) { idx in
                                let p = projects[idx]
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(ConsoleHelpers.mapStr(p, "title", "name")).font(.headline)
                                    Text("\(ConsoleHelpers.mapStr(p, "status")) · \(ConsoleHelpers.mapStr(p, "projectType"))")
                                        .font(.caption).foregroundStyle(.secondary)
                                }
                            }
                        }
                    }

                    if !contracts.isEmpty {
                        Section("Contratos") {
                            ForEach(contracts.indices, id: \.self) { idx in
                                let c = contracts[idx]
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(ConsoleHelpers.mapStr(c, "contractNumber")).font(.headline)
                                    Text(ConsoleHelpers.mapStr(c, "title"))
                                    Text("SLA \(ConsoleHelpers.mapStr(c, "slaResponseHours"))h / \(ConsoleHelpers.mapStr(c, "slaResolutionHours"))h")
                                        .font(.caption).foregroundStyle(.secondary)
                                }
                            }
                        }
                    }

                    if !visits.isEmpty {
                        Section("Próximas visitas") {
                            ForEach(visits.indices, id: \.self) { idx in
                                let v = visits[idx]
                                let contract = v["contract"] as? [String: Any] ?? [:]
                                Text("\(String(ConsoleHelpers.mapStr(v, "scheduledDate").prefix(16))) · \(ConsoleHelpers.mapStr(contract, "title"))")
                            }
                        }
                    }

                    if !tickets.isEmpty {
                        Section("Tickets recientes") {
                            ForEach(tickets.indices, id: \.self) { idx in
                                let t = tickets[idx]
                                Text("\(ConsoleHelpers.mapStr(t, "anNumber")) · \(ConsoleHelpers.mapStr(t, "titulo", "title"))")
                            }
                        }
                    }

                    if !invoices.isEmpty {
                        Section("Facturas") {
                            ForEach(invoices.indices, id: \.self) { idx in
                                invoiceRow(invoices[idx])
                            }
                        }
                    }

                    if !quotes.isEmpty {
                        Section("Cotizaciones") {
                            ForEach(quotes.indices, id: \.self) { idx in
                                quoteRow(quotes[idx])
                            }
                        }
                    }

                    if invoices.isEmpty && quotes.isEmpty && projects.isEmpty && contracts.isEmpty {
                        Section {
                            ContentUnavailableView("Sin servicios", systemImage: "briefcase", description: Text("Tus proyectos y documentos aparecerán aquí."))
                        }
                    }
                }
                .listStyle(.insetGrouped)
            }
        }
        .navigationTitle("Mis servicios")
        .task { await reload() }
        .refreshable { await reload() }
        .sheet(item: $pdfItem) { item in
            NavigationStack { PDFViewerScreen(title: item.title, data: item.data) }
        }
    }

    private func invoiceRow(_ inv: [String: Any]) -> some View {
        let id = ConsoleHelpers.mapInt64(inv, "id") ?? 0
        let number = ConsoleHelpers.mapStr(inv, "invoiceNumber", "folio")
        let status = ConsoleHelpers.mapStr(inv, "status")
        let total = ConsoleHelpers.mapStr(inv, "totalAmount")
        let currency = ConsoleHelpers.mapStr(inv, "currency").isEmpty ? "MXN" : ConsoleHelpers.mapStr(inv, "currency")

        return VStack(alignment: .leading, spacing: 8) {
            Text(number.isEmpty ? "Factura" : number).font(.headline)
            Text("\(status) · \(total) \(currency)").font(.caption).foregroundStyle(.secondary)
            HStack {
                Button("PDF") { Task { await downloadInvoice(id: id, kind: "pdf") } }
                    .disabled(downloading != nil || id <= 0)
                Button("XML") { Task { await downloadInvoice(id: id, kind: "xml") } }
                    .disabled(downloading != nil || id <= 0)
            }
            .buttonStyle(.bordered)
        }
        .padding(.vertical, 4)
    }

    private func quoteRow(_ q: [String: Any]) -> some View {
        let id = ConsoleHelpers.mapInt64(q, "id") ?? 0
        let number = ConsoleHelpers.mapStr(q, "quoteNumber", "folio")
        let status = ConsoleHelpers.mapStr(q, "status", "estatus")
        let total = ConsoleHelpers.mapStr(q, "total")

        return VStack(alignment: .leading, spacing: 8) {
            Text(number.isEmpty ? "Cotización" : number).font(.headline)
            Text("\(status) · Total \(total)").font(.caption).foregroundStyle(.secondary)
            Button(downloading == "quote-\(id)" ? "…" : "Descargar PDF") {
                Task { await downloadQuote(id: id) }
            }
            .buttonStyle(.borderedProminent)
            .disabled(downloading != nil || id <= 0)
        }
        .padding(.vertical, 4)
    }

    private func reload() async {
        loading = true
        error = nil
        do {
            summary = try await TicketsRepository.shared.servicesSummary()
            invoices = try await TicketsRepository.shared.portalInvoices()
            quotes = try await TicketsRepository.shared.portalQuotes()
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }

    private func downloadInvoice(id: Int64, kind: String) async {
        guard id > 0 else { return }
        downloading = "inv-\(id)-\(kind)"
        defer { downloading = nil }
        do {
            let data = try await (kind == "xml"
                ? TicketsRepository.shared.downloadInvoiceXml(id: id)
                : TicketsRepository.shared.downloadInvoicePdf(id: id))
            if kind == "pdf" {
                pdfItem = PortalPDFItem(title: "Factura \(id)", data: data)
            }
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func downloadQuote(id: Int64) async {
        guard id > 0 else { return }
        downloading = "quote-\(id)"
        defer { downloading = nil }
        do {
            let data = try await TicketsRepository.shared.downloadQuotePdf(id: id)
            pdfItem = PortalPDFItem(title: "Cotización \(id)", data: data)
        } catch {
            self.error = error.localizedDescription
        }
    }
}

private func portalMapList(_ summary: [String: Any], key: String) -> [[String: Any]] {
    guard let raw = summary[key] as? [[String: Any]] else { return [] }
    return raw
}

private func portalKpi(_ label: String, _ value: String) -> some View {
    VStack(spacing: 2) {
        Text(value).font(.headline).bold()
        Text(label).font(.caption2).foregroundStyle(.secondary)
    }
    .frame(maxWidth: .infinity)
    .padding(8)
    .background(Color(.secondarySystemGroupedBackground))
    .clipShape(RoundedRectangle(cornerRadius: 8))
}

private struct PortalPDFItem: Identifiable {
    let id = UUID()
    let title: String
    let data: Data
}
