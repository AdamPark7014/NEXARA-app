import SwiftUI

/// Portal «Mis servicios» — paridad web `tickets/mis-servicios` y Android `PortalServicesScreen`.
struct PortalServicesView: View {
    @State private var loading = true
    @State private var loaded = false
    @State private var error: String?
    @State private var actionError: String?
    @State private var summary: [String: Any] = [:]
    @State private var invoices: [[String: Any]] = []
    @State private var quotes: [[String: Any]] = []
    @State private var downloading: String?
    @State private var pdfItem: PortalPDFItem?
    @State private var xmlItem: PortalXMLItem?

    var body: some View {
        Group {
            if loading && !loaded {
                NxLoadingState(text: "Cargando tus servicios…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error, !loaded {
                NxErrorState(message: error) { Task { await reload() } }
            } else {
                content
            }
        }
        .navigationTitle("Mis servicios")
        .task { await reload() }
        .refreshable { await reload() }
        .sheet(item: $pdfItem) { item in
            NavigationStack { PDFViewerScreen(title: item.title, data: item.data) }
        }
        .sheet(item: $xmlItem) { item in
            PortalXMLShareSheet(item: item)
                .presentationDetents([.medium])
        }
        .alert(
            "No se pudo descargar",
            isPresented: Binding(get: { actionError != nil }, set: { if !$0 { actionError = nil } })
        ) {
            Button("Entendido", role: .cancel) { actionError = nil }
        } message: {
            Text(actionError ?? "")
        }
    }

    private var content: some View {
        List {
            let stats = summary["summary"] as? [String: Any] ?? [:]
            let projects = portalMapList(summary, key: "projects")
            let contracts = portalMapList(summary, key: "contracts")
            let visits = portalMapList(summary, key: "upcomingVisits")
            let tickets = portalMapList(summary, key: "recentTickets")

            if let error {
                Section {
                    NxStaleBanner(message: error) { Task { await reload() } }
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(Color.clear)
                }
            }

            Section {
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: NxSpacing.s) {
                    portalKpi("Proyectos", ConsoleHelpers.mapInt(stats, "activeProjects"), "folder")
                    portalKpi("Contratos", ConsoleHelpers.mapInt(stats, "activeContracts"), "doc.text")
                    portalKpi("Visitas", ConsoleHelpers.mapInt(stats, "upcomingVisits"), "calendar")
                    portalKpi("Tickets abiertos", ConsoleHelpers.mapInt(stats, "openTickets"), "ticket")
                }
                .padding(.vertical, NxSpacing.xs)
                LabeledContent("Tickets resueltos", value: "\(ConsoleHelpers.mapInt(stats, "completionRate"))%")
                LabeledContent("Sucursales", value: "\(ConsoleHelpers.mapInt(stats, "branches"))")
            }

            if !projects.isEmpty {
                Section("Proyectos en ejecución") {
                    ForEach(projects.indices, id: \.self) { idx in
                        let p = projects[idx]
                        let tipo = ConsoleHelpers.mapStr(p, "projectType")
                        HStack(alignment: .top, spacing: NxSpacing.m) {
                            VStack(alignment: .leading, spacing: NxSpacing.xs) {
                                Text(ConsoleHelpers.mapStr(p, "title", "name")).font(.headline)
                                if !tipo.isEmpty {
                                    Text(NxStatusText.label(tipo))
                                        .font(.caption).foregroundStyle(.secondary)
                                }
                            }
                            Spacer(minLength: 0)
                            NxStatusChip(status: ConsoleHelpers.mapStr(p, "status"))
                        }
                        .padding(.vertical, NxSpacing.xxs)
                    }
                }
            }

            if !contracts.isEmpty {
                Section("Contratos") {
                    ForEach(contracts.indices, id: \.self) { idx in
                        let c = contracts[idx]
                        VStack(alignment: .leading, spacing: NxSpacing.xs) {
                            Text(ConsoleHelpers.mapStr(c, "contractNumber")).font(.headline)
                            Text(ConsoleHelpers.mapStr(c, "title"))
                            Text("Respuesta en \(ConsoleHelpers.mapStr(c, "slaResponseHours")) h · solución en \(ConsoleHelpers.mapStr(c, "slaResolutionHours")) h")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        .padding(.vertical, NxSpacing.xxs)
                    }
                }
            }

            if !visits.isEmpty {
                Section("Próximas visitas") {
                    ForEach(visits.indices, id: \.self) { idx in
                        let v = visits[idx]
                        let contract = v["contract"] as? [String: Any] ?? [:]
                        Label {
                            VStack(alignment: .leading, spacing: NxSpacing.xxs) {
                                Text(NxFormat.friendly(iso: ConsoleHelpers.mapStr(v, "scheduledDate")))
                                    .font(.subheadline.weight(.semibold))
                                Text(ConsoleHelpers.mapStr(contract, "title"))
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                        } icon: {
                            Image(systemName: "calendar.badge.clock").foregroundStyle(NxBrand.adaptive)
                        }
                    }
                }
            }

            if !tickets.isEmpty {
                Section("Tickets recientes") {
                    ForEach(tickets.indices, id: \.self) { idx in
                        let t = tickets[idx]
                        VStack(alignment: .leading, spacing: NxSpacing.xxs) {
                            Text(ConsoleHelpers.mapStr(t, "titulo", "title"))
                                .font(.subheadline.weight(.semibold))
                            Text(ConsoleHelpers.mapStr(t, "anNumber"))
                                .font(.caption.monospacedDigit()).foregroundStyle(.secondary)
                        }
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
                    ContentUnavailableView(
                        "Sin servicios",
                        systemImage: "briefcase",
                        description: Text("Tus proyectos, contratos y facturas aparecerán aquí.")
                    )
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    private func invoiceRow(_ inv: [String: Any]) -> some View {
        let id = ConsoleHelpers.mapInt64(inv, "id") ?? 0
        let number = ConsoleHelpers.mapStr(inv, "invoiceNumber", "folio")
        let status = ConsoleHelpers.mapStr(inv, "status")
        let total = portalMoney(ConsoleHelpers.mapStr(inv, "totalAmount"), currency: ConsoleHelpers.mapStr(inv, "currency"))

        return VStack(alignment: .leading, spacing: NxSpacing.s) {
            HStack(alignment: .firstTextBaseline) {
                Text(number.isEmpty ? "Factura" : number).font(.headline)
                Spacer(minLength: NxSpacing.s)
                NxStatusChip(status: status)
            }
            Text(total)
                .font(.title3.weight(.semibold))
                .monospacedDigit()
            HStack {
                Button {
                    Task { await downloadInvoice(id: id, kind: "pdf") }
                } label: {
                    Label(downloading == "inv-\(id)-pdf" ? "Descargando…" : "Ver PDF", systemImage: "doc.richtext")
                }
                .disabled(downloading != nil || id <= 0)
                Button {
                    Task { await downloadInvoice(id: id, kind: "xml") }
                } label: {
                    Label(downloading == "inv-\(id)-xml" ? "Descargando…" : "XML", systemImage: "chevron.left.forwardslash.chevron.right")
                }
                .disabled(downloading != nil || id <= 0)
            }
            .buttonStyle(.bordered)
            .controlSize(.large)
        }
        .padding(.vertical, NxSpacing.xs)
    }

    private func quoteRow(_ q: [String: Any]) -> some View {
        let id = ConsoleHelpers.mapInt64(q, "id") ?? 0
        let number = ConsoleHelpers.mapStr(q, "quoteNumber", "folio")
        let status = ConsoleHelpers.mapStr(q, "status", "estatus")
        let total = portalMoney(ConsoleHelpers.mapStr(q, "total"), currency: "")

        return VStack(alignment: .leading, spacing: NxSpacing.s) {
            HStack(alignment: .firstTextBaseline) {
                Text(number.isEmpty ? "Cotización" : number).font(.headline)
                Spacer(minLength: NxSpacing.s)
                NxStatusChip(status: status)
            }
            Text("Total \(total)")
                .font(.subheadline.weight(.semibold))
                .monospacedDigit()
            Button {
                Task { await downloadQuote(id: id) }
            } label: {
                Label(downloading == "quote-\(id)" ? "Descargando…" : "Ver PDF", systemImage: "doc.richtext")
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .tint(NxBrand.primary)
            .disabled(downloading != nil || id <= 0)
        }
        .padding(.vertical, NxSpacing.xs)
    }

    private func reload() async {
        loading = true
        do {
            let nuevoResumen = try await TicketsRepository.shared.servicesSummary()
            let nuevasFacturas = try await TicketsRepository.shared.portalInvoices()
            let nuevasCotizaciones = try await TicketsRepository.shared.portalQuotes()
            summary = nuevoResumen
            invoices = nuevasFacturas
            quotes = nuevasCotizaciones
            loaded = true
            error = nil
        } catch {
            self.error = error.toUserMessage()
        }
        loading = false
    }

    private func downloadInvoice(id: Int64, kind: String) async {
        guard id > 0 else { return }
        downloading = "inv-\(id)-\(kind)"
        defer { downloading = nil }
        do {
            if kind == "xml" {
                let data = try await TicketsRepository.shared.downloadInvoiceXml(id: id)
                xmlItem = try PortalXMLItem(invoiceId: id, data: data)
            } else {
                let data = try await TicketsRepository.shared.downloadInvoicePdf(id: id)
                pdfItem = PortalPDFItem(title: "Factura \(id)", data: data)
            }
        } catch {
            actionError = error.toUserMessage()
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
            actionError = error.toUserMessage()
        }
    }
}

private func portalMapList(_ summary: [String: Any], key: String) -> [[String: Any]] {
    guard let raw = summary[key] as? [[String: Any]] else { return [] }
    return raw
}

/// Importe del API (texto) en pesos; otra moneda se deja con su código.
private func portalMoney(_ raw: String, currency: String) -> String {
    guard let value = Double(raw) else { return raw.isEmpty ? "—" : raw }
    let code = currency.trimmingCharacters(in: .whitespaces).uppercased()
    if code.isEmpty || code == "MXN" { return NxFormat.mxn(value) }
    return "\(NxFormat.integer(Int(value.rounded()))) \(code)"
}

private func portalKpi(_ label: String, _ value: Int, _ icon: String) -> some View {
    VStack(alignment: .leading, spacing: NxSpacing.xs) {
        Image(systemName: icon)
            .font(.subheadline)
            .foregroundStyle(NxBrand.adaptive)
            .accessibilityHidden(true)
        Text(NxFormat.integer(value))
            .font(.title2.weight(.bold))
            .monospacedDigit()
        Text(label)
            .font(.caption)
            .foregroundStyle(.secondary)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(NxSpacing.m)
    .background(Color(.systemGroupedBackground), in: RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous))
    .accessibilityElement(children: .combine)
}

private struct PortalPDFItem: Identifiable {
    let id = UUID()
    let title: String
    let data: Data
}

/// XML de una factura guardado en un archivo temporal para compartirlo con su nombre.
private struct PortalXMLItem: Identifiable {
    let id = UUID()
    let invoiceId: Int64
    let url: URL

    init(invoiceId: Int64, data: Data) throws {
        self.invoiceId = invoiceId
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("Factura-\(invoiceId).xml")
        try data.write(to: url, options: .atomic)
        self.url = url
    }
}

private struct PortalXMLShareSheet: View {
    let item: PortalXMLItem
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            VStack(spacing: NxSpacing.l) {
                NxIconBadge(systemName: "doc.badge.arrow.up", size: 64, circle: true)
                Text("XML de la factura listo")
                    .font(.headline)
                Text("Compártelo por correo, guárdalo en Archivos o envíalo a tu contador.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                ShareLink(item: item.url) {
                    Label("Compartir XML", systemImage: "square.and.arrow.up")
                }
                .buttonStyle(NxPrimaryButtonStyle())
            }
            .padding(NxSpacing.xl)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cerrar") { dismiss() }
                }
            }
        }
    }
}
