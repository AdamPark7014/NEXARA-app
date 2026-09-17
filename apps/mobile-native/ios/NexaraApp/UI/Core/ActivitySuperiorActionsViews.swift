import SwiftUI

/// Actividad sobre la que un superior va a actuar (cancelar o pasar a otro compañero).
struct ActivitySuperiorTarget: Identifiable {
    /// Id de la actividad.
    let id: Int
    let title: String
    let acciones: ActivitySuperiorActions
    /// Quienes ya están en la actividad (responsable y equipo activo): no pueden recibirla.
    let excluded: Set<Int>
}

/// Largo máximo del motivo en los diálogos de superior (mismo `maxLength` que la web).
private let superiorMotivoMaximo = 400

/// «12/10 caracteres mínimo», en rojo mientras no alcanza.
struct CoreMotivoCounter: View {
    let count: Int
    let minimo: Int

    var body: some View {
        Text("\(count)/\(minimo) caracteres mínimo")
            .font(.caption)
            .foregroundStyle(count >= minimo ? Color.secondary : CorePalette.red)
    }
}

// MARK: - Cancelar actividad

/// «Cancelar actividad» con motivo (`POST activities/:id/cancelar`). Solo superiores de
/// quien la ejecuta; queda «Cancelada» con el motivo en el historial.
struct ActivityCancelSheet: View {
    let target: ActivitySuperiorTarget
    let onDone: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var motivo = ""
    @State private var saving = false
    @State private var error: String?

    private var limpio: String { motivo.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var minimo: Int { target.acciones.motivoMinimo }
    private var motivoOk: Bool { limpio.count >= minimo }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(target.title).font(.headline)
                    Text("La actividad quedará como «Cancelada» con tu motivo en el historial. Se avisa a quienes la ejecutan, al responsable, a sus jefes y a Christian.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                Section {
                    TextField("Ej. El cliente pospuso el servicio hasta nuevo aviso.", text: $motivo, axis: .vertical)
                        .lineLimit(3...6)
                        .disabled(saving)
                } header: {
                    Text("Motivo")
                } footer: {
                    CoreMotivoCounter(count: limpio.count, minimo: minimo)
                }

                if let error {
                    Section {
                        Text(error).foregroundStyle(CorePalette.red)
                    }
                }

                Section {
                    Button(role: .destructive) {
                        Task { await save() }
                    } label: {
                        Label(saving ? "Cancelando…" : "Cancelar actividad", systemImage: "xmark.circle")
                            .frame(maxWidth: .infinity)
                    }
                    .disabled(saving || !motivoOk)
                }
            }
            .navigationTitle("Cancelar actividad")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Volver") { dismiss() }
                        .disabled(saving)
                }
            }
            .interactiveDismissDisabled(saving)
            .onChange(of: motivo) { _, value in
                if value.count > superiorMotivoMaximo { motivo = String(value.prefix(superiorMotivoMaximo)) }
            }
        }
    }

    @MainActor
    private func save() async {
        guard motivoOk else {
            error = "Escribe el motivo de la cancelación (mínimo \(minimo) caracteres)"
            return
        }
        saving = true
        error = nil
        defer { saving = false }
        do {
            try await CoreRepository.shared.cancelActivity(activityId: target.id, motivo: limpio)
            onDone("La actividad quedó cancelada. Avisamos al equipo, a sus jefes y a Christian.")
            dismiss()
        } catch {
            self.error = error.toUserMessage(fallback: "No se pudo cancelar la actividad")
        }
    }
}

// MARK: - Pasar a otro compañero

/// «Pasar a otro compañero» (`POST activities/:id/reasignar`): quien la deja sale con su
/// avance guardado y quien entra continúa con sus propias fotos de entrada y salida.
/// Los compañeros salen del mismo tablero con el que se asignan actividades (`GET me/board`).
struct ActivityReassignSheet: View {
    let target: ActivitySuperiorTarget
    let onDone: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var deUsuarioId: Int?
    @State private var aUsuarioId: Int?
    @State private var motivo = ""
    @State private var roster: [TeamBoardUser] = []
    @State private var loadingRoster = true
    @State private var saving = false
    @State private var error: String?

    private var personas: [ActivitySuperiorPerson] { target.acciones.personas }
    private var limpio: String { motivo.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var minimo: Int { target.acciones.motivoMinimo }
    private var motivoOk: Bool { limpio.count >= minimo }
    private var ready: Bool { motivoOk && deUsuarioId != nil && aUsuarioId != nil }

    private var candidatos: [TeamBoardUser] {
        let enActividad = target.excluded.union(personas.map(\.userId))
        return roster
            .filter { !enActividad.contains($0.id) }
            .sorted { $0.nombre.localizedCaseInsensitiveCompare($1.nombre) == .orderedAscending }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(target.title).font(.headline)
                    Text("Quien la recibe continúa donde se quedó: ve el avance anterior y toma sus propias fotos de entrada y salida. El avance de quien sale queda guardado.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                Section {
                    Picker("Quién la deja", selection: $deUsuarioId) {
                        Text("Elige a la persona").tag(Int?.none)
                        ForEach(personas) { persona in
                            Text(persona.etiqueta).tag(Int?.some(persona.userId))
                        }
                    }
                    .disabled(saving)

                    Picker("Quién la continúa", selection: $aUsuarioId) {
                        Text(loadingRoster ? "Cargando compañeros…" : "Elige al compañero").tag(Int?.none)
                        ForEach(candidatos) { user in
                            Text(user.nombre).tag(Int?.some(user.id))
                        }
                    }
                    .pickerStyle(.navigationLink)
                    .disabled(saving || loadingRoster)

                    if !loadingRoster && candidatos.isEmpty {
                        Text("No encontramos compañeros disponibles para ti.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Section {
                    TextField("Ej. Se enfermó y no puede terminar hoy.", text: $motivo, axis: .vertical)
                        .lineLimit(3...6)
                        .disabled(saving)
                } header: {
                    Text("Motivo")
                } footer: {
                    CoreMotivoCounter(count: limpio.count, minimo: minimo)
                }

                if let error {
                    Section {
                        Text(error).foregroundStyle(CorePalette.red)
                    }
                }

                Section {
                    Button {
                        Task { await save() }
                    } label: {
                        Label(saving ? "Pasando…" : "Pasar actividad", systemImage: "arrow.left.arrow.right")
                            .frame(maxWidth: .infinity)
                    }
                    .disabled(saving || !ready)
                }
            }
            .navigationTitle("Pasar a otro compañero")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Volver") { dismiss() }
                        .disabled(saving)
                }
            }
            .interactiveDismissDisabled(saving)
            .onChange(of: motivo) { _, value in
                if value.count > superiorMotivoMaximo { motivo = String(value.prefix(superiorMotivoMaximo)) }
            }
            .task { await loadRoster() }
        }
    }

    @MainActor
    private func loadRoster() async {
        if deUsuarioId == nil, personas.count == 1 {
            deUsuarioId = personas[0].userId
        }
        loadingRoster = true
        defer { loadingRoster = false }
        do {
            roster = try await CoreRepository.shared.teamBoard().users
        } catch {
            roster = []
            self.error = error.toUserMessage(fallback: "No se pudieron cargar los compañeros")
        }
    }

    @MainActor
    private func save() async {
        guard let de = deUsuarioId else {
            error = "Elige a la persona que la deja"
            return
        }
        guard let a = aUsuarioId else {
            error = "Elige al compañero que la va a continuar"
            return
        }
        guard motivoOk else {
            error = "Escribe por qué la pasas a otro compañero (mínimo \(minimo) caracteres)"
            return
        }
        saving = true
        error = nil
        defer { saving = false }
        do {
            try await CoreRepository.shared.reassignActivity(
                activityId: target.id,
                aUsuarioId: a,
                deUsuarioId: de,
                motivo: limpio
            )
            let nuevo = roster.first(where: { $0.id == a })?.nombre ?? "tu compañero"
            onDone("La actividad pasó a \(nuevo). Continuará donde se quedó con sus propias fotos de entrada y salida.")
            dismiss()
        } catch {
            self.error = error.toUserMessage(fallback: "No se pudo pasar la actividad")
        }
    }
}

// MARK: - Avance anterior

/// «Avance anterior de <nombre>» dentro de la captura de evidencias: lo que dejó quien
/// tenía la actividad. Solo lectura.
struct ActivityPreviousProgressCard: View {
    let item: ActivityPreviousProgress
    let coreKind: String?

    @State private var photo: CorePhotoItem?
    @State private var pdf: CorePdfItem?

    private var reasignada: String? {
        let when = CoreFormat.when(item.reasignadaAt)
        let by = (item.movidaPor ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let parts = [by.isEmpty ? nil : "Reasignada por \(by)", when].compactMap { $0 }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    private var motivo: String? {
        let text = (item.motivo ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return text.isEmpty ? nil : text
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Image(systemName: "arrow.left.arrow.right.circle.fill")
                    .foregroundStyle(CorePalette.purple)
                Text(item.titulo).font(.subheadline.weight(.bold))
                Spacer(minLength: 4)
                CoreChip(icon: "lock", text: "Solo lectura")
            }
            if let reasignada {
                Text(reasignada).font(.caption).foregroundStyle(.secondary)
            }
            if let motivo {
                NxIconText(systemName: "text.bubble", text: "Motivo: \(motivo)")
                    .font(.caption)
            }
            CoreProgressBar(percent: item.progressPct)

            if let evidence = item.evidence {
                steps(evidence)
                photos(evidence)
                form(evidence)
                if evidence.hasPdf, let url = evidence.serviceSheetPdfUrl {
                    Button {
                        pdf = CorePdfItem(title: "Hoja de servicio de \(CoreFormat.shortName(item.nombre))", url: url)
                    } label: {
                        Label("Ver hoja de servicio", systemImage: "doc.richtext")
                    }
                    .buttonStyle(.bordered)
                    .font(.caption)
                }
            } else {
                Text("No alcanzó a subir evidencia.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Text("Tú tomas tus propias fotos de entrada y salida.")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .coreCard(highlight: CorePalette.purple.opacity(0.35))
        .fullScreenCover(item: $photo) { item in
            CorePhotoViewer(item: item)
        }
        .sheet(item: $pdf) { item in
            NavigationStack {
                AuthenticatedPDFScreen(title: item.title, url: item.url)
            }
        }
    }

    private func steps(_ evidence: TeamEvidenceData) -> some View {
        CoreFlowLayout {
            ForEach(CoreEvidence.steps(for: coreKind), id: \.self) { step in
                let done = evidence.stepTime(step) != nil
                CoreChip(
                    icon: done ? "checkmark.circle.fill" : "circle",
                    text: CoreEvidence.label(step),
                    color: done ? CorePalette.green : nil
                )
            }
        }
    }

    /// Entrada, fotos en sitio y salida, en ese orden; tocar abre la foto en grande.
    @ViewBuilder
    private func photos(_ evidence: TeamEvidenceData) -> some View {
        let list = photoItems(evidence)
        if !list.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(list) { entry in
                        Button {
                            photo = entry
                        } label: {
                            AuthenticatedImage(url: entry.url)
                                .frame(width: 64, height: 64)
                                .clipShape(RoundedRectangle(cornerRadius: 10))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(entry.title)
                    }
                }
            }
        }
    }

    private func photoItems(_ evidence: TeamEvidenceData) -> [CorePhotoItem] {
        let quien = CoreFormat.shortName(item.nombre)
        var list: [CorePhotoItem] = []
        if evidence.hasEntry, let url = evidence.entryPhotoUrl {
            list.append(CorePhotoItem(
                title: "\(quien) · Entrada",
                url: url,
                latitude: evidence.entryLatitude?.value,
                longitude: evidence.entryLongitude?.value,
                time: evidence.entryPhotoUploadedAt
            ))
        }
        for (index, url) in evidence.photos.enumerated() {
            let geo = evidence.geo(at: index)
            list.append(CorePhotoItem(
                title: "\(quien) · Foto \(index + 1)",
                url: url,
                latitude: geo?.latitude?.value,
                longitude: geo?.longitude?.value,
                time: geo?.capturedAt ?? evidence.evidencePhotosUploadedAt
            ))
        }
        if evidence.hasExit, let url = evidence.exitPhotoUrl {
            list.append(CorePhotoItem(
                title: "\(quien) · Salida",
                url: url,
                latitude: evidence.exitLatitude?.value,
                longitude: evidence.exitLongitude?.value,
                time: evidence.exitPhotoUploadedAt
            ))
        }
        return list
    }

    @ViewBuilder
    private func form(_ evidence: TeamEvidenceData) -> some View {
        let values = evidence.serviceSheetData?.objectValue ?? [:]
        let fields = CoreEvidence.formFields(for: coreKind).filter { values[$0.key]?.displayText != nil }
        if !fields.isEmpty {
            VStack(alignment: .leading, spacing: 4) {
                ForEach(fields) { field in
                    if let value = values[field.key]?.displayText {
                        (Text("\(field.label): ").bold() + Text(value))
                            .font(.caption)
                    }
                }
            }
        }
    }
}
