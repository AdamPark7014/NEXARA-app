import SwiftUI

// Evidencias del equipo por persona y en orden de la cadena: paridad con Android
// `ui/console/activities/TeamEvidenceSection.kt` (+ `CoreActivityRules`, `CoreActivityUi`,
// `ui/common/ProtectedAssets.kt`) y con la web `components/ops/EquipoEvidencias.tsx`.
// La API decide qué ve cada quien (`alcance`) y a quién puede aprobar o devolver
// (`puedoRevisar`); aquí solo se pinta y se manda la revisión.

/// Foto de evidencia a ver en grande.
struct CorePhotoItem: Identifiable {
    let id = UUID()
    let title: String
    let url: String
    var latitude: Double? = nil
    var longitude: Double? = nil
    var time: String? = nil
}

/// Revisión a abrir: a quién, con qué decisión (`aprobar` | `devolver`) y qué pasos ya marcados.
struct TeamEvidenceReviewRequest: Identifiable {
    let id = UUID()
    let member: TeamEvidenceMember
    let decision: String
    var pasos: [String] = []
}

// MARK: - Reglas de pantalla (espejo de `CoreActivityRules` de Android)

enum TeamEvidenceUI {
    /// Etiqueta + color de la web + SF Symbol (Android `CoreActivityRules.Tone` con su `NxGlyph`).
    struct Tone {
        let label: String
        var color: Color? = nil
        var icon: String? = nil
    }

    /// Fotos de una evidencia en el orden del visor: entrada, en sitio, salida
    /// (Android `EvidencePhotoSet`). `labels[i]` es el nombre corto de `items[i]`.
    struct PhotoSet {
        var items: [CorePhotoItem] = []
        var labels: [String] = []
        var entrada: Int? = nil
        var sitio: [Int] = []
        var salida: Int? = nil
    }

    /// Rojo de los errores y de «Salidas de zona» en Android (#B91C1C).
    static let errorRed = NxColors.rgb(0xB91C1C)
    /// Fondo de la miniatura mientras carga (#0F172A).
    static let photoBackdrop = NxColors.rgb(0x0F172A)

    // Nombre de cada foto, igual en miniaturas, visor e historial.
    static let entryLabel = "Entrada"
    static let exitLabel = "Salida"
    static func evidenceLabel(_ index: Int) -> String { "Evidencia \(index + 1)" }

    /// Estado de la actividad según quienes la ejecutan (`teamActivityState`).
    static func teamState(ejecutores: Int, terminaron: Int, aprobadas: Int) -> Tone {
        if ejecutores > 0 && aprobadas >= ejecutores {
            return Tone(label: "Finalizada: todo aprobado", color: CorePalette.green, icon: TeGlyph.approved)
        }
        if ejecutores > 0 && terminaron >= ejecutores {
            return Tone(label: "Por validar", color: CorePalette.orange, icon: TeGlyph.toReview)
        }
        return Tone(label: "En curso", color: CorePalette.blue, icon: TeGlyph.inProgress)
    }

    static func isTeamFinalizada(ejecutores: Int, aprobadas: Int) -> Bool {
        ejecutores > 0 && aprobadas >= ejecutores
    }

    /// Estado de la evidencia de una persona (`memberEstadoUi`).
    static func estado(_ evidence: TeamEvidenceData?) -> Tone? {
        guard let ev = evidence else { return nil }
        if ev.reviewStatus == "APPROVED" {
            return Tone(label: "Aprobada", color: CorePalette.green, icon: TeGlyph.approved)
        }
        if ev.reviewStatus == "REJECTED" {
            return Tone(label: "Corrigiendo", color: CorePalette.orange, icon: TeGlyph.returned)
        }
        if ev.status == CoreEvidence.completed && teHasText(ev.correctionSubmittedAt) {
            return Tone(label: "Corrección por revisar", color: CorePalette.orange, icon: TeGlyph.correction)
        }
        if ev.status == CoreEvidence.completed {
            return Tone(label: "Por revisar", color: CorePalette.orange, icon: TeGlyph.toReview)
        }
        return Tone(label: "En curso", color: CorePalette.blue, icon: TeGlyph.inProgress)
    }

    /// Ya la envió, nadie la ha aprobado ni devuelto y a mí me toca revisarla.
    static func pendingReview(_ member: TeamEvidenceMember) -> Bool {
        guard member.canReview, let ev = member.evidence else { return false }
        return ev.status == CoreEvidence.completed
            && ev.reviewStatus != "APPROVED"
            && ev.reviewStatus != "REJECTED"
    }

    /// Papel en la cadena (`memberRolUi`).
    static func rol(_ member: TeamEvidenceMember) -> Tone {
        if member.splits {
            return Tone(label: "La reparte", color: CorePalette.purple, icon: TeGlyph.dispatch)
        }
        if (member.rol ?? "").uppercased() == "APOYO" {
            return Tone(label: "Apoyo", color: CorePalette.blue, icon: TeGlyph.support)
        }
        return Tone(label: "La ejecuta", color: CorePalette.blue, icon: TeGlyph.executes)
    }

    /// Decisión de una revisión del historial (`reviewDecisionUi`).
    static func decision(_ raw: String?) -> Tone {
        switch raw ?? "" {
        case "APROBADA":
            return Tone(label: "Aprobada", color: CorePalette.green, icon: TeGlyph.approved)
        case "DEVUELTA_TODO":
            return Tone(label: "Devuelta completa", color: CorePalette.red, icon: TeGlyph.returned)
        default:
            return Tone(label: "Devuelta para corregir", color: CorePalette.orange, icon: TeGlyph.returned)
        }
    }

    /// «Luis → Antonio → Alejandro»: quien asignó a la primera persona y luego el equipo.
    static func cadena(_ members: [TeamEvidenceMember]) -> [String] {
        let crudos: [String?] = [members.first?.asignadoPor] + members.map { Optional($0.nombre) }
        var vistos = Set<String>()
        var salida: [String] = []
        for crudo in crudos {
            guard let nombre = crudo, teHasText(nombre) else { continue }
            if vistos.insert(nombre).inserted {
                salida.append(CoreFormat.shortName(nombre))
            }
        }
        return salida
    }

    /// Qué ve quien consulta, con el aviso de solo lectura.
    static func alcanceTexto(_ data: TeamEvidenceResponse) -> String {
        let base: String
        switch data.alcance ?? "" {
        case "todo": base = "Ves a toda la cadena."
        case "equipo": base = "Ves lo que hizo tu equipo a partir de ti."
        default: base = "Estas son tus evidencias."
        }
        let soloLectura = data.soloLectura == true && data.alcance != "propio"
        return soloLectura ? base + " Solo lectura: puedes ver todo, no revisar." : base
    }

    /// La devolución más reciente (las revisiones llegan de la más nueva a la más vieja).
    static func ultimaDevolucion(_ revisiones: [TeamEvidenceReview]) -> TeamEvidenceReview? {
        revisiones.first { $0.decision != "APROBADA" }
    }

    /// Ya envió la corrección de lo devuelto y nadie la ha aprobado.
    static func esCorreccion(_ ev: TeamEvidenceData?, revisiones: [TeamEvidenceReview]) -> Bool {
        guard let ev, teHasText(ev.correctionSubmittedAt) else { return false }
        return ev.status == CoreEvidence.completed
            && ev.reviewStatus != "APPROVED"
            && ultimaDevolucion(revisiones) != nil
    }

    /// Pasos que rehizo tras la última devolución (se resaltan para revisarlos primero).
    static func pasosCorregidos(_ ev: TeamEvidenceData?, revisiones: [TeamEvidenceReview]) -> [String] {
        esCorreccion(ev, revisiones: revisiones) ? (ultimaDevolucion(revisiones)?.pasos ?? []) : []
    }

    /// Barra de quien revisa cuando lo que llega es una corrección.
    static func correccionTexto(_ ev: TeamEvidenceData?, revisiones: [TeamEvidenceReview], coreKind: String?) -> String {
        let ultima = ultimaDevolucion(revisiones)
        let pasos = ultima?.pasos ?? []
        let que = (!pasos.isEmpty && ultima?.decision != "DEVUELTA_TODO")
            ? " (\(stepList(pasos, coreKind: coreKind)))"
            : " (rehízo toda la actividad)"
        let cuando = TeamEvidenceTime.when(ev?.correctionSubmittedAt).map { " · \($0)" } ?? ""
        return "Corrigió lo que se le devolvió\(que)\(cuando). Revisa la corrección y apruébala o devuélvela de nuevo."
    }

    /// Nota de quien está corrigiendo lo que se le devolvió.
    static func corrigiendoTexto(_ pasos: [String], reviewNotes: String?, avisarReenvio: Bool, coreKind: String?) -> String {
        var texto = "Está corrigiendo: \(stepList(pasos, coreKind: coreKind))"
        if let notas = reviewNotes, teHasText(notas) {
            texto += " · «\(notas)»"
        }
        if avisarReenvio {
            texto += ". Cuando envíe la corrección podrás aprobarla o devolverla otra vez."
        }
        return texto
    }

    /// Resumen de salidas de zona en una etiqueta (web `ChipZona`).
    static func zonaChip(_ alerts: [ActivityGeofenceAlert]) -> Tone? {
        guard !alerts.isEmpty else { return nil }
        if alerts.contains(where: { $0.abierta }) {
            return Tone(label: "Fuera de zona", color: CorePalette.red, icon: TeGlyph.locationOff)
        }
        let sinJustificar = alerts.filter { !$0.isJustified }.count
        if sinJustificar > 0 {
            let texto = sinJustificar == 1
                ? "Salida de zona sin justificar"
                : "\(sinJustificar) salidas de zona sin justificar"
            return Tone(label: texto, color: CorePalette.orange, icon: TeGlyph.locationOff)
        }
        let texto = alerts.count == 1 ? "1 salida de zona" : "\(alerts.count) salidas de zona"
        return Tone(label: texto, color: nil, icon: TeGlyph.locationOff)
    }

    static func stepList(_ steps: [String], coreKind: String? = nil) -> String {
        steps.map { CoreEvidence.label($0, coreKind: coreKind) }.joined(separator: ", ")
    }

    /// «Deficiente» … «Excelente» (`califLabel`).
    static func califLabel(_ value: Int) -> String {
        CoreEvidence.ratingLabel(value)
    }

    /// Qué falta en la revisión, en el mismo orden y palabras que la web (`revisionFaltantes`).
    static func revisionFaltantes(
        aprobar: Bool,
        todo: Bool,
        pasosMarcados: Int,
        calificacion: Int,
        observaciones: String
    ) -> [String] {
        var faltan: [String] = []
        if !aprobar && !todo && pasosMarcados == 0 {
            faltan.append("marca qué pasos debe corregir")
        }
        if !(1...5).contains(calificacion) {
            faltan.append("califica su eficiencia")
        }
        if observaciones.trimmingCharacters(in: .whitespacesAndNewlines).count < 5 {
            faltan.append(aprobar ? "escribe por qué la apruebas" : "escribe qué debe corregir")
        }
        return faltan
    }

    /// Fotos etiquetadas de una evidencia (`fotosDe`). `etiqueta` se pega al nombre
    /// («Ana López (devuelta) · Entrada») en la copia de una devolución.
    static func fotos(_ ev: TeamEvidenceData, nombre: String, etiqueta: String = "") -> PhotoSet {
        let quien = "\(CoreFormat.shortName(nombre))\(etiqueta)"
        var fotoSet = PhotoSet()
        if let url = ev.entryPhotoUrl, teHasText(url) {
            fotoSet.entrada = fotoSet.items.count
            fotoSet.items.append(CorePhotoItem(
                title: "\(quien) · \(entryLabel)",
                url: url,
                latitude: ev.entryLatitude?.value,
                longitude: ev.entryLongitude?.value,
                time: ev.entryPhotoUploadedAt
            ))
            fotoSet.labels.append(entryLabel)
        }
        for (index, url) in ev.photos.enumerated() {
            let geo = ev.geo(at: index)
            let label = evidenceLabel(index)
            fotoSet.sitio.append(fotoSet.items.count)
            fotoSet.items.append(CorePhotoItem(
                title: "\(quien) · \(label)",
                url: url,
                latitude: geo?.latitude?.value,
                longitude: geo?.longitude?.value,
                time: geo?.capturedAt ?? ev.evidencePhotosUploadedAt
            ))
            fotoSet.labels.append(label)
        }
        if let url = ev.exitPhotoUrl, teHasText(url) {
            fotoSet.salida = fotoSet.items.count
            fotoSet.items.append(CorePhotoItem(
                title: "\(quien) · \(exitLabel)",
                url: url,
                latitude: ev.exitLatitude?.value,
                longitude: ev.exitLongitude?.value,
                time: ev.exitPhotoUploadedAt
            ))
            fotoSet.labels.append(exitLabel)
        }
        return fotoSet
    }

    /// Campos capturados con su etiqueta; los viejos (otras claves) también se muestran (`formEntries`).
    static func formEntries(_ data: JSONValue?, coreKind: String?) -> [(label: String, value: String)] {
        guard let mapa = data?.objectValue else { return [] }
        let campos = CoreEvidence.formFields(for: coreKind)
        let conocidos = Set(campos.map { $0.key })
        var filas: [(label: String, value: String)] = []
        for campo in campos {
            if let texto = mapa[campo.key]?.displayText, !texto.isEmpty {
                filas.append((label: campo.label, value: texto))
            }
        }
        for clave in mapa.keys.sorted() where !conocidos.contains(clave) {
            guard let valor = mapa[clave] else { continue }
            switch valor {
            case .object, .array, .null:
                continue
            default:
                break
            }
            guard let texto = valor.displayText, !texto.isEmpty else { continue }
            let etiqueta = humanizeKey(clave)
            if texto.lowercased().hasPrefix("data:image") {
                filas.append((label: etiqueta, value: "Firma capturada"))
            } else {
                filas.append((label: etiqueta, value: texto))
            }
        }
        return filas
    }

    /// «gerenteEncargado» → «Gerente encargado».
    static func humanizeKey(_ key: String) -> String {
        var texto = key.replacingOccurrences(of: "([a-z0-9])([A-Z])", with: "$1 $2", options: .regularExpression)
        texto = texto.replacingOccurrences(of: "[_-]+", with: " ", options: .regularExpression)
        texto = texto.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard let primera = texto.first else { return texto }
        return String(primera).uppercased() + String(texto.dropFirst())
    }

    /// Google Maps en la coordenada (Android `openMapsAt`). Sin coordenada real, nada.
    static func mapsURL(latitude: Double?, longitude: Double?) -> URL? {
        guard let latitude, let longitude, latitude.isFinite, longitude.isFinite,
              !(latitude == 0 && longitude == 0) else { return nil }
        return URL(string: "https://www.google.com/maps?q=\(latitude),\(longitude)")
    }

    static func loadMessage(_ error: Error) -> String {
        error.toUserMessage(fallback: "No se pudieron cargar las evidencias del equipo")
    }
}

/// SF Symbols equivalentes a los `NxGlyph` de Android.
private enum TeGlyph {
    static let approved = "checkmark.circle"          // TaskAlt
    static let done = "checkmark"                     // Check
    static let inProgress = "hourglass"               // HourglassTop
    static let waiting = "hourglass"                  // HourglassTop
    static let toReview = "star.bubble"               // RateReview
    static let returned = "arrow.uturn.backward"      // Undo
    static let correction = "arrow.counterclockwise"  // Replay
    static let dispatch = "paperplane"                // Send
    static let support = "person.2"                   // Handshake
    static let executes = "wrench.and.screwdriver"    // Engineering
    static let entry = "arrow.right.to.line"          // Login
    static let pickup = "shippingbox"                 // Inventory2
    static let photo = "camera"                       // PhotoCamera
    static let chat = "bubble.left"                   // Chat
    static let link = "link"                          // Link
    static let location = "mappin"                    // LocationOn
    static let locationOff = "location.slash"         // LocationOff
    static let error = "exclamationmark.circle"       // ErrorOutline
    static let pending = "circle"                     // RadioButtonUnchecked
    static let pdf = "doc.text"                       // Description
}

private func teHasText(_ value: String?) -> Bool {
    !(value ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
}

// MARK: - Horas en America/Mexico_City

/// «lun 14 sept · 09:30» siempre en hora de México, con las abreviaturas fijas de
/// Android (`NxFormat.patron`): no depende de la zona ni del idioma del teléfono.
private enum TeamEvidenceTime {
    static let zona: TimeZone = TimeZone(identifier: "America/Mexico_City") ?? .current

    private static let calendario: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zona
        return calendar
    }()

    private static let isoFraccion: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private static let isoSimple: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    /// Fecha y hora sin zona («2026-09-14T10:30:00»): hora de México, como `LocalDateTime` en Android.
    private static let sinZona: [DateFormatter] = {
        let patrones = ["yyyy-MM-dd'T'HH:mm:ss.SSS", "yyyy-MM-dd'T'HH:mm:ss", "yyyy-MM-dd'T'HH:mm"]
        return patrones.map { (patron: String) -> DateFormatter in
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.calendar = Calendar(identifier: .gregorian)
            formatter.timeZone = zona
            formatter.dateFormat = patron
            return formatter
        }
    }()

    private static let meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"]
    /// `weekday` de `Calendar`: 1 = domingo.
    private static let dias = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"]

    static func parse(_ iso: String?) -> Date? {
        let raw = (iso ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !raw.isEmpty else { return nil }
        if let date = isoFraccion.date(from: raw) { return date }
        if let date = isoSimple.date(from: raw) { return date }
        for formatter in sinZona {
            if let date = formatter.date(from: raw) { return date }
        }
        return nil
    }

    /// «lun 14 sept · 09:30» (Android `formatWhen`); `nil` sin fecha.
    static func when(_ iso: String?) -> String? {
        guard let date = parse(iso) else { return nil }
        let partes = calendario.dateComponents([.weekday, .day, .month, .hour, .minute], from: date)
        let dia = dias[min(max((partes.weekday ?? 1) - 1, 0), 6)]
        let mes = meses[min(max((partes.month ?? 1) - 1, 0), 11)]
        let hora = String(format: "%02d:%02d", partes.hour ?? 0, partes.minute ?? 0)
        return "\(dia) \(partes.day ?? 1) \(mes) · \(hora)"
    }

    /// «09:30» (Android `ActivityGeofence.horaDe`); «—» sin fecha.
    static func hora(_ iso: String?) -> String {
        guard let date = parse(iso) else { return "—" }
        let partes = calendario.dateComponents([.hour, .minute], from: date)
        return String(format: "%02d:%02d", partes.hour ?? 0, partes.minute ?? 0)
    }
}

// MARK: - Piezas de Android

/// Icono + texto en una fila (Android `NxIconText`): icono de 1,25 × la letra,
/// separados 6 y centrados en vertical.
private struct TeIconText: View {
    let text: String
    let icon: String?
    var size: CGFloat = 14
    var weight: Font.Weight = .regular
    var color: Color = NxColors.fg
    var iconTint: Color? = nil
    var lineLimit: Int? = nil

    var body: some View {
        HStack(alignment: .center, spacing: 6) {
            if let icon {
                Image(systemName: icon)
                    .font(.system(size: size * 1.02, weight: .regular))
                    .foregroundStyle(iconTint ?? color)
                    .frame(width: size * 1.25, height: size * 1.25)
                    .accessibilityHidden(true)
            }
            Text(text)
                .font(.system(size: size, weight: weight))
                .foregroundStyle(color)
                .lineLimit(lineLimit)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

/// Chip de estado con su icono (Android `ToneChip(tone)`).
private struct TeToneChip: View {
    let tone: TeamEvidenceUI.Tone

    var body: some View {
        CoreChip(icon: tone.icon, text: tone.label, color: tone.color)
    }
}

/// Nota con fondo suave (Android `SoftNote` con icono).
private struct TeSoftNote: View {
    let text: String
    var color: Color? = nil
    var icon: String? = nil

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            if let icon {
                Image(systemName: icon)
                    .font(.system(size: 15, weight: .regular))
                    .foregroundStyle(color ?? NxColors.muted)
                    .frame(width: 18, height: 18)
                    .padding(.top, 1)
                    .accessibilityHidden(true)
            }
            Text(text)
                .font(.system(size: 13))
                .foregroundStyle(NxColors.fg)
                .lineSpacing(2.4)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            color.map { $0.opacity(0.09) } ?? NxColors.sunken,
            in: RoundedRectangle(cornerRadius: 12, style: .continuous)
        )
    }
}

/// Botón de píldora de Material 3 (`Button` / `OutlinedButton`): 40 de alto,
/// relleno 24 × 8, letra 14 SemiBold. Sin `fill` y con `border` es el de contorno.
private struct TePillStyle: ButtonStyle {
    var fill: Color = .clear
    var foreground: Color = NxColors.brand
    var border: Color? = NxColors.borderStrong
    var minHeight: CGFloat = 40
    var fullWidth: Bool = false
    var horizontalPadding: CGFloat = 24

    func makeBody(configuration: Configuration) -> some View {
        TePillBody(configuration: configuration, style: self)
    }
}

private struct TePillBody: View {
    let configuration: ButtonStyleConfiguration
    let style: TePillStyle
    @Environment(\.isEnabled) private var isEnabled

    private var fondo: Color {
        if isEnabled { return style.fill }
        return style.border == nil ? NxColors.fg.opacity(0.12) : Color.clear
    }

    var body: some View {
        configuration.label
            .font(.system(size: 14, weight: .semibold))
            .lineLimit(1)
            .foregroundStyle(isEnabled ? style.foreground : NxColors.fg.opacity(0.38))
            .padding(.horizontal, style.horizontalPadding)
            .padding(.vertical, 8)
            .frame(maxWidth: style.fullWidth ? .infinity : nil, minHeight: style.minHeight)
            .background(Capsule().fill(fondo))
            .overlay {
                if let border = style.border {
                    Capsule().strokeBorder(isEnabled ? border : NxColors.fg.opacity(0.12), lineWidth: 1)
                }
            }
            .opacity(configuration.isPressed ? 0.85 : 1)
            .contentShape(Capsule())
    }
}

/// Icono de 18 + texto de un botón de Android.
private struct TeButtonLabel: View {
    let title: String
    let icon: String
    var weight: Font.Weight = .bold

    var body: some View {
        HStack(alignment: .center, spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 15, weight: .semibold))
                .frame(width: 18, height: 18)
                .accessibilityHidden(true)
            Text(title)
                .font(.system(size: 14, weight: weight))
        }
    }
}

/// «Cargando evidencias del equipo…» (primera carga).
private struct TeamLoadingText: View {
    var body: some View {
        Text("Cargando evidencias del equipo…")
            .font(.system(size: 13))
            .foregroundStyle(NxColors.muted)
    }
}

/// La carga falló y no hay nada que enseñar: el motivo y «Reintentar».
private struct TeamRetryRow: View {
    let message: String
    let onRetry: () -> Void

    var body: some View {
        HStack(alignment: .center, spacing: 8) {
            Text(message)
                .font(.system(size: 13))
                .foregroundStyle(NxColors.muted)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button("Reintentar", action: onRetry)
                .buttonStyle(TePillStyle())
        }
    }
}

private struct TeamEvidenceLoadKey: Equatable {
    let activityId: Int
    let refresh: Int
    let reload: Int
}

private struct TeamPhotoViewerRequest: Identifiable {
    let id = UUID()
    let items: [CorePhotoItem]
    let start: Int
}

// MARK: - Vista completa (pestaña Evidencias)

/// Evidencias por persona: fotos, PDF, formulario, revisión e historial.
/// Va dentro de un `NxPanelShell` y de un ScrollView (no pone ninguno de los dos).
struct TeamEvidenceView: View {
    let activityId: Int
    var refreshToken: Int = 0

    @State private var data: TeamEvidenceResponse?
    @State private var loading = true
    @State private var error: String?
    @State private var reload = 0
    @State private var notice: String?
    @State private var review: TeamEvidenceReviewRequest?
    @State private var visor: TeamPhotoViewerRequest?

    var body: some View {
        content
            .frame(maxWidth: .infinity, alignment: .leading)
            .task(id: TeamEvidenceLoadKey(activityId: activityId, refresh: refreshToken, reload: reload)) {
                await load()
            }
            .task(id: notice) {
                // El aviso verde se va solo a los 6 s, como en Android.
                guard notice != nil else { return }
                try? await Task.sleep(nanoseconds: 6_000_000_000)
                if !Task.isCancelled { notice = nil }
            }
            .sheet(item: $review) { request in
                TeamEvidenceReviewSheet(
                    activityId: activityId,
                    request: request,
                    coreKind: data?.activity.coreKind
                ) { response, message in
                    data = response
                    notice = message
                    review = nil
                }
            }
            .fullScreenCover(item: $visor) { request in
                CorePhotoViewer(items: request.items, startIndex: request.start)
            }
    }

    @ViewBuilder
    private var content: some View {
        if let data {
            loaded(data)
        } else if loading {
            TeamLoadingText()
        } else if let error {
            TeamRetryRow(message: error) { reload += 1 }
        }
    }

    private func loaded(_ data: TeamEvidenceResponse) -> some View {
        let resumen = data.resumen
        let coreKind = data.activity.coreKind
        let porRevisar = resumen.porRevisarMias
        return VStack(alignment: .leading, spacing: 12) {
            header(data)
            if porRevisar > 0 {
                TeSoftNote(
                    text: "Tienes \(porRevisar) evidencia\(porRevisar == 1 ? "" : "s") por revisar. "
                        + "La actividad queda finalizada cuando se aprueba la de todos.",
                    color: CorePalette.orange,
                    icon: TeGlyph.toReview
                )
            }
            if let notice {
                TeSoftNote(text: notice, color: CorePalette.green, icon: TeGlyph.done)
            }
            if let error {
                TeIconText(text: error, icon: TeGlyph.error, size: 13, color: TeamEvidenceUI.errorRed)
            }
            if data.members.isEmpty {
                Text("Nadie en el equipo todavía.")
                    .font(.system(size: 13))
                    .foregroundStyle(NxColors.muted)
            }
            ForEach(data.members) { member in
                TeamMemberCard(
                    member: member,
                    coreKind: coreKind,
                    onOpenVisor: { items, index in
                        if items.indices.contains(index) {
                            visor = TeamPhotoViewerRequest(items: items, start: index)
                        }
                    },
                    onRevisar: { who, aprobar, pasos in
                        review = TeamEvidenceReviewRequest(
                            member: who,
                            decision: aprobar ? "aprobar" : "devolver",
                            pasos: pasos
                        )
                    }
                )
            }
        }
    }

    private func header(_ data: TeamEvidenceResponse) -> some View {
        let resumen = data.resumen
        let cadena = TeamEvidenceUI.cadena(data.members)
        let estado = TeamEvidenceUI.teamState(
            ejecutores: resumen.ejecutores,
            terminaron: resumen.terminaron,
            aprobadas: resumen.aprobadas
        )
        let alcance = TeamEvidenceUI.alcanceTexto(data)
        let cerrada: String? = TeamEvidenceUI.isTeamFinalizada(ejecutores: resumen.ejecutores, aprobadas: resumen.aprobadas)
            ? TeamEvidenceTime.when(data.activity.fechaFinalizacion)
            : nil
        return HStack(alignment: .top, spacing: 8) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Evidencias del equipo")
                    .font(.system(size: 18, weight: .heavy))
                    .foregroundStyle(NxColors.fg)
                    .accessibilityAddTraits(.isHeader)
                if cadena.count > 1 {
                    TeIconText(
                        text: "\(cadena.joined(separator: " → ")) · \(alcance)",
                        icon: TeGlyph.link,
                        size: 13,
                        color: NxColors.muted
                    )
                } else {
                    Text(alcance)
                        .font(.system(size: 13))
                        .foregroundStyle(NxColors.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                CoreFlowLayout(spacing: 6) {
                    TeToneChip(tone: estado)
                    if resumen.ejecutores > 0 {
                        CoreChip(text: "Enviaron \(resumen.terminaron) de \(resumen.ejecutores)")
                        CoreChip(text: "Aprobadas \(resumen.aprobadas) de \(resumen.ejecutores)")
                    }
                    if let cerrada {
                        CoreChip(text: "Cerrada \(cerrada)")
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Button {
                reload += 1
            } label: {
                Text(loading ? "Actualizando…" : "↻ Actualizar")
                    .font(.system(size: 13, weight: .semibold))
            }
            .buttonStyle(TePillStyle(horizontalPadding: 16))
            .disabled(loading)
        }
    }

    @MainActor
    private func load() async {
        loading = true
        defer {
            if !Task.isCancelled { loading = false }
        }
        do {
            let fresh = try await CoreRepository.shared.teamEvidence(activityId: activityId)
            data = fresh
            error = nil
        } catch {
            if Task.isCancelled { return }
            self.error = TeamEvidenceUI.loadMessage(error)
        }
    }
}

// MARK: - Resumen compacto (pestaña Detalle)

/// Lo que pinta Android en modo compacto; el título y la tarjeta los pone el detalle.
struct TeamEvidenceCompactView: View {
    let activityId: Int
    var refreshToken: Int = 0
    let onOpen: () -> Void

    @State private var data: TeamEvidenceResponse?
    @State private var loading = true
    @State private var error: String?
    @State private var reload = 0

    var body: some View {
        content
            .frame(maxWidth: .infinity, alignment: .leading)
            .task(id: TeamEvidenceLoadKey(activityId: activityId, refresh: refreshToken, reload: reload)) {
                await load()
            }
    }

    @ViewBuilder
    private var content: some View {
        if let data {
            loaded(data)
        } else if loading {
            TeamLoadingText()
        } else if let error {
            TeamRetryRow(message: error) { reload += 1 }
        }
    }

    private func loaded(_ data: TeamEvidenceResponse) -> some View {
        let resumen = data.resumen
        let cadena = TeamEvidenceUI.cadena(data.members)
        let estado = TeamEvidenceUI.teamState(
            ejecutores: resumen.ejecutores,
            terminaron: resumen.terminaron,
            aprobadas: resumen.aprobadas
        )
        return VStack(alignment: .leading, spacing: 10) {
            CoreFlowLayout(spacing: 6) {
                TeToneChip(tone: estado)
                if resumen.ejecutores > 0 {
                    CoreChip(text: "Aprobadas \(resumen.aprobadas) de \(resumen.ejecutores)")
                }
                if resumen.porRevisarMias > 0 {
                    CoreChip(icon: TeGlyph.toReview, text: "\(resumen.porRevisarMias) por revisar", color: CorePalette.orange)
                }
            }
            if cadena.count > 1 {
                TeIconText(text: cadena.joined(separator: " → "), icon: TeGlyph.link, size: 12.5, color: NxColors.muted)
            }
            if data.members.isEmpty {
                Text("Nadie en el equipo todavía.")
                    .font(.system(size: 13))
                    .foregroundStyle(NxColors.muted)
            }
            ForEach(data.members) { member in
                TeamCompactMemberRow(member: member)
            }
            Button(action: onOpen) {
                Text(resumen.porRevisarMias > 0 ? "Revisar evidencias →" : "Ver fotos, PDF y formularios →")
            }
            .buttonStyle(TePillStyle())
        }
    }

    @MainActor
    private func load() async {
        loading = true
        defer {
            if !Task.isCancelled { loading = false }
        }
        do {
            let fresh = try await CoreRepository.shared.teamEvidence(activityId: activityId)
            data = fresh
            error = nil
        } catch {
            if Task.isCancelled { return }
            self.error = TeamEvidenceUI.loadMessage(error)
        }
    }
}

/// Renglón de una persona en el resumen (Android `CompactMemberRow`).
private struct TeamCompactMemberRow: View {
    let member: TeamEvidenceMember

    private var subtitle: (text: String, icon: String) {
        if member.splits {
            let pasoA = member.pasoA ?? []
            if pasoA.isEmpty { return ("La reparte", TeGlyph.dispatch) }
            let nombres = pasoA.map { CoreFormat.shortName($0.nombre) }.joined(separator: ", ")
            return ("La pasó a \(nombres)", TeGlyph.dispatch)
        }
        let ev = member.evidence
        var fotos = 0
        if let ev {
            fotos = (teHasText(ev.entryPhotoUrl) ? 1 : 0) + ev.photos.count + (teHasText(ev.exitPhotoUrl) ? 1 : 0)
        }
        var partes: [String] = [fotos > 0 ? "\(fotos) foto\(fotos == 1 ? "" : "s")" : "Sin fotos aún"]
        if teHasText(ev?.serviceSheetPdfUrl) { partes.append("PDF") }
        if teHasText(ev?.serviceSheetCompletedAt) { partes.append("Formulario") }
        return (partes.joined(separator: " · "), fotos > 0 ? TeGlyph.photo : TeGlyph.waiting)
    }

    var body: some View {
        let sub = subtitle
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .center, spacing: 10) {
                CoreAvatar(name: member.nombre, url: member.avatarUrl, size: 34)
                VStack(alignment: .leading, spacing: 0) {
                    HStack(alignment: .center, spacing: 6) {
                        Text(CoreFormat.shortName(member.nombre))
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(NxColors.fg)
                            .lineLimit(1)
                        if let score = member.eficienciaScore, score > 0 {
                            CoreStars(value: score, size: 11)
                        }
                    }
                    TeIconText(text: sub.text, icon: sub.icon, size: 12, color: NxColors.muted)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if !member.splits, let estado = TeamEvidenceUI.estado(member.evidence) {
                    TeToneChip(tone: estado)
                }
            }
            if !member.splits {
                CoreProgressBar(percent: member.progressPct ?? 0)
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(NxColors.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(NxColors.border, lineWidth: 1)
        )
    }
}

// MARK: - Tarjeta por persona

/// Tarjeta de una persona (Android `TeamMemberCard`).
private struct TeamMemberCard: View {
    let member: TeamEvidenceMember
    let coreKind: String?
    let onOpenVisor: ([CorePhotoItem], Int) -> Void
    /// Persona, ¿aprobar?, pasos ya marcados.
    let onRevisar: (TeamEvidenceMember, Bool, [String]) -> Void

    @State private var abierta: Bool

    init(
        member: TeamEvidenceMember,
        coreKind: String?,
        onOpenVisor: @escaping ([CorePhotoItem], Int) -> Void,
        onRevisar: @escaping (TeamEvidenceMember, Bool, [String]) -> Void
    ) {
        self.member = member
        self.coreKind = coreKind
        self.onOpenVisor = onOpenVisor
        self.onRevisar = onRevisar
        _abierta = State(initialValue: !member.splits)
    }

    private var revisiones: [TeamEvidenceReview] { member.revisiones ?? [] }
    private var porRevisar: Bool { TeamEvidenceUI.pendingReview(member) }
    private var esCorreccion: Bool { TeamEvidenceUI.esCorreccion(member.evidence, revisiones: revisiones) }
    private var corregidos: [String] { TeamEvidenceUI.pasosCorregidos(member.evidence, revisiones: revisiones) }

    /// Pasos devueltos que todavía está corrigiendo.
    private var corrigiendo: [String] {
        member.evidence?.reviewStatus == "REJECTED" ? (member.rejectedSteps ?? []) : []
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            header
            if !member.splits {
                CoreProgressBar(percent: member.progressPct ?? 0)
            }
            meta
            if porRevisar {
                reviewBox
            }
            if member.canReview, let ev = member.evidence, ev.reviewStatus == "APPROVED" {
                approvedRow(ev)
            }
            if !corrigiendo.isEmpty {
                TeSoftNote(
                    text: TeamEvidenceUI.corrigiendoTexto(
                        corrigiendo,
                        reviewNotes: member.evidence?.reviewNotes,
                        avisarReenvio: member.canReview || !revisiones.isEmpty,
                        coreKind: coreKind
                    ),
                    color: CorePalette.orange,
                    icon: TeGlyph.correction
                )
            }
            toggleButton
            if abierta {
                detail
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(NxColors.card)
                .nxElevation(1)
        }
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .strokeBorder(porRevisar ? CorePalette.orange.opacity(0.45) : NxColors.border, lineWidth: 1)
        )
        // Quien salió del equipo se ve atenuado, como en la web.
        .opacity(member.retiradoAt != nil ? 0.75 : 1)
    }

    private var header: some View {
        HStack(alignment: .center, spacing: 10) {
            CoreAvatar(name: member.nombre, url: member.avatarUrl, size: 44)
            VStack(alignment: .leading, spacing: 4) {
                Text(teHasText(member.nombre) ? member.nombre : "—")
                    .font(.system(size: 15, weight: .heavy))
                    .foregroundStyle(NxColors.fg)
                CoreFlowLayout(spacing: 6) {
                    TeToneChip(tone: TeamEvidenceUI.rol(member))
                    if !member.splits, let estado = TeamEvidenceUI.estado(member.evidence) {
                        TeToneChip(tone: estado)
                    }
                    if let zona = TeamEvidenceUI.zonaChip(member.zoneAlerts) {
                        TeToneChip(tone: zona)
                    }
                    if let score = member.eficienciaScore, score > 0 {
                        CoreStars(value: score)
                    }
                    if member.retiradoAt != nil {
                        CoreChip(text: "Salió del equipo")
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    /// Recibió / La pasó a / Envió.
    private var metaLines: [(text: String, icon: String)] {
        var lines: [(text: String, icon: String)] = []
        var recibio = "Recibió"
        if let cuando = TeamEvidenceTime.when(member.asignadoAt) {
            recibio += " \(cuando)"
        }
        if let por = member.asignadoPor, teHasText(por), por != member.nombre {
            recibio += " de \(CoreFormat.shortName(por))"
        }
        lines.append((text: recibio, icon: TeGlyph.entry))
        for paso in member.pasoA ?? [] {
            var texto = "La pasó a \(CoreFormat.shortName(paso.nombre))"
            if let cuando = TeamEvidenceTime.when(paso.at) {
                texto += " · \(cuando)"
            }
            lines.append((text: texto, icon: TeGlyph.dispatch))
        }
        if let ev = member.evidence, ev.status == CoreEvidence.completed, let envio = TeamEvidenceTime.when(ev.completedAt) {
            lines.append((text: "Envió \(envio)", icon: TeGlyph.pickup))
        }
        return lines
    }

    private var meta: some View {
        VStack(alignment: .leading, spacing: 2) {
            ForEach(Array(metaLines.enumerated()), id: \.offset) { _, line in
                TeIconText(text: line.text, icon: line.icon, size: 12.5, color: NxColors.muted)
            }
        }
    }

    private var reviewBox: some View {
        let texto = esCorreccion
            ? TeamEvidenceUI.correccionTexto(member.evidence, revisiones: revisiones, coreKind: coreKind)
            : "Ya envió su evidencia. Revísala, califícala y apruébala o devuélvela."
        return VStack(alignment: .leading, spacing: 8) {
            TeIconText(text: texto, icon: TeGlyph.toReview, size: 13.5, weight: .semibold, color: NxColors.fg)
            HStack(spacing: 8) {
                Button {
                    onRevisar(member, true, [])
                } label: {
                    TeButtonLabel(title: "Aprobar", icon: TeGlyph.approved)
                }
                .buttonStyle(TePillStyle(fill: CorePalette.green, foreground: .white, border: nil, minHeight: 48, fullWidth: true))
                Button {
                    onRevisar(member, false, [])
                } label: {
                    TeButtonLabel(title: "Devolver", icon: TeGlyph.returned)
                }
                .buttonStyle(TePillStyle(fill: CorePalette.orange, foreground: .white, border: nil, minHeight: 48, fullWidth: true))
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(CorePalette.orange.opacity(0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(CorePalette.orange.opacity(0.35), lineWidth: 1)
        )
    }

    private func approvedRow(_ ev: TeamEvidenceData) -> some View {
        var texto = "Aprobada"
        if let por = ev.reviewedBy, teHasText(por) {
            texto += " por \(CoreFormat.shortName(por))"
        }
        if let cuando = TeamEvidenceTime.when(ev.reviewedAt) {
            texto += " · \(cuando)"
        }
        texto += ". ¿Encontraste algo mal?"
        return HStack(alignment: .center, spacing: 8) {
            TeIconText(text: texto, icon: TeGlyph.approved, size: 13, color: NxColors.muted)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button {
                onRevisar(member, false, [])
            } label: {
                TeButtonLabel(title: "Devolver", icon: TeGlyph.returned, weight: .semibold)
            }
            .buttonStyle(TePillStyle(horizontalPadding: 16))
        }
    }

    private var toggleButton: some View {
        Button {
            abierta.toggle()
        } label: {
            Text(abierta ? "Ocultar" : "Ver detalle")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(NxColors.brand)
                .padding(.horizontal, 12)
                .frame(minHeight: 40)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    /// «Devolver este paso» solo con la evidencia enviada y si me toca revisarla.
    private func devolverPaso(_ ev: TeamEvidenceData) -> ((String) -> Void)? {
        guard member.canReview, ev.status == CoreEvidence.completed else { return nil }
        let quien = member
        let revisar = onRevisar
        return { step in revisar(quien, false, [step]) }
    }

    private var repartioTexto: String {
        let sinPasar = (member.pasoA ?? []).isEmpty ? " (todavía no la pasa a nadie)" : ""
        return "Su parte fue repartirla\(sinPasar); no sube evidencias."
    }

    @ViewBuilder
    private var detail: some View {
        if let indicaciones = member.indicaciones, teHasText(indicaciones) {
            TeSoftNote(text: indicaciones, icon: TeGlyph.chat)
        }
        if member.splits {
            Text(repartioTexto)
                .font(.system(size: 13))
                .foregroundStyle(NxColors.muted)
                .fixedSize(horizontal: false, vertical: true)
        } else if let ev = member.evidence {
            TeamEvidenceContent(
                evidence: ev,
                coreKind: coreKind,
                nombre: member.nombre,
                porCorregir: corrigiendo,
                corregidos: corregidos,
                onOpenVisor: onOpenVisor,
                onDevolverPaso: devolverPaso(ev)
            )
        } else {
            Text("Aún no empieza a subir evidencias.")
                .font(.system(size: 13))
                .foregroundStyle(NxColors.muted)
        }
        TeamReviewHistory(revisiones: revisiones, coreKind: coreKind, nombre: member.nombre, onOpenVisor: onOpenVisor)
        if !member.zoneAlerts.isEmpty {
            Text("Salidas de zona (\(member.zoneAlerts.count))")
                .font(.system(size: 13, weight: .heavy))
                .foregroundStyle(TeamEvidenceUI.errorRed)
            ForEach(member.zoneAlerts) { alert in
                TeamZoneAlertRow(alert: alert) { abrirFotoZona(alert) }
            }
        }
    }

    /// Fotos de justificación de sus salidas de zona, en el visor (como la web).
    private func abrirFotoZona(_ alert: ActivityGeofenceAlert) {
        let corto = CoreFormat.shortName(member.nombre)
        var items: [CorePhotoItem] = []
        var inicio = 0
        for item in member.zoneAlerts {
            guard let url = item.fotoUrl, teHasText(url) else { continue }
            if item.id == alert.id { inicio = items.count }
            items.append(CorePhotoItem(
                title: "\(corto) · Justificación de salida de zona",
                url: url,
                time: item.justificadaAt ?? item.detectedAt
            ))
        }
        onOpenVisor(items, inicio)
    }
}

// MARK: - Contenido de una evidencia (actual o copia de una devolución)

/// Pasos, fotos, PDF y formulario (Android `EvidenceContent`).
private struct TeamEvidenceContent: View {
    let evidence: TeamEvidenceData
    let coreKind: String?
    let nombre: String
    var etiqueta: String = ""
    var porCorregir: [String] = []
    /// Pasos que ya rehizo tras la última devolución.
    var corregidos: [String] = []
    let onOpenVisor: ([CorePhotoItem], Int) -> Void
    var onDevolverPaso: ((String) -> Void)? = nil

    var body: some View {
        let fotoSet = TeamEvidenceUI.fotos(evidence, nombre: nombre, etiqueta: etiqueta)
        VStack(alignment: .leading, spacing: 12) {
            stepGrid
            if fotoSet.entrada != nil || fotoSet.salida != nil {
                entryExitRow(fotoSet)
            }
            if !fotoSet.sitio.isEmpty {
                siteSection(fotoSet)
            }
            if let url = evidence.serviceSheetPdfUrl, teHasText(url) {
                VStack(alignment: .leading, spacing: 6) {
                    TeamSectionTitle(
                        title: "Hoja de servicio",
                        time: evidence.serviceSheetUploadedAt,
                        step: CoreEvidence.serviceSheetPdf,
                        onDevolverPaso: onDevolverPaso
                    )
                    TeamPdfButton(url: url)
                }
            }
            if evidence.serviceSheetData != nil {
                formSection
            }
        }
    }

    // MARK: Pasos

    private var stepGrid: some View {
        let pasos = CoreEvidence.steps(for: coreKind)
        let filas: [[String]] = stride(from: 0, to: pasos.count, by: 2).map {
            Array(pasos[$0..<min($0 + 2, pasos.count)])
        }
        return VStack(alignment: .leading, spacing: 12) {
            ForEach(Array(filas.enumerated()), id: \.offset) { _, fila in
                HStack(alignment: .top, spacing: 8) {
                    ForEach(fila, id: \.self) { step in
                        stepCell(step)
                    }
                    if fila.count == 1 {
                        Color.clear.frame(maxWidth: .infinity, maxHeight: 0)
                    }
                }
            }
        }
    }

    /// Hecho · hora, por corregir, corregido · hora o pendiente.
    private func stepCell(_ step: String) -> some View {
        let hora = evidence.stepTime(step)
        let hecho = hora != nil
        let corregir = porCorregir.contains(step)
        let corregido = !corregir && hecho && corregidos.contains(step)
        let color: Color? = corregir ? CorePalette.orange : (corregido ? CorePalette.blue : (hecho ? CorePalette.green : nil))
        let icono = corregir ? TeGlyph.returned : (corregido ? TeGlyph.correction : (hecho ? TeGlyph.done : TeGlyph.pending))
        let cuando = TeamEvidenceTime.when(hora)
        let detalle: String
        if corregir {
            detalle = "Por corregir"
        } else if corregido {
            detalle = "Corregido · \(cuando ?? "")"
        } else if hecho {
            detalle = cuando ?? "Hecho"
        } else {
            detalle = "Pendiente"
        }
        let detalleColor: Color = corregir ? CorePalette.orange : (corregido ? CorePalette.blue : NxColors.muted)
        return VStack(alignment: .leading, spacing: 0) {
            TeIconText(
                text: CoreEvidence.label(step, coreKind: coreKind),
                icon: icono,
                size: 12.5,
                weight: .bold,
                color: NxColors.fg,
                iconTint: color ?? NxColors.muted
            )
            Text(detalle)
                .font(.system(size: 11.5, weight: corregido ? .semibold : .regular))
                .foregroundStyle(detalleColor)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            color.map { $0.opacity(0.08) } ?? NxColors.card,
            in: RoundedRectangle(cornerRadius: 12, style: .continuous)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(color.map { $0.opacity(0.35) } ?? NxColors.border, lineWidth: 1)
        )
    }

    // MARK: Fotos

    private func entryExitRow(_ fotoSet: TeamEvidenceUI.PhotoSet) -> some View {
        HStack(alignment: .top, spacing: 10) {
            if let index = fotoSet.entrada {
                VStack(alignment: .leading, spacing: 6) {
                    TeamSectionTitle(
                        title: CoreEvidence.isComercial(coreKind) ? "Inicio" : "Entrada",
                        time: evidence.entryPhotoUploadedAt,
                        step: CoreEvidence.entryPhoto,
                        onDevolverPaso: onDevolverPaso
                    )
                    TeamPhotoThumb(item: fotoSet.items[index], label: fotoSet.labels[index], height: 160) {
                        onOpenVisor(fotoSet.items, index)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            if let index = fotoSet.salida {
                VStack(alignment: .leading, spacing: 6) {
                    TeamSectionTitle(
                        title: CoreEvidence.isComercial(coreKind) ? "Conclusión" : "Salida",
                        time: evidence.exitPhotoUploadedAt,
                        step: CoreEvidence.exitPhoto,
                        onDevolverPaso: onDevolverPaso
                    )
                    TeamPhotoThumb(item: fotoSet.items[index], label: fotoSet.labels[index], height: 160) {
                        onOpenVisor(fotoSet.items, index)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            if fotoSet.entrada == nil || fotoSet.salida == nil {
                Color.clear.frame(maxWidth: .infinity, maxHeight: 0)
            }
        }
    }

    private func siteSection(_ fotoSet: TeamEvidenceUI.PhotoSet) -> some View {
        let filas: [[Int]] = stride(from: 0, to: fotoSet.sitio.count, by: 3).map {
            Array(fotoSet.sitio[$0..<min($0 + 3, fotoSet.sitio.count)])
        }
        return VStack(alignment: .leading, spacing: 6) {
            TeamSectionTitle(
                title: "Fotos en sitio (\(fotoSet.sitio.count))",
                time: evidence.evidencePhotosUploadedAt,
                step: CoreEvidence.evidencePhotos,
                onDevolverPaso: onDevolverPaso
            )
            ForEach(Array(filas.enumerated()), id: \.offset) { _, fila in
                HStack(alignment: .top, spacing: 8) {
                    ForEach(fila, id: \.self) { index in
                        TeamPhotoThumb(item: fotoSet.items[index], label: fotoSet.labels[index], height: 110) {
                            onOpenVisor(fotoSet.items, index)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    ForEach(0..<(3 - fila.count), id: \.self) { _ in
                        Color.clear.frame(maxWidth: .infinity, maxHeight: 0)
                    }
                }
            }
        }
    }

    // MARK: Formulario

    private var formSection: some View {
        let entries = TeamEvidenceUI.formEntries(evidence.serviceSheetData, coreKind: coreKind)
        return VStack(alignment: .leading, spacing: 6) {
            TeamSectionTitle(
                title: "Formulario",
                time: evidence.serviceSheetCompletedAt,
                step: CoreEvidence.serviceSheetData,
                onDevolverPaso: onDevolverPaso
            )
            if entries.isEmpty {
                Text("Sin datos capturados.")
                    .font(.system(size: 13))
                    .foregroundStyle(NxColors.muted)
            }
            ForEach(Array(entries.enumerated()), id: \.offset) { _, entry in
                VStack(alignment: .leading, spacing: 3) {
                    Text(entry.label)
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(NxColors.muted)
                    Text(entry.value)
                        .font(.system(size: 14))
                        .foregroundStyle(NxColors.fg)
                        .lineSpacing(3.2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(NxColors.sunken, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
        }
    }
}

/// Título de una sección de la evidencia con su hora y «Devolver este paso» (Android `SectionTitle`).
private struct TeamSectionTitle: View {
    let title: String
    let time: String?
    let step: String
    let onDevolverPaso: ((String) -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center, spacing: 6) {
                Text(title)
                    .font(.system(size: 13, weight: .heavy))
                    .foregroundStyle(NxColors.fg)
                if let cuando = TeamEvidenceTime.when(time) {
                    Text(cuando)
                        .font(.system(size: 11.5))
                        .foregroundStyle(NxColors.muted)
                }
            }
            if let onDevolverPaso {
                Button {
                    onDevolverPaso(step)
                } label: {
                    TeIconText(text: "Devolver este paso", icon: TeGlyph.returned, size: 12.5, weight: .semibold, color: NxColors.brand)
                        .padding(.vertical, 4)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
    }
}

/// Miniatura con su etiqueta («Entrada», «Evidencia 2», «Salida») y «Ver en mapa» (Android `PhotoThumb`).
private struct TeamPhotoThumb: View {
    let item: CorePhotoItem
    let label: String
    let height: CGFloat
    let onOpen: () -> Void

    @Environment(\.openURL) private var openURL

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Button(action: onOpen) {
                Rectangle()
                    .fill(TeamEvidenceUI.photoBackdrop)
                    .frame(maxWidth: .infinity)
                    .frame(height: height)
                    .overlay {
                        AuthenticatedImage(url: item.url, contentMode: .fill, background: TeamEvidenceUI.photoBackdrop)
                    }
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .contentShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Ver foto: \(item.title)")
            Text(label)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(NxColors.fg)
                .lineLimit(1)
            if let url = TeamEvidenceUI.mapsURL(latitude: item.latitude, longitude: item.longitude) {
                Button {
                    openURL(url)
                } label: {
                    TeIconText(text: "Ver en mapa", icon: TeGlyph.location, size: 11.5, weight: .semibold, color: NxColors.brand)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
    }
}

/// Hoja de servicio protegida: se descarga con la sesión y se abre en el visor
/// de la app (Android `ProtectedPdfButton`).
private struct TeamPdfButton: View {
    let url: String
    var label: String = "Abrir PDF"
    var title: String = "Hoja de servicio"

    @State private var loading = false
    @State private var error: String?
    @State private var documento: TeamPdfDocument?

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Button {
                Task { await abrir() }
            } label: {
                HStack(alignment: .center, spacing: 6) {
                    if !loading {
                        Image(systemName: TeGlyph.pdf)
                            .font(.system(size: 15, weight: .regular))
                            .frame(width: 18, height: 18)
                            .accessibilityHidden(true)
                    }
                    Text(loading ? "Descargando…" : label)
                }
            }
            .buttonStyle(TePillStyle(horizontalPadding: 16))
            .disabled(loading)
            if let error {
                Text(error)
                    .font(NxType.bodySmall)
                    .foregroundStyle(NxColors.danger)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .fullScreenCover(item: $documento) { doc in
            NavigationStack {
                PDFViewerScreen(title: doc.title, data: doc.data)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Cerrar") { documento = nil }
                        }
                    }
            }
        }
    }

    @MainActor
    private func abrir() async {
        guard !loading else { return }
        loading = true
        error = nil
        defer { loading = false }
        do {
            let data = try await AuthenticatedAssetLoader.shared.data(for: url)
            guard !data.isEmpty else {
                error = "No se pudo abrir el PDF"
                return
            }
            documento = TeamPdfDocument(title: title, data: data)
        } catch let ApiError.http(code, _) where code == 404 || code == 410 {
            error = "El PDF ya no está en el servidor: hay que pedir que lo vuelva a subir."
        } catch {
            self.error = error.toUserMessage(fallback: "No se pudo abrir el PDF")
        }
    }
}

private struct TeamPdfDocument: Identifiable {
    let id = UUID()
    let title: String
    let data: Data
}

// MARK: - Historial de revisiones

/// «Revisiones (N)» con la copia de lo que se devolvió (Android `ReviewHistory`).
private struct TeamReviewHistory: View {
    let revisiones: [TeamEvidenceReview]
    let coreKind: String?
    let nombre: String
    let onOpenVisor: ([CorePhotoItem], Int) -> Void

    @State private var abierta: Int?

    var body: some View {
        if !revisiones.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text("Revisiones (\(revisiones.count))")
                    .font(.system(size: 13, weight: .heavy))
                    .foregroundStyle(NxColors.fg)
                ForEach(revisiones) { revision in
                    row(revision)
                }
            }
        }
    }

    private func row(_ revision: TeamEvidenceReview) -> some View {
        let tone = TeamEvidenceUI.decision(revision.decision)
        let color = tone.color ?? CorePalette.orange
        let revisor = CoreFormat.shortName(revision.revisor)
        let byline = "\(revisor.isEmpty ? "—" : revisor) · \(TeamEvidenceTime.when(revision.at) ?? "")"
        let abiertaAqui = abierta == revision.id
        return VStack(alignment: .leading, spacing: 4) {
            Text(tone.label)
                .font(.system(size: 13.5, weight: .bold))
                .foregroundStyle(NxColors.fg)
            Text(byline)
                .font(.system(size: 12))
                .foregroundStyle(NxColors.muted)
            if let score = revision.calificacion, score > 0 {
                CoreStars(value: score)
            }
            if revision.decision == "DEVUELTA_PASOS" && !revision.pasos.isEmpty {
                Text("Corregir: \(TeamEvidenceUI.stepList(revision.pasos, coreKind: coreKind))")
                    .font(.system(size: 12.5))
                    .foregroundStyle(NxColors.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if teHasText(revision.observaciones) {
                Text(revision.observaciones)
                    .font(.system(size: 13.5))
                    .foregroundStyle(NxColors.fg)
                    .lineSpacing(2.8)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let snapshot = revision.snapshot {
                Button {
                    abierta = abiertaAqui ? nil : revision.id
                } label: {
                    Text(abiertaAqui ? "Ocultar lo que se devolvió" : "Ver lo que se devolvió")
                        .font(.system(size: 12.5, weight: .semibold))
                        .foregroundStyle(NxColors.brand)
                        .padding(.vertical, 4)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                if abiertaAqui {
                    TeamEvidenceContent(
                        evidence: snapshot,
                        coreKind: coreKind,
                        nombre: nombre,
                        etiqueta: " (devuelta)",
                        onOpenVisor: onOpenVisor
                    )
                }
            }
        }
        .padding(.leading, 14)
        .padding(.trailing, 12)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(color.opacity(0.06))
        .overlay(alignment: .leading) {
            Rectangle()
                .fill(color)
                .frame(width: 3)
        }
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
}

// MARK: - Salida de zona

/// Una salida de la zona alrededor de su punto de inicio (Android `AlertaZonaFila`,
/// más «Dónde se detectó» y la foto en el visor, como la web).
private struct TeamZoneAlertRow: View {
    let alert: ActivityGeofenceAlert
    let onPhoto: () -> Void

    @Environment(\.openURL) private var openURL

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .center, spacing: 6) {
                TeIconText(
                    text: "Salió de zona \(TeamEvidenceTime.hora(alert.detectedAt)) · hasta \(alert.maxDistanciaM) m",
                    icon: TeGlyph.locationOff,
                    size: 12.5,
                    weight: .semibold,
                    color: TeamEvidenceUI.errorRed
                )
                .frame(maxWidth: .infinity, alignment: .leading)
                if alert.isJustified {
                    NxStatusChip(text: "Justificada", tone: .info)
                } else {
                    NxStatusChip(text: "Sin justificar", tone: .warning)
                }
            }
            Text(alert.returnedAt != nil ? "Regresó a las \(TeamEvidenceTime.hora(alert.returnedAt))" : "Sigue fuera de la zona")
                .font(.system(size: 11.5))
                .foregroundStyle(NxColors.muted)
            if let motivo = alert.justificacion, teHasText(motivo) {
                Text("Motivo: \(motivo)")
                    .font(.system(size: 12))
                    .foregroundStyle(NxColors.fg)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let url = alert.fotoUrl, teHasText(url) {
                Button(action: onPhoto) {
                    AuthenticatedImage(url: url, contentMode: .fill, background: NxColors.sunken)
                        .frame(width: 96, height: 96)
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Foto de la justificación")
            }
            if let mapa = TeamEvidenceUI.mapsURL(latitude: alert.latitude, longitude: alert.longitude) {
                Button {
                    openURL(mapa)
                } label: {
                    TeIconText(text: "Dónde se detectó", icon: TeGlyph.location, size: 12, weight: .semibold, color: NxColors.brand)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(NxColors.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

// MARK: - Hoja de revisión

/// Aprobar o devolver con calificación y observaciones (Android `ReviewSheet`, hoja inferior).
private struct TeamEvidenceReviewSheet: View {
    let activityId: Int
    let request: TeamEvidenceReviewRequest
    let coreKind: String?
    let onDone: (TeamEvidenceResponse, String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var aprobar: Bool
    @State private var todo = false
    @State private var marcados: Set<String>
    @State private var calificacion = 0
    @State private var observaciones = ""
    @State private var saving = false
    @State private var error: String?
    @FocusState private var focused: Bool

    private static let maxObservaciones = 2000

    init(
        activityId: Int,
        request: TeamEvidenceReviewRequest,
        coreKind: String?,
        onDone: @escaping (TeamEvidenceResponse, String) -> Void
    ) {
        self.activityId = activityId
        self.request = request
        self.coreKind = coreKind
        self.onDone = onDone
        _aprobar = State(initialValue: request.decision != "devolver")
        _marcados = State(initialValue: Set(request.pasos))
    }

    private var pasos: [String] { CoreEvidence.steps(for: coreKind) }
    private var nombre: String { CoreFormat.shortName(request.member.nombre) }
    /// Marcados en el orden de los pasos del tipo.
    private var elegidos: [String] { pasos.filter { marcados.contains($0) } }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                cabecera
                HStack(spacing: 8) {
                    TeamDecisionToggle(label: "Aprobar", selected: aprobar, color: CorePalette.green, icon: TeGlyph.approved) {
                        aprobar = true
                    }
                    TeamDecisionToggle(label: "Devolver", selected: !aprobar, color: CorePalette.orange, icon: TeGlyph.returned) {
                        aprobar = false
                    }
                }
                if !aprobar {
                    alcance
                }
                eficiencia
                campoObservaciones
                if let error {
                    Text(error)
                        .font(.system(size: 13.5))
                        .foregroundStyle(TeamEvidenceUI.errorRed)
                        .fixedSize(horizontal: false, vertical: true)
                }
                botones
            }
            .padding(.horizontal, 20)
            .padding(.top, 12)
            .padding(.bottom, 28)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(NxColors.card)
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .presentationBackground(NxColors.card)
        .presentationCornerRadius(20)
        .interactiveDismissDisabled(saving)
    }

    private var cabecera: some View {
        HStack(alignment: .center, spacing: 12) {
            CoreAvatar(name: request.member.nombre, url: request.member.avatarUrl, size: 40)
            VStack(alignment: .leading, spacing: 0) {
                Text("Revisar a \(nombre)")
                    .font(.system(size: 18, weight: .heavy))
                    .foregroundStyle(NxColors.fg)
                Text("Tu decisión, la calificación y tus observaciones le llegan y quedan en el historial.")
                    .font(.system(size: 12.5))
                    .foregroundStyle(NxColors.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var alcance: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("¿Qué debe rehacer?")
                .font(.system(size: 13, weight: .heavy))
                .foregroundStyle(NxColors.fg)
            TeamScopeOption(
                selected: !todo,
                color: CorePalette.orange,
                title: "Solo algunos pasos",
                subtitle: "Corrige únicamente lo que marques; lo demás se queda."
            ) {
                todo = false
            }
            if !todo {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(pasos, id: \.self) { step in
                        TeamCheckRow(label: CoreEvidence.label(step, coreKind: coreKind), checked: marcados.contains(step)) {
                            alternar(step)
                        }
                    }
                }
                .padding(.leading, 12)
            }
            TeamScopeOption(
                selected: todo,
                color: CorePalette.red,
                title: "Toda la actividad",
                subtitle: "Sus evidencias se vacían y las vuelve a subir desde cero. Lo que había queda guardado en el historial."
            ) {
                todo = true
            }
        }
    }

    private var eficiencia: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Eficiencia de \(nombre)")
                .font(.system(size: 13, weight: .heavy))
                .foregroundStyle(NxColors.fg)
            HStack(alignment: .center, spacing: 0) {
                ForEach(1...5, id: \.self) { n in
                    Button {
                        calificacion = n
                    } label: {
                        Image(systemName: "star.fill")
                            .font(.system(size: 26))
                            .foregroundStyle(n <= calificacion ? CorePalette.amber : NxColors.borderStrong)
                            .frame(width: 44, height: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(n) de 5: \(TeamEvidenceUI.califLabel(n))")
                }
                Spacer().frame(width: 6)
                Text(calificacion > 0 ? TeamEvidenceUI.califLabel(calificacion) : "Toca una estrella")
                    .font(.system(size: 13.5, weight: .bold))
                    .foregroundStyle(calificacion > 0 ? NxColors.fg : NxColors.muted)
            }
        }
    }

    /// `OutlinedTextField` de Android: etiqueta en el filo, ejemplo dentro, 4 renglones mínimo.
    private var campoObservaciones: some View {
        let etiqueta = aprobar ? "¿Por qué la apruebas?" : "¿Qué debe corregir y por qué?"
        let ejemplo = aprobar
            ? "Ej. Fotos claras, hoja firmada por el gerente y dejó el sitio limpio."
            : "Ej. La foto de salida no muestra el equipo instalado; tómala de frente."
        return TextField("", text: $observaciones, prompt: Text(ejemplo).foregroundColor(NxColors.muted), axis: .vertical)
            .font(NxType.bodyLarge)
            .foregroundStyle(NxColors.fg)
            .tint(NxColors.brand)
            .lineLimit(4...10)
            .focused($focused)
            .disabled(saving)
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .overlay(
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .strokeBorder(focused ? NxColors.brand : NxColors.borderStrong, lineWidth: focused ? 2 : 1)
            )
            .overlay(alignment: .topLeading) {
                Text(etiqueta)
                    .font(.system(size: 12))
                    .foregroundStyle(focused ? NxColors.brand : NxColors.muted)
                    .padding(.horizontal, 4)
                    .background(NxColors.card)
                    .offset(x: 12, y: -8)
                    .accessibilityHidden(true)
            }
            .padding(.top, 8)
            .accessibilityLabel(etiqueta)
            .onChange(of: observaciones) { _, nuevo in
                if nuevo.count > Self.maxObservaciones {
                    observaciones = String(nuevo.prefix(Self.maxObservaciones))
                }
            }
    }

    private var botones: some View {
        let n = elegidos.count
        let numero = n > 0 ? " \(n)" : ""
        let plural = n == 1 ? "" : "s"
        let confirmar: String
        if aprobar {
            confirmar = "Aprobar"
        } else if todo {
            confirmar = "Devolver todo"
        } else {
            confirmar = "Devolver\(numero) paso\(plural)"
        }
        let color = aprobar ? CorePalette.green : (todo ? CorePalette.red : CorePalette.orange)
        let icono = aprobar ? TeGlyph.approved : TeGlyph.returned
        return HStack(spacing: 8) {
            Button {
                dismiss()
            } label: {
                Text("Cancelar")
            }
            .buttonStyle(TePillStyle(minHeight: 48, fullWidth: true))
            .disabled(saving)
            Button {
                Task { await enviar() }
            } label: {
                HStack(alignment: .center, spacing: 6) {
                    if !saving {
                        Image(systemName: icono)
                            .font(.system(size: 15, weight: .semibold))
                            .frame(width: 18, height: 18)
                            .accessibilityHidden(true)
                    }
                    Text(saving ? "Guardando…" : confirmar)
                        .font(.system(size: 14, weight: .bold))
                }
            }
            .buttonStyle(TePillStyle(fill: color, foreground: .white, border: nil, minHeight: 48, fullWidth: true))
            .disabled(saving)
        }
    }

    private func alternar(_ step: String) {
        if marcados.contains(step) {
            marcados.remove(step)
        } else {
            marcados.insert(step)
        }
    }

    @MainActor
    private func enviar() async {
        let pasosElegidos = elegidos
        let faltan = TeamEvidenceUI.revisionFaltantes(
            aprobar: aprobar,
            todo: todo,
            pasosMarcados: pasosElegidos.count,
            calificacion: calificacion,
            observaciones: observaciones
        )
        guard faltan.isEmpty else {
            error = "Falta: \(faltan.joined(separator: ", "))."
            return
        }
        saving = true
        error = nil
        defer { saving = false }
        let input = ReviewEvidenceInput(
            decision: aprobar ? "aprobar" : "devolver",
            pasos: (!aprobar && !todo) ? pasosElegidos : nil,
            todo: aprobar ? nil : todo,
            observaciones: observaciones.trimmingCharacters(in: .whitespacesAndNewlines),
            calificacion: calificacion
        )
        let texto: String
        if aprobar {
            texto = "Aprobaste la evidencia de \(nombre)."
        } else if todo {
            texto = "Devolviste toda la evidencia a \(nombre): la rehace desde cero."
        } else {
            texto = "Devolviste \(pasosElegidos.count) paso\(pasosElegidos.count == 1 ? "" : "s") a \(nombre)."
        }
        do {
            // Decisión de un superior: sin señal falla a la vista, no se encola.
            try await CoreRepository.requireOnline()
            let nuevo = try await CoreRepository.shared.reviewTeamEvidence(
                activityId: activityId,
                userId: request.member.userId,
                input: input
            )
            onDone(nuevo, texto)
        } catch {
            self.error = error.toUserMessage(fallback: "No se pudo guardar la revisión")
        }
    }
}

/// «Aprobar» / «Devolver» de la hoja (Android `DecisionToggle`).
private struct TeamDecisionToggle: View {
    let label: String
    let selected: Bool
    let color: Color
    let icon: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            TeIconText(text: label, icon: icon, size: 15, weight: .bold, color: selected ? color : NxColors.fg)
                .frame(maxWidth: .infinity, minHeight: 50)
                .background(
                    selected ? color.opacity(0.12) : NxColors.card,
                    in: RoundedRectangle(cornerRadius: 12, style: .continuous)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .strokeBorder(selected ? color : NxColors.border, lineWidth: 2)
                )
                .contentShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? AccessibilityTraits.isSelected : [])
    }
}

/// «Solo algunos pasos» / «Toda la actividad» (Android `ScopeOption`).
private struct TeamScopeOption: View {
    let selected: Bool
    let color: Color
    let title: String
    let subtitle: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(alignment: .top, spacing: 0) {
                TeamRadio(selected: selected)
                    .frame(width: 48, height: 48)
                VStack(alignment: .leading, spacing: 0) {
                    Text(title)
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(NxColors.fg)
                    Text(subtitle)
                        .font(.system(size: 12.5))
                        .foregroundStyle(NxColors.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.top, 10)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(8)
            .background(
                selected ? color.opacity(0.08) : NxColors.card,
                in: RoundedRectangle(cornerRadius: 12, style: .continuous)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .strokeBorder(selected ? color : NxColors.border, lineWidth: 1.5)
            )
            .contentShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? AccessibilityTraits.isSelected : [])
    }
}

/// `RadioButton` de Material 3: aro de 20 y punto de 10 en el color de marca.
private struct TeamRadio: View {
    let selected: Bool

    var body: some View {
        ZStack {
            Circle()
                .strokeBorder(selected ? NxColors.brand : NxColors.muted, lineWidth: 2)
                .frame(width: 20, height: 20)
            if selected {
                Circle()
                    .fill(NxColors.brand)
                    .frame(width: 10, height: 10)
            }
        }
        .accessibilityHidden(true)
    }
}

/// Paso a marcar (Android `Checkbox` + etiqueta, 44 de alto).
private struct TeamCheckRow: View {
    let label: String
    let checked: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(alignment: .center, spacing: 0) {
                ZStack {
                    RoundedRectangle(cornerRadius: 2, style: .continuous)
                        .fill(checked ? NxColors.brand : Color.clear)
                    RoundedRectangle(cornerRadius: 2, style: .continuous)
                        .strokeBorder(checked ? NxColors.brand : NxColors.muted, lineWidth: 2)
                    if checked {
                        Image(systemName: "checkmark")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundStyle(Color.white)
                    }
                }
                .frame(width: 18, height: 18)
                .frame(width: 48, height: 48)
                .accessibilityHidden(true)
                Text(label)
                    .font(.system(size: 14))
                    .foregroundStyle(NxColors.fg)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(checked ? AccessibilityTraits.isSelected : [])
    }
}

// MARK: - Visor de fotos

/// Visor a pantalla completa (Android `EvidencePhotoViewer`): se desliza entre
/// fotos, dice cuál es («2 de 5») con su hora y abre la ubicación en el mapa.
/// `CorePhotoViewer(item:)` es el mismo visor con una sola foto.
struct CorePhotoViewer: View {
    let items: [CorePhotoItem]

    @State private var page: Int
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL

    /// Fondo del diálogo de Android (#020617).
    private static let fondo = NxColors.rgb(0x020617)

    init(item: CorePhotoItem) {
        self.init(items: [item], startIndex: 0)
    }

    init(items: [CorePhotoItem], startIndex: Int = 0) {
        self.items = items
        let ultimo = max(items.count - 1, 0)
        _page = State(initialValue: min(max(startIndex, 0), ultimo))
    }

    private var current: CorePhotoItem? {
        items.indices.contains(page) ? items[page] : nil
    }

    private var subtitulo: String {
        var partes: [String] = []
        if let cuando = TeamEvidenceTime.when(current?.time) {
            partes.append(cuando)
        }
        partes.append("\(page + 1) de \(max(items.count, 1))")
        return partes.joined(separator: " · ")
    }

    var body: some View {
        ZStack {
            Self.fondo.ignoresSafeArea()
            VStack(alignment: .leading, spacing: 12) {
                cabecera
                paginas
                pie
            }
            .padding(16)
        }
        .statusBarHidden(true)
    }

    private var cabecera: some View {
        HStack(alignment: .center, spacing: 8) {
            VStack(alignment: .leading, spacing: 0) {
                Text(current?.title ?? "")
                    .font(.system(size: 15, weight: .heavy))
                    .foregroundStyle(Color.white)
                    .lineLimit(2)
                Text(subtitulo)
                    .font(.system(size: 12.5))
                    .foregroundStyle(Color.white.opacity(0.8))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(Color.white)
                    .frame(width: 48, height: 48)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Cerrar")
        }
    }

    @ViewBuilder
    private var paginas: some View {
        if items.isEmpty {
            Color.clear.frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            TabView(selection: $page) {
                ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                    AuthenticatedImage(url: item.url, contentMode: .fit, background: Color.clear)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .accessibilityLabel(item.title)
                        .tag(index)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .tint(Color.white)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private var pie: some View {
        HStack(alignment: .center, spacing: 6) {
            Button {
                withAnimation { page = max(page - 1, 0) }
            } label: {
                Text("←")
            }
            .buttonStyle(TePillStyle(foreground: .white))
            .disabled(page <= 0)
            .accessibilityLabel("Foto anterior")
            Group {
                if let url = TeamEvidenceUI.mapsURL(latitude: current?.latitude, longitude: current?.longitude) {
                    Button {
                        openURL(url)
                    } label: {
                        TeIconText(text: "Ver en mapa", icon: TeGlyph.location, size: 14, weight: .semibold, color: .white)
                            .padding(.horizontal, 12)
                            .frame(minHeight: 40)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                } else {
                    Text("Sin ubicación registrada")
                        .font(.system(size: 12.5))
                        .foregroundStyle(Color.white.opacity(0.6))
                }
            }
            .frame(maxWidth: .infinity)
            Button {
                withAnimation { page = min(page + 1, max(items.count - 1, 0)) }
            } label: {
                Text("→")
            }
            .buttonStyle(TePillStyle(foreground: .white))
            .disabled(page >= items.count - 1)
            .accessibilityLabel("Foto siguiente")
        }
    }
}
