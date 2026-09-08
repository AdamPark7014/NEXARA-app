import SwiftUI

/// Detalle de licitación — GET `tenders/:id`, PATCH `tenders/:id/status`,
/// POST `tenders/:id/promote-opportunity`.
///
/// Por qué existe: la lista de licitaciones sólo pintaba los cuatro campos que
/// trae `tenders`, y ninguno de los dos verbos que de verdad usa un comercial en
/// la calle —mover el estado cuando sale el fallo, y convertir la adjudicada en
/// oportunidad— estaba en el teléfono. Eso sí es trabajo de móvil: se decide en
/// el momento en que se conoce el resultado, no delante del escritorio.
///
/// Lo que NO hace: crear ni editar la licitación entera. El alta pide veinte
/// campos (requisitos técnicos, legales, seis fechas, garantías) y es trabajo de
/// escritorio; se queda en la web a propósito.
struct CrmTenderDetailView: View {
    let tenderId: Int64
    var onBack: (() -> Void)? = nil

    @State private var detail: CrmTenderDetail?
    @State private var loading = true
    @State private var error: String?
    @State private var actionError: String?
    @State private var acting = false

    @State private var showStatusSheet = false
    @State private var pickedStatus = "PROSPECT"
    @State private var competitorDraft = ""
    @State private var awardNotesDraft = ""
    @State private var showPromoteConfirm = false
    @State private var promotedMessage: String?

    var body: some View {
        Group {
            if loading && detail == nil {
                VStack { Spacer(); ProgressView(); Spacer() }
            } else if let detail {
                content(detail)
            } else {
                NxEmptyState(
                    title: "Licitación no disponible",
                    subtitle: error ?? "No se pudo cargar el detalle."
                )
            }
        }
        .navigationTitle("Licitación")
        .navigationBarTitleDisplayMode(.inline)
        .task { await reload() }
        .refreshable { await reload() }
        .sheet(isPresented: $showStatusSheet) { statusSheet }
        .alert("Promover a oportunidad", isPresented: $showPromoteConfirm) {
            Button("Promover") { Task { await promote() } }
            Button("Cancelar", role: .cancel) {}
        } message: {
            Text("Se creará una oportunidad ganada con el monto de la oferta y quedará ligada a esta licitación. No se puede deshacer desde el móvil.")
        }
    }

    // MARK: – Contenido

    @ViewBuilder
    private func content(_ t: CrmTenderDetail) -> some View {
        List {
            if let onBack {
                Section { Button("← Licitaciones", action: onBack) }
            }
            if let actionError {
                Section { Text(actionError).font(.footnote).foregroundColor(.red) }
            }
            if let promotedMessage {
                Section { Text(promotedMessage).font(.footnote).foregroundColor(.green) }
            }

            Section {
                HStack {
                    NxStatusChip(text: CrmTenderStatusCatalog.label(t.status), tone: tone(for: t.status))
                    Spacer()
                    Button(acting ? "Guardando…" : "Cambiar estado") {
                        pickedStatus = t.status.isEmpty ? "PROSPECT" : t.status.uppercased()
                        competitorDraft = t.awardedToCompetitor
                        awardNotesDraft = t.awardNotes
                        showStatusSheet = true
                    }
                    .font(.caption)
                    .disabled(acting)
                }
                if t.canPromote {
                    Button {
                        showPromoteConfirm = true
                    } label: {
                        Label("Promover a oportunidad", systemImage: "arrow.up.forward.app")
                    }
                    .disabled(acting)
                } else if let oppId = t.opportunityId {
                    Label(
                        t.opportunityTitle.isEmpty
                            ? "Oportunidad vinculada #\(oppId)"
                            : "Oportunidad: \(t.opportunityTitle)",
                        systemImage: "link"
                    )
                    .font(.caption)
                    .foregroundColor(.secondary)
                }
            } header: {
                Text(t.displayTitle)
            }

            Section("Convocatoria") {
                tRow("Folio", t.tenderNumber)
                tRow("Tipo", tenderTypeLabel(t.tenderType))
                tRow("Convocante", t.conveningEntity)
                tRow("Contacto", t.conveningContact)
                tRow("Correo", t.conveningEmail)
                tRow("Teléfono", t.conveningPhone)
                tRow("Referencia", t.externalReference)
                tRow("Publicación", t.publicationUrl)
            }

            Section("Montos") {
                tRow("Techo presupuestal", t.budgetCeiling > 0 ? crmMxn(t.budgetCeiling) : "")
                tRow("Nuestra oferta", t.ourBidAmount > 0 ? crmMxn(t.ourBidAmount) : "")
                tRow("Costo estimado", t.estimatedCost > 0 ? crmMxn(t.estimatedCost) : "")
                tRow("Margen esperado", t.expectedMargin != 0 ? crmMxn(t.expectedMargin) : "")
                if t.ourBidAmount > 0 {
                    HStack {
                        Text("Margen %").foregroundColor(.secondary)
                        Spacer()
                        Text(String(format: "%.1f%%", t.marginPercent))
                            .foregroundColor(t.marginPercent < 15 ? .orange : .green)
                    }
                }
                tRow("Garantía", t.guaranteeAmount > 0 ? crmMxn(t.guaranteeAmount) : "")
            }

            Section("Fechas") {
                tRow("Publicación", shortDate(t.publishDate))
                tRow("Límite de preguntas", shortDate(t.questionsDeadline))
                tRow("Entrega de propuesta", shortDate(t.submissionDeadline))
                tRow("Apertura", shortDate(t.openingDate))
                tRow("Fallo", shortDate(t.awardDate))
            }

            if !t.scope.isEmpty || !t.technicalRequirements.isEmpty || !t.legalRequirements.isEmpty
                || !t.description.isEmpty {
                Section("Alcance y requisitos") {
                    tParagraph("Descripción", t.description)
                    tParagraph("Alcance", t.scope)
                    tParagraph("Requisitos técnicos", t.technicalRequirements)
                    tParagraph("Requisitos legales", t.legalRequirements)
                }
            }

            if !t.awardedToCompetitor.isEmpty || !t.awardNotes.isEmpty {
                Section("Fallo") {
                    tRow("Adjudicada a", t.awardedToCompetitor)
                    tParagraph("Notas", t.awardNotes)
                }
            }

            Section("Documentos (\(t.documents.count))") {
                if t.documents.isEmpty {
                    Text("Sin documentos cargados").font(.caption).foregroundColor(.secondary)
                } else {
                    ForEach(t.documents) { doc in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(doc.displayName).font(.subheadline)
                            HStack(spacing: 6) {
                                if !doc.documentType.isEmpty {
                                    Text(doc.documentType).font(.caption2).foregroundColor(.secondary)
                                }
                                if !doc.createdAt.isEmpty {
                                    Text(shortDate(doc.createdAt)).font(.caption2).foregroundColor(.secondary)
                                }
                            }
                            if !doc.notes.isEmpty {
                                Text(doc.notes).font(.caption2).foregroundColor(.secondary).lineLimit(2)
                            }
                        }
                        .padding(.vertical, 2)
                    }
                }
            }

            if !t.events.isEmpty {
                Section("Hitos") {
                    ForEach(t.events) { ev in
                        HStack(alignment: .top) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(ev.displayTitle).font(.subheadline)
                                if !ev.notes.isEmpty {
                                    Text(ev.notes).font(.caption2).foregroundColor(.secondary).lineLimit(2)
                                }
                            }
                            Spacer()
                            Text(shortDate(ev.occursAt)).font(.caption2).foregroundColor(.secondary)
                        }
                    }
                }
            }

            if !t.ownerName.isEmpty {
                Section("Responsable") { Text(t.ownerName) }
            }
        }
        .listStyle(.insetGrouped)
    }

    // MARK: – Cambio de estado

    private var statusSheet: some View {
        NavigationStack {
            Form {
                Section("Estado") {
                    Picker("Estado", selection: $pickedStatus) {
                        ForEach(CrmTenderStatusCatalog.all, id: \.key) { entry in
                            Text(entry.label).tag(entry.key)
                        }
                    }
                    .pickerStyle(.inline)
                    .labelsHidden()
                }
                // Sólo se piden al perder o quedar descalificado: en el resto de
                // estados el backend los ignoraría y ensuciarían el formulario.
                if CrmTenderStatusCatalog.requiresAwardNotes(pickedStatus) {
                    Section("Fallo") {
                        TextField("Adjudicada a (competidor)", text: $competitorDraft)
                        TextField("Notas del fallo", text: $awardNotesDraft, axis: .vertical)
                            .lineLimit(2...5)
                    }
                }
                if let actionError {
                    Section { Text(actionError).font(.footnote).foregroundColor(.red) }
                }
            }
            .navigationTitle("Cambiar estado")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { showStatusSheet = false }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(acting ? "Guardando…" : "Guardar") { Task { await saveStatus() } }
                        .disabled(acting)
                }
            }
        }
    }

    // MARK: – Acciones

    private func reload() async {
        loading = true
        defer { loading = false }
        do {
            detail = try await CrmRepository.shared.tenderDetail(id: tenderId)
            error = nil
        } catch {
            self.error = error.toUserMessage()
        }
    }

    private func saveStatus() async {
        acting = true
        defer { acting = false }
        do {
            // El PATCH responde la licitación sin `documents` ni `events`, así
            // que se descarta y se recarga: quedarse con la respuesta vaciaría
            // esas dos secciones en pantalla.
            _ = try await CrmRepository.shared.setTenderStatus(
                id: tenderId,
                status: pickedStatus,
                awardedToCompetitor: competitorDraft,
                awardNotes: awardNotesDraft
            )
            actionError = nil
            showStatusSheet = false
            await reload()
        } catch {
            actionError = error.toUserMessage()
        }
    }

    private func promote() async {
        acting = true
        defer { acting = false }
        do {
            let opp = try await CrmRepository.shared.promoteTenderToOpportunity(id: tenderId)
            let oppId = StockParse.int64(opp["id"]) ?? 0
            promotedMessage = oppId > 0
                ? "Oportunidad #\(oppId) creada y vinculada."
                : "Oportunidad creada."
            actionError = nil
            await reload()
        } catch {
            actionError = error.toUserMessage()
        }
    }

    // MARK: – Formato

    @ViewBuilder private func tRow(_ label: String, _ value: String) -> some View {
        if !value.isEmpty {
            HStack {
                Text(label).foregroundColor(.secondary)
                Spacer()
                Text(value).multilineTextAlignment(.trailing)
            }
        }
    }

    @ViewBuilder private func tParagraph(_ label: String, _ value: String) -> some View {
        if !value.isEmpty {
            VStack(alignment: .leading, spacing: 2) {
                Text(label).font(.caption).foregroundColor(.secondary)
                Text(value).font(.subheadline)
            }
            .padding(.vertical, 2)
        }
    }

    private func shortDate(_ raw: String) -> String {
        raw.isEmpty ? "" : String(raw.prefix(10))
    }

    private func tenderTypeLabel(_ key: String) -> String {
        switch key.uppercased() {
        case "PUBLIC_GOV": return "Pública / gobierno"
        case "PRIVATE": return "Privada"
        case "INVITATION": return "Por invitación"
        case "CONSOLIDATED": return "Consolidada"
        default: return key
        }
    }

    private func tone(for status: String) -> NxTone {
        switch status.uppercased() {
        case "AWARDED": return .success
        case "LOST", "DISQUALIFIED", "CANCELLED": return .danger
        case "SUBMITTED", "PREPARING_BID": return .info
        case "IN_REVIEW": return .warning
        default: return .neutral
        }
    }
}
