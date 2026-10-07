import SwiftUI

/// Portal «Mis servicios» — paridad web `tickets/mis-servicios` y Android
/// `PortalServicesScreen`: cuatro cifras, proyectos, contratos, visitas, tickets
/// recientes, facturas (PDF / XML) y cotizaciones (PDF), cada cosa en su tarjeta.
///
/// Un refresco fallido con datos ya cargados se avisa con la cinta ámbar encima;
/// nunca se borra lo que ya se veía.
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
    @State private var xmlItem: PortalServicesXMLItem?

    var body: some View {
        Group {
            if !loaded && loading {
                ScrollView {
                    NxSkeletonList(itemCount: 5)
                        .padding(NxSpacing.l)
                }
            } else if !loaded, let error {
                NxErrorState(message: error) { Task { await reload() } }
            } else {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: NxSpacing.listGap) {
                        content
                    }
                    .padding(NxSpacing.l)
                }
                .refreshable { await reload() }
            }
        }
        .nxScreenBackground()
        .task { if !loaded { await reload() } }
        .sheet(item: $pdfItem) { PortalPDFSheet(item: $0) }
        .sheet(item: $xmlItem) { item in
            PortalServicesXMLShareSheet(item: item)
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

    // MARK: Contenido

    private var stats: [String: Any] { summary["summary"] as? [String: Any] ?? [:] }
    private var projects: [[String: Any]] { portalServicesList(summary, key: "projects") }
    private var contracts: [[String: Any]] { portalServicesList(summary, key: "contracts") }
    private var visits: [[String: Any]] { portalServicesList(summary, key: "upcomingVisits") }
    private var recentTickets: [[String: Any]] { portalServicesList(summary, key: "recentTickets") }

    private var isEmpty: Bool {
        projects.isEmpty && contracts.isEmpty && visits.isEmpty && recentTickets.isEmpty
            && invoices.isEmpty && quotes.isEmpty
    }

    @ViewBuilder
    private var content: some View {
        if let error {
            NxRefreshErrorBanner(
                message: error,
                onRetry: { Task { await reload() } },
                onDismiss: { self.error = nil }
            )
        }
        NxSectionHeader(
            title: "Mis servicios",
            subtitle: "Proyectos, contratos, visitas y documentos en un solo lugar."
        )
        NxKpiGrid(items: [
            NxKpi(label: "Proyectos activos", value: portalServicesCount(stats, "activeProjects"), tone: .info),
            NxKpi(label: "Contratos", value: portalServicesCount(stats, "activeContracts"), tone: .brand),
            NxKpi(label: "Próximas visitas", value: portalServicesCount(stats, "upcomingVisits"), tone: .warning),
            NxKpi(label: "Tickets abiertos", value: portalServicesCount(stats, "openTickets"), tone: .danger),
        ])
        projectsSection
        contractsSection
        visitsSection
        ticketsSection
        invoicesSection
        quotesSection
        if isEmpty {
            NxEmptyState(
                title: "Sin servicios",
                subtitle: "Tus proyectos y documentos aparecerán aquí.",
                systemImage: "shippingbox"
            )
        }
    }

    @ViewBuilder
    private var projectsSection: some View {
        if !projects.isEmpty {
            PortalServicesSectionTitle(text: "Proyectos en ejecución")
            ForEach(Array(projects.enumerated()), id: \.offset) { _, p in
                NxPanelShell {
                    PortalServicesTitleWithStatus(
                        title: portalServicesStr(p, "title", "name").portalOr("Proyecto"),
                        status: portalServicesStr(p, "status")
                    )
                    let type = portalServicesStr(p, "projectType")
                    if !type.isEmpty { PortalServicesMeta(text: PortalStatusLabels.label(type)) }
                    let scope = portalServicesStr(p, "scopeSummary")
                    if !scope.isEmpty { PortalServicesBody(text: scope) }
                }
            }
        }
    }

    @ViewBuilder
    private var contractsSection: some View {
        if !contracts.isEmpty {
            PortalServicesSectionTitle(text: "Contratos de mantenimiento")
            ForEach(Array(contracts.enumerated()), id: \.offset) { _, c in
                NxPanelShell {
                    PortalServicesTitleWithStatus(
                        title: portalServicesStr(c, "contractNumber", "title").portalOr("Contrato"),
                        status: nil
                    )
                    let title = portalServicesStr(c, "title")
                    if !title.isEmpty { PortalServicesBody(text: title) }
                    let sla = contractSla(c)
                    if !sla.isEmpty { PortalServicesMeta(text: sla) }
                    let next = portalServicesStr(c, "nextVisitDate")
                    if !next.isEmpty { PortalServicesMeta(text: "Próxima visita: \(PortalFormat.date(next))") }
                }
            }
        }
    }

    @ViewBuilder
    private var visitsSection: some View {
        if !visits.isEmpty {
            PortalServicesSectionTitle(text: "Próximas visitas")
            ForEach(Array(visits.enumerated()), id: \.offset) { _, v in
                NxPanelShell {
                    PortalServicesTitleWithStatus(
                        title: PortalFormat.dateTime(portalServicesStr(v, "scheduledDate")),
                        status: nil
                    )
                    let contract = v["contract"] as? [String: Any] ?? [:]
                    let label = portalServicesStr(contract, "title", "contractNumber")
                    if !label.isEmpty { PortalServicesBody(text: label) }
                }
            }
        }
    }

    @ViewBuilder
    private var ticketsSection: some View {
        if !recentTickets.isEmpty {
            PortalServicesSectionTitle(text: "Tickets recientes")
            ForEach(Array(recentTickets.enumerated()), id: \.offset) { _, t in
                NxPanelShell {
                    PortalServicesTitleWithStatus(
                        title: [portalServicesStr(t, "anNumber"), portalServicesStr(t, "titulo", "title")]
                            .filter { !$0.isEmpty }
                            .joined(separator: " · ")
                            .portalOr("Ticket"),
                        status: portalServicesStr(t, "estatus", "status")
                    )
                }
            }
        }
    }

    @ViewBuilder
    private var invoicesSection: some View {
        if !invoices.isEmpty {
            PortalServicesSectionTitle(text: "Facturas")
            ForEach(Array(invoices.enumerated()), id: \.offset) { _, inv in
                invoiceCard(inv)
            }
        }
    }

    @ViewBuilder
    private var quotesSection: some View {
        if !quotes.isEmpty {
            PortalServicesSectionTitle(text: "Cotizaciones")
            ForEach(Array(quotes.enumerated()), id: \.offset) { _, q in
                quoteCard(q)
            }
        }
    }

    private func contractSla(_ c: [String: Any]) -> String {
        var parts: [String] = []
        let response = portalServicesStr(c, "slaResponseHours")
        if !response.isEmpty { parts.append("Respuesta \(response) h") }
        let resolution = portalServicesStr(c, "slaResolutionHours")
        if !resolution.isEmpty { parts.append("Solución \(resolution) h") }
        let frequency = portalServicesStr(c, "frequency")
        if !frequency.isEmpty { parts.append(PortalStatusLabels.label(frequency)) }
        return parts.joined(separator: " · ")
    }

    private func invoiceCard(_ inv: [String: Any]) -> some View {
        let id = ConsoleHelpers.mapInt64(inv, "id") ?? 0
        let currency = portalServicesStr(inv, "currency").portalOr("MXN")
        return NxPanelShell {
            PortalServicesTitleWithStatus(
                title: portalServicesStr(inv, "invoiceNumber").portalOr("Factura"),
                status: portalServicesStr(inv, "status")
            )
            PortalServicesAmount(text: PortalFormat.money(inv["totalAmount"], currency: currency))
            HStack(spacing: NxSpacing.s) {
                NxSecondaryButton(
                    "PDF",
                    systemImage: "arrow.down.to.line",
                    loading: downloading == "inv-\(id)-pdf",
                    enabled: downloading == nil && id > 0,
                    fullWidth: true
                ) { Task { await downloadInvoice(id: id, kind: "pdf", folio: portalServicesStr(inv, "invoiceNumber")) } }
                NxSecondaryButton(
                    "XML",
                    systemImage: "doc.text",
                    loading: downloading == "inv-\(id)-xml",
                    enabled: downloading == nil && id > 0,
                    fullWidth: true
                ) { Task { await downloadInvoice(id: id, kind: "xml", folio: portalServicesStr(inv, "invoiceNumber")) } }
            }
            .padding(.top, NxSpacing.s)
        }
    }

    private func quoteCard(_ q: [String: Any]) -> some View {
        let id = ConsoleHelpers.mapInt64(q, "id") ?? 0
        let currency = portalServicesStr(q, "currency").portalOr("MXN")
        return NxPanelShell {
            PortalServicesTitleWithStatus(
                title: portalServicesStr(q, "quoteNumber").portalOr("Cotización"),
                status: portalServicesStr(q, "status")
            )
            PortalServicesAmount(text: PortalFormat.money(q["total"], currency: currency))
            NxSecondaryButton(
                "Descargar PDF",
                systemImage: "arrow.down.to.line",
                loading: downloading == "quote-\(id)",
                enabled: downloading == nil && id > 0,
                fullWidth: true
            ) { Task { await downloadQuote(id: id, folio: portalServicesStr(q, "quoteNumber")) } }
            .padding(.top, NxSpacing.s)
        }
    }

    // MARK: Datos

    private func reload() async {
        loading = true
        error = nil
        do {
            let repo = TicketsRepository.shared
            let nuevoResumen = try await repo.servicesSummary()
            let nuevasFacturas = try await repo.portalInvoices()
            let nuevasCotizaciones = try await repo.portalQuotes()
            summary = nuevoResumen
            invoices = nuevasFacturas
            quotes = nuevasCotizaciones
            loaded = true
        } catch {
            self.error = error.toUserMessage(fallback: "No se pudieron cargar tus servicios")
        }
        loading = false
    }

    /// Título del visor = nombre del archivo al guardar o compartir: «Factura F-1024».
    /// Solo «Factura» o «Cotización» hacía que dos PDF se llamaran igual en WhatsApp.
    private static func tituloPdf(_ base: String, folio: String) -> String {
        let limpio = folio.trimmingCharacters(in: .whitespacesAndNewlines)
        return limpio.isEmpty ? base : "\(base) \(limpio)"
    }

    private func downloadInvoice(id: Int64, kind: String, folio: String = "") async {
        guard id > 0, downloading == nil else { return }
        downloading = "inv-\(id)-\(kind)"
        defer { downloading = nil }
        do {
            if kind == "xml" {
                let data = try await TicketsRepository.shared.downloadInvoiceXml(id: id)
                xmlItem = try PortalServicesXMLItem(invoiceId: id, data: data)
            } else {
                let data = try await TicketsRepository.shared.downloadInvoicePdf(id: id)
                pdfItem = PortalPDFItem(title: Self.tituloPdf("Factura", folio: folio), data: data)
            }
        } catch {
            actionError = NxFriendlyError.text(error.toUserMessage())
        }
    }

    private func downloadQuote(id: Int64, folio: String = "") async {
        guard id > 0, downloading == nil else { return }
        downloading = "quote-\(id)"
        defer { downloading = nil }
        do {
            let data = try await TicketsRepository.shared.downloadQuotePdf(id: id)
            pdfItem = PortalPDFItem(title: Self.tituloPdf("Cotización", folio: folio), data: data)
        } catch {
            actionError = NxFriendlyError.text(error.toUserMessage())
        }
    }
}

// MARK: - Piezas (Android `SectionTitle`, `TitleWithStatus`, `Body`, `Meta`, `Amount`)

/// Título de bloque: 14 SemiBold con 8 de aire arriba.
private struct PortalServicesSectionTitle: View {
    let text: String

    var body: some View {
        Text(text)
            .font(NxType.titleSmall)
            .foregroundStyle(NxColors.fg)
            .padding(.top, NxSpacing.s)
            .accessibilityAddTraits(.isHeader)
    }
}

/// Título 14 SemiBold (2 líneas) y el chip de estatus a la derecha.
private struct PortalServicesTitleWithStatus: View {
    let title: String
    let status: String?

    var body: some View {
        HStack(alignment: .center, spacing: NxSpacing.s) {
            Text(title)
                .font(NxType.titleSmall)
                .foregroundStyle(NxColors.fg)
                .lineLimit(2)
                .frame(maxWidth: .infinity, alignment: .leading)
            if let status, !status.isEmpty {
                NxStatusChip(text: PortalStatusLabels.label(status), tone: PortalStatusLabels.tone(status))
            }
        }
    }
}

private struct PortalServicesBody: View {
    let text: String

    var body: some View {
        Text(text)
            .nxTextStyle(.bodyMedium)
            .foregroundStyle(NxColors.fg)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.top, NxSpacing.xs)
    }
}

private struct PortalServicesMeta: View {
    let text: String

    var body: some View {
        Text(text)
            .font(NxType.bodySmall)
            .foregroundStyle(NxColors.muted)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.top, NxSpacing.xxs)
    }
}

private struct PortalServicesAmount: View {
    let text: String

    var body: some View {
        Text(text)
            .font(NxType.titleMedium)
            .foregroundStyle(NxColors.fg)
            .monospacedDigit()
            .padding(.top, NxSpacing.xs)
    }
}

// MARK: - Lectura del resumen

private func portalServicesList(_ summary: [String: Any], key: String) -> [[String: Any]] {
    (summary[key] as? [Any] ?? []).compactMap { $0 as? [String: Any] }
}

/// Android `portalStr`: el primer valor no vacío, recortado.
private func portalServicesStr(_ m: [String: Any], _ keys: String...) -> String {
    for key in keys {
        guard let v = m[key], !(v is NSNull) else { continue }
        let s: String
        if let text = v as? String {
            s = text
        } else if let n = v as? NSNumber {
            s = n.stringValue
        } else {
            s = String(describing: v)
        }
        let trimmed = s.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty && trimmed != "null" { return trimmed }
    }
    return ""
}

/// Android `str(stats, key)`: sin dato «0»; entero sin decimales.
private func portalServicesCount(_ m: [String: Any], _ key: String) -> String {
    guard let v = m[key], !(v is NSNull) else { return "0" }
    if let n = v as? NSNumber {
        let d = n.doubleValue
        return d.truncatingRemainder(dividingBy: 1) == 0 ? String(Int64(d)) : n.stringValue
    }
    return String(describing: v)
}

private extension String {
    /// Kotlin `ifBlank { … }`.
    func portalOr(_ fallback: String) -> String {
        trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? fallback : self
    }
}

// MARK: - XML para compartir

/// XML de una factura guardado en un archivo temporal para compartirlo con su nombre.
private struct PortalServicesXMLItem: Identifiable {
    let id = UUID()
    let invoiceId: Int64
    let url: URL

    init(invoiceId: Int64, data: Data) throws {
        self.invoiceId = invoiceId
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("factura-\(invoiceId).xml")
        try data.write(to: url, options: .atomic)
        self.url = url
    }
}

private struct PortalServicesXMLShareSheet: View {
    let item: PortalServicesXMLItem
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            VStack(spacing: NxSpacing.l) {
                Text("XML guardado")
                    .font(NxType.titleMedium)
                    .foregroundStyle(NxColors.fg)
                Text("Compártelo por correo, guárdalo en Archivos o envíalo a tu contador.")
                    .nxTextStyle(.bodyMedium)
                    .foregroundStyle(NxColors.muted)
                    .multilineTextAlignment(.center)
                ShareLink(item: item.url) {
                    Label("Compartir XML", systemImage: "square.and.arrow.up")
                }
                .buttonStyle(NxPrimaryButtonStyle())
            }
            .padding(NxSpacing.xl)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .nxScreenBackground()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cerrar") { dismiss() }
                }
            }
        }
    }
}
