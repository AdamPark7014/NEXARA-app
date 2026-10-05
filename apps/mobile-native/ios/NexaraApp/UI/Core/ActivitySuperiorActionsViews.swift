import SwiftUI

/// Actividad sobre la que un superior va a actuar (cancelar o pasar a otro compañero).
struct ActivitySuperiorTarget: Identifiable {
    /// Id de la actividad.
    let id: Int
    let title: String
    let acciones: ActivitySuperiorActions
    /// Además de quienes trae `acciones.personas`, gente que no puede recibirla.
    /// Android solo descarta a `personas`; se deja vacío para igualarlo.
    let excluded: Set<Int>
}

/// Reglas de «Cancelar actividad» y «Pasar a otro compañero» (`ActivitySuperiorRules.kt`).
enum ActivitySuperiorUIRules {
    /// Largo máximo del motivo (mismo `maxLength` que la web; Android `take(400)`).
    static let motivoMaximo = 400

    /// Mismo conteo que el servidor: sin espacios de sobra.
    static func motivoLimpio(_ motivo: String) -> String {
        motivo
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
    }

    static func motivoOk(_ motivo: String, minimo: Int) -> Bool {
        motivoLimpio(motivo).count >= minimo
    }

    /// Quién la deja: quienes ejecutan; si ninguna viene marcada (API vieja o
    /// despacho sin repartir), todas las que se pueden reemplazar.
    static func quienesSalen(_ acciones: ActivitySuperiorActions) -> [ActivitySuperiorPerson] {
        let ejecutan = acciones.personas.filter(\.ejecuta)
        return ejecutan.isEmpty ? acciones.personas : ejecutan
    }

    /// Quién la continúa: gente del tablero que no está ya en la actividad, por nombre.
    static func quienesEntran(_ equipo: [TeamBoardUser], acciones: ActivitySuperiorActions, excluded: Set<Int> = []) -> [TeamBoardUser] {
        let enActividad = Set(acciones.personas.map(\.userId)).union(excluded)
        var vistos = Set<Int>()
        return equipo
            .filter { !enActividad.contains($0.id) && vistos.insert($0.id).inserted }
            .sorted { $0.nombre.lowercased() < $1.nombre.lowercased() }
    }
}

/// «12/10 caracteres mínimo» (11,5; gris si alcanza, rojo si no).
struct CoreMotivoCounter: View {
    let count: Int
    let minimo: Int

    var body: some View {
        Text("\(count)/\(minimo) caracteres mínimo")
            .font(.system(size: 11.5))
            .foregroundStyle(count >= minimo ? NxColors.muted : NxColors.danger)
    }
}

// MARK: - Botones del superior

/// «Pasar a otro compañero» y «Cancelar actividad» (en rojo) como botones de
/// contorno de Material, en una fila que se acomoda (Android `ActivitySuperiorActions`).
/// Solo se pintan si el API dice que quien consulta puede (`acciones.hayAlgo`).
struct ActivitySuperiorActionsBar: View {
    let acciones: ActivitySuperiorActions
    let onPasar: () -> Void
    let onCancelar: () -> Void

    var body: some View {
        if acciones.hayAlgo {
            CoreFlowLayout(spacing: 8) {
                if acciones.puedePasar {
                    Button(action: onPasar) {
                        boton("Pasar a otro compañero", systemImage: "arrow.left.arrow.right")
                    }
                    .buttonStyle(NxPillButtonStyle(fill: .clear, foreground: NxColors.brand, border: NxColors.borderStrong))
                }
                if acciones.puedeCancelar {
                    Button(action: onCancelar) {
                        boton("Cancelar actividad", systemImage: "nosign")
                    }
                    .buttonStyle(NxPillButtonStyle(fill: .clear, foreground: NxColors.danger, border: NxColors.borderStrong))
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func boton(_ texto: String, systemImage: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: systemImage)
                .font(.system(size: 15, weight: .medium))
                .frame(width: 18, height: 18)
                .accessibilityHidden(true)
            Text(texto).font(.system(size: 13, weight: .medium))
        }
    }
}

// MARK: - Cancelar actividad

/// «Cancelar actividad» con motivo (`POST activities/:id/cancelar`). Diálogo como el
/// de Android: queda «Cancelada» con el motivo en el historial.
struct ActivityCancelSheet: View {
    let target: ActivitySuperiorTarget
    let onDone: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var motivo = ""
    @State private var saving = false
    @State private var error: String?

    private var minimo: Int { target.acciones.motivoMinimo }
    private var limpio: String { ActivitySuperiorUIRules.motivoLimpio(motivo) }
    private var motivoOk: Bool { ActivitySuperiorUIRules.motivoOk(motivo, minimo: minimo) }

    var body: some View {
        ActivityDialogSheet(title: "Cancelar actividad", titleWeight: .bold) {
            Text("La actividad quedará como «Cancelada» con tu motivo en el historial. Se avisa a quienes "
                + "la ejecutan, al responsable, a sus jefes y a Christian.")
                .font(.system(size: 13))
                .foregroundStyle(NxColors.muted)
                .fixedSize(horizontal: false, vertical: true)
            ActivityOutlinedField(
                label: "Motivo *",
                text: $motivo,
                placeholder: "Ej. El cliente pospuso el servicio hasta nuevo aviso.",
                minLines: 3,
                enabled: !saving
            )
            CoreMotivoCounter(count: limpio.count, minimo: minimo)
            if let error {
                Text(error)
                    .font(.system(size: 13))
                    .foregroundStyle(NxColors.danger)
                    .fixedSize(horizontal: false, vertical: true)
            }
        } actions: {
            Button("Volver") { dismiss() }
                .buttonStyle(ActivityDialogTextButtonStyle())
                .disabled(saving)
            Button(saving ? "Cancelando…" : "Cancelar actividad") {
                Task { await save() }
            }
            .buttonStyle(NxPillButtonStyle(fill: NxColors.danger, foreground: .white))
            .disabled(saving || !motivoOk)
        }
        .interactiveDismissDisabled(saving)
        .onChange(of: motivo) { _, value in
            if value.count > ActivitySuperiorUIRules.motivoMaximo {
                motivo = String(value.prefix(ActivitySuperiorUIRules.motivoMaximo))
            }
        }
    }

    @MainActor
    private func save() async {
        guard motivoOk else { return }
        saving = true
        error = nil
        defer { saving = false }
        do {
            try await CoreRepository.shared.cancelActivity(activityId: target.id, motivo: limpio)
            onDone("La actividad quedó cancelada. Se avisó al equipo, a sus jefes y a Christian.")
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
    @State private var para: TeamBoardUser?
    @State private var equipo: [TeamBoardUser]?
    @State private var equipoError: String?
    @State private var motivo = ""
    @State private var saving = false
    @State private var error: String?

    private var salen: [ActivitySuperiorPerson] { ActivitySuperiorUIRules.quienesSalen(target.acciones) }
    private var entran: [TeamBoardUser] {
        ActivitySuperiorUIRules.quienesEntran(equipo ?? [], acciones: target.acciones, excluded: target.excluded)
    }
    private var minimo: Int { target.acciones.motivoMinimo }
    private var limpio: String { ActivitySuperiorUIRules.motivoLimpio(motivo) }
    private var listo: Bool {
        deUsuarioId != nil && para != nil && ActivitySuperiorUIRules.motivoOk(motivo, minimo: minimo)
    }

    var body: some View {
        ActivityDialogSheet(title: "Pasar a otro compañero", titleWeight: .bold) {
            Text("Quien la recibe continúa donde se quedó: ve el avance anterior y toma sus propias fotos "
                + "de entrada y salida. El avance de quien sale queda guardado.")
                .font(.system(size: 13))
                .foregroundStyle(NxColors.muted)
                .fixedSize(horizontal: false, vertical: true)

            Text("Quién la deja *")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(NxColors.muted)
            ForEach(salen) { persona in
                filaQuienSale(persona)
            }

            Text("Compañero que la continúa *")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(NxColors.muted)
            companeroPicker
            if let equipoError {
                Text(equipoError)
                    .font(.system(size: 12))
                    .foregroundStyle(NxColors.danger)
            }
            if equipo != nil && equipoError == nil && entran.isEmpty {
                Text("No encontramos compañeros disponibles para ti.")
                    .font(.system(size: 12))
                    .foregroundStyle(NxColors.muted)
            }

            ActivityOutlinedField(
                label: "Motivo *",
                text: $motivo,
                placeholder: "Ej. Se enfermó y no puede terminar hoy.",
                minLines: 3,
                enabled: !saving
            )
            CoreMotivoCounter(count: limpio.count, minimo: minimo)
            if let error {
                Text(error)
                    .font(.system(size: 13))
                    .foregroundStyle(NxColors.danger)
                    .fixedSize(horizontal: false, vertical: true)
            }
        } actions: {
            Button("Volver") { dismiss() }
                .buttonStyle(ActivityDialogTextButtonStyle())
                .disabled(saving)
            Button(saving ? "Pasando…" : "Pasar actividad") {
                Task { await save() }
            }
            .buttonStyle(NxPillButtonStyle(fill: NxColors.brand, foreground: .white))
            .disabled(saving || !listo)
        }
        .interactiveDismissDisabled(saving)
        .onChange(of: motivo) { _, value in
            if value.count > ActivitySuperiorUIRules.motivoMaximo {
                motivo = String(value.prefix(ActivitySuperiorUIRules.motivoMaximo))
            }
        }
        .task { await loadEquipo() }
    }

    /// Renglón con radio (Android `RadioButton` en una caja de radio 10).
    private func filaQuienSale(_ persona: ActivitySuperiorPerson) -> some View {
        let on = deUsuarioId == persona.userId
        return Button {
            deUsuarioId = persona.userId
        } label: {
            HStack(spacing: 10) {
                ZStack {
                    Circle().strokeBorder(on ? NxColors.brand : NxColors.muted, lineWidth: 2)
                    if on { Circle().fill(NxColors.brand).frame(width: 10, height: 10) }
                }
                .frame(width: 20, height: 20)
                .padding(.leading, 12)
                Text(persona.etiqueta)
                    .font(.system(size: 13))
                    .foregroundStyle(NxColors.fg)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(minHeight: 44)
            .background(on ? NxColors.brandSoft.opacity(0.5) : NxColors.card, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .strokeBorder(on ? NxColors.brand : NxColors.border, lineWidth: 1)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(saving)
        .accessibilityAddTraits(on ? AccessibilityTraits.isSelected : [])
    }

    /// Botón de contorno que abre la lista de compañeros (Android `CompaneroPicker`).
    private var companeroPicker: some View {
        let cargando = equipo == nil
        let etiqueta: String
        if cargando {
            etiqueta = "Cargando compañeros…"
        } else if let para {
            etiqueta = para.nombre.isEmpty ? "Sin nombre" : para.nombre
        } else {
            etiqueta = "Elige al compañero"
        }
        return Menu {
            ForEach(entran) { user in
                Button {
                    para = user
                } label: {
                    Text(user.nombre.isEmpty ? "Sin nombre" : user.nombre)
                    if let puesto = user.puesto, !puesto.isEmpty {
                        Text(puesto)
                    }
                }
            }
        } label: {
            HStack(spacing: 8) {
                Text(etiqueta)
                    .font(.system(size: 13))
                    .foregroundStyle(para != nil ? NxColors.fg : NxColors.muted)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "chevron.down")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(NxColors.muted)
            }
            .padding(.horizontal, 16)
            .frame(maxWidth: .infinity, minHeight: 40)
            .overlay(Capsule().strokeBorder(NxColors.borderStrong, lineWidth: 1))
            .contentShape(Capsule())
        }
        .disabled(saving || cargando || entran.isEmpty)
    }

    @MainActor
    private func loadEquipo() async {
        if deUsuarioId == nil, salen.count == 1 {
            deUsuarioId = salen[0].userId
        }
        do {
            equipo = try await CoreRepository.shared.teamBoard().users
        } catch {
            equipo = []
            equipoError = error.toUserMessage(fallback: "No se pudo cargar tu equipo")
        }
    }

    @MainActor
    private func save() async {
        guard let de = deUsuarioId, let destino = para, listo else { return }
        saving = true
        error = nil
        defer { saving = false }
        do {
            try await CoreRepository.shared.reassignActivity(
                activityId: target.id,
                aUsuarioId: destino.id,
                deUsuarioId: de,
                motivo: limpio
            )
            let corto = ActivityDetailRules.shortName(destino.nombre)
            let quien = corto.isEmpty ? "tu compañero" : corto
            onDone("La actividad pasó a \(quien). Continuará donde se quedó con sus propias fotos de entrada y salida.")
            dismiss()
        } catch {
            self.error = error.toUserMessage(fallback: "No se pudo pasar la actividad")
        }
    }
}

// MARK: - Avance anterior

/// «Avance anterior de <nombre>» dentro de la captura de evidencias (Android
/// `AvanceAnteriorCard`): lo que dejó quien tenía la actividad. Solo lectura.
struct ActivityPreviousProgressCard: View {
    let item: ActivityPreviousProgress
    let coreKind: String?

    @State private var visor: ActivityPreviousPhotos?
    @State private var pdf: CorePdfItem?

    /// «Solo lectura · 40% avanzado · Luis Pérez te la pasó · Motivo: se enfermó. Continúa…».
    private var detalle: String {
        var texto = "Solo lectura · \(Int(min(100, max(0, item.progressPct)).rounded()))% avanzado"
        let por = (item.movidaPor ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if !por.isEmpty { texto += " · \(por) te la pasó" }
        var motivo = (item.motivo ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        while motivo.hasSuffix(".") { motivo.removeLast() }
        if !motivo.isEmpty { texto += " · Motivo: \(motivo)" }
        return texto + ". Continúa desde aquí con tu propia foto de entrada y de salida."
    }

    var body: some View {
        let evidence = item.evidence
        let fotos = evidence.map { fotosDe($0) } ?? []
        let campos = evidence.map { ActivityPreviousForm.entries($0.serviceSheetData, coreKind: coreKind) } ?? []
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Image(systemName: "arrow.left.arrow.right")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(NxColors.azul)
                    .accessibilityHidden(true)
                Text(item.titulo)
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(NxColors.fg)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Text(detalle)
                .font(.system(size: 12.5))
                .foregroundStyle(NxColors.muted)
                .fixedSize(horizontal: false, vertical: true)

            if fotos.isEmpty {
                Text("No alcanzó a subir fotos.")
                    .font(.system(size: 12.5))
                    .foregroundStyle(NxColors.muted)
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(Array(fotos.enumerated()), id: \.offset) { index, foto in
                            Button {
                                visor = ActivityPreviousPhotos(items: fotos, index: index)
                            } label: {
                                AuthenticatedImage(url: foto.url)
                                    .frame(width: 72, height: 72)
                                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                                            .strokeBorder(NxColors.rgb(0xE5E7EB), lineWidth: 1)
                                    )
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel(foto.title)
                        }
                    }
                }
            }

            if let evidence, evidence.hasPdf, let url = evidence.serviceSheetPdfUrl {
                Button {
                    pdf = CorePdfItem(title: "Hoja de servicio", url: url)
                } label: {
                    Label("Ver hoja de servicio que subió", systemImage: "doc.text")
                }
                .buttonStyle(NxPillButtonStyle(fill: .clear, foreground: NxColors.brand, border: NxColors.borderStrong))
            }

            ForEach(Array(campos.enumerated()), id: \.offset) { _, campo in
                HStack(alignment: .top, spacing: 10) {
                    Text(campo.label)
                        .font(.system(size: 12.5))
                        .foregroundStyle(NxColors.muted)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Text(campo.value)
                        .font(.system(size: 12.5))
                        .foregroundStyle(NxColors.fg)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(
            RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous)
                .strokeBorder(NxColors.azul.opacity(0.30), lineWidth: 1)
        )
        .fullScreenCover(item: $visor) { visor in
            CorePhotoViewer(items: visor.items, startIndex: visor.index)
        }
        .sheet(item: $pdf) { item in
            NavigationStack {
                AuthenticatedPDFScreen(title: item.title, url: item.url)
            }
        }
    }

    /// Entrada, en sitio y salida, con el nombre corto de quien las tomó
    /// (Android `CoreActivityRules.fotosDe`).
    private func fotosDe(_ evidence: TeamEvidenceData) -> [CorePhotoItem] {
        let quien = ActivityDetailRules.shortName(item.nombre)
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
        for (index, url) in evidence.photos.enumerated() where !url.trimmingCharacters(in: .whitespaces).isEmpty {
            let geo = evidence.geo(at: index)
            list.append(CorePhotoItem(
                title: "\(quien) · Evidencia \(index + 1)",
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
}

/// Fotos del avance anterior abiertas en el visor, desde la que se tocó.
private struct ActivityPreviousPhotos: Identifiable {
    let id = UUID()
    let items: [CorePhotoItem]
    let index: Int
}

/// Campos capturados con su etiqueta; los viejos (otras claves) también se muestran
/// (Android `CoreActivityRules.formEntries`, hasta 12).
enum ActivityPreviousForm {
    struct Entry {
        let label: String
        let value: String
    }

    static func entries(_ data: JSONValue?, coreKind: String?) -> [Entry] {
        guard let map = data?.objectValue else { return [] }
        let fields = CoreEvidence.formFields(for: coreKind)
        let known = Set(fields.map(\.key))
        let main: [Entry] = fields.compactMap { field in
            guard let value = map[field.key]?.displayText else { return nil }
            return Entry(label: field.label, value: value)
        }
        let extras: [Entry] = map.keys.sorted().compactMap { key in
            guard !known.contains(key), let value = map[key] else { return nil }
            switch value {
            case .object, .array, .null: return nil
            default: break
            }
            guard let text = value.displayText else { return nil }
            if text.lowercased().hasPrefix("data:image") { return Entry(label: humanizeKey(key), value: "Firma capturada") }
            return Entry(label: humanizeKey(key), value: text)
        }
        return Array((main + extras).prefix(12))
    }

    /// «gerenteEncargado» → «Gerente encargado».
    static func humanizeKey(_ key: String) -> String {
        let spaced = key
            .replacingOccurrences(of: "([a-z0-9])([A-Z])", with: "$1 $2", options: .regularExpression)
            .replacingOccurrences(of: "[_-]+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespaces)
            .lowercased()
        return spaced.prefix(1).uppercased() + spaced.dropFirst()
    }
}
