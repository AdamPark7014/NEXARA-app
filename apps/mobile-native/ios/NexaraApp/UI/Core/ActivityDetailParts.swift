import SwiftUI

// Piezas del detalle de actividad v2, espejo de `ActivityDetailParts.kt` de Android:
// cabecera con chips planos y título grande, tarjeta del sitio, tira de datos, nota
// suave, lista de pasos de evidencia, el dock inferior fijo y el aviso tipo snackbar.
// Medidas, pesos y colores = los de Android (`NxColors`).

// MARK: - Formato en hora de México

/// Fechas y horas del detalle SIEMPRE en America/Mexico_City (no en la zona del
/// teléfono) y con las abreviaturas fijas de Android (`NxFormat.patron`: «sept»,
/// «mié», «sáb»…).
enum ActivityDetailFormat {
    static let mexico = TimeZone(identifier: "America/Mexico_City") ?? .current

    private static let calendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = mexico
        return c
    }()

    private static let meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"]
    /// `Calendar.weekday`: 1 = domingo.
    private static let dias = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"]

    private static let isoFractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static let isoPlain: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    /// Sin zona: hora local de México (Android `LocalDateTime.parse(...).atZone(zone)`).
    private static let localFormatters: [DateFormatter] = [
        "yyyy-MM-dd'T'HH:mm:ss.SSS",
        "yyyy-MM-dd'T'HH:mm:ss",
        "yyyy-MM-dd'T'HH:mm",
        "yyyy-MM-dd",
    ].map { pattern in
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.calendar = Calendar(identifier: .gregorian)
        f.timeZone = mexico
        f.dateFormat = pattern
        return f
    }

    static func parse(_ raw: String?) -> Date? {
        let text = (raw ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, text != "null" else { return nil }
        if let date = isoFractional.date(from: text) ?? isoPlain.date(from: text) { return date }
        for formatter in localFormatters {
            if let date = formatter.date(from: text) { return date }
        }
        return nil
    }

    private static func two(_ value: Int) -> String { value < 10 ? "0\(value)" : "\(value)" }

    /// «09:30».
    static func clock(_ date: Date) -> String {
        let p = calendar.dateComponents([.hour, .minute], from: date)
        return "\(two(p.hour ?? 0)):\(two(p.minute ?? 0))"
    }

    /// «09:30»; «—» si no hay hora legible (Android `formatClock`).
    static func clock(_ raw: String?) -> String {
        guard let date = parse(raw) else { return "—" }
        return clock(date)
    }

    /// «26 sept 2026».
    static func day(_ date: Date) -> String {
        let p = calendar.dateComponents([.year, .month, .day], from: date)
        let mes = meses[max(0, min(11, (p.month ?? 1) - 1))]
        return "\(p.day ?? 1) \(mes) \(p.year ?? 2026)"
    }

    /// «lun 14 sept · 09:30» (Android `formatWhen`); `nil` sin fecha.
    static func when(_ raw: String?) -> String? {
        guard let date = parse(raw) else { return nil }
        let p = calendar.dateComponents([.weekday, .month, .day], from: date)
        let dia = dias[max(0, min(6, (p.weekday ?? 1) - 1))]
        let mes = meses[max(0, min(11, (p.month ?? 1) - 1))]
        return "\(dia) \(p.day ?? 1) \(mes) · \(clock(date))"
    }

    /// «14 sept 2026 · 09:30» (Android `formatFull`); `nil` sin fecha.
    static func full(_ raw: String?) -> String? {
        guard let date = parse(raw) else { return nil }
        return "\(day(date)) · \(clock(date))"
    }

    /// «26 sept 2026» (Android `NxFormat.date`): «—» sin fecha; lo que no se entiende, tal cual.
    static func date(_ raw: String?) -> String {
        let text = (raw ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, text != "null" else { return "—" }
        guard let date = parse(text) else { return text }
        return day(date)
    }

    /// «26 sept 2026, 14:30» (Android `NxFormat.dateTime`).
    static func dateTime(_ raw: String?) -> String {
        let text = (raw ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, text != "null" else { return "—" }
        if text.count <= 10 { return date(text) }
        guard let date = parse(text) else { return text }
        return "\(day(date)), \(clock(date))"
    }

    /// «45 min», «2 h», «2 h 30 min»; «—» sin dato (Android `formatMinutes`).
    static func minutes(_ value: Double?) -> String {
        guard let value, value.isFinite, value > 0 else { return "—" }
        let total = Int(value.rounded())
        let h = total / 60
        let m = total % 60
        if h <= 0 { return "\(m) min" }
        if m == 0 { return "\(h) h" }
        return "\(h) h \(m) min"
    }

    /// «Justo ahora», «Hace 12 min», «En 3h», «Hace 2d» (Android `relativeTime`).
    static func relative(_ raw: String?, now: Date = Date()) -> String {
        guard let date = parse(raw) else { return "" }
        let diff = now.timeIntervalSince(date)
        let mins = Int((abs(diff) / 60).rounded())
        if mins < 2 { return "Justo ahora" }
        func fmt(_ v: String) -> String { diff < 0 ? "En \(v)" : "Hace \(v)" }
        if mins < 60 { return fmt("\(mins) min") }
        let hrs = Int((Double(mins) / 60).rounded())
        if hrs < 24 { return fmt("\(hrs)h") }
        return fmt("\(Int((Double(hrs) / 24).rounded()))d")
    }

    /// Fecha y hora de México → ISO-8601 UTC para el API.
    static func isoString(_ date: Date) -> String { isoFractional.string(from: date) }
}

// MARK: - Reglas de pantalla

/// Reglas de la cabecera, el aviso de cancelada y la línea de tiempo
/// (`CoreActivityRules`, `ActivitySemaforo` y `ActivitySuperiorRules` de Android).
enum ActivityDetailRules {
    /// Estatus que ofrece «Editar» (Android `ACTIVITY_STATUSES`).
    static let estatuses = ["Pendiente", "Asignada", "En Proceso", "Por Validar", "Finalizada", "Cancelada", "Reprogramar"]
    /// Prioridades que ofrece «Editar» (Android `ACTIVITY_PRIORITIES`).
    static let prioridades = ["BAJA", "MEDIA", "ALTA", "URGENTE"]

    private static func contains(_ text: String?, _ pattern: String) -> Bool {
        (text ?? "").range(of: pattern, options: [.regularExpression, .caseInsensitive]) != nil
    }

    /// Estado de la cabecera: la sesión manda («En pausa», «En curso»); si no, el
    /// estatus en palabras de campo con el color de Android (`ActivityHeaderV2`).
    static func estado(estatus: String?, sesion: SesionActividad?) -> (label: String, color: Color) {
        if sesion?.enPausa == true { return ("En pausa", NxColors.warning) }
        if sesion?.enCurso == true { return ("En curso", NxColors.info) }
        if contains(estatus, "proceso") { return ("En curso", NxColors.info) }
        if contains(estatus, "validar") { return ("En revisión", NxColors.info) }
        if contains(estatus, "rechazada") { return ("Te la regresaron", NxColors.danger) }
        if contains(estatus, "finalizada|completada|aprobada") { return ("Terminada", NxColors.success) }
        if contains(estatus, "cancelada") { return ("Cancelada", NxColors.fg2) }
        return ("Por empezar", NxColors.fg2)
    }

    /// Semáforo que calcula el servidor (`ActivitySemaforo.luz`); `nil` si no llega.
    static func luz(_ semaforo: String?) -> (etiqueta: String, color: Color)? {
        switch (semaforo ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "rojo": return ("Atrasada", NxColors.rojo)
        case "amarillo": return ("Por vencer", NxColors.naranja)
        case "verde": return ("En tiempo", NxColors.verde)
        default: return nil
        }
    }

    /// Alta o urgente = «Urgente» (`CoreActivityRules.isUrgent`).
    static func isUrgent(_ prioridad: String?) -> Bool {
        let p = (prioridad ?? "media").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return p == "alta" || p == "urgente"
    }

    /// «Plan 2 h · real 2 h 30 min» (`ActivitySemaforo.planRealTexto`).
    static func planRealTexto(plan: Double?, real: Double?) -> String? {
        let p = (plan ?? 0) > 0 ? plan : nil
        let r = (real ?? 0) > 0 ? real : nil
        if let p, let r { return "Plan \(ActivityDetailFormat.minutes(p)) · real \(ActivityDetailFormat.minutes(r))" }
        if let p { return "Plan \(ActivityDetailFormat.minutes(p))" }
        if let r { return "Real \(ActivityDetailFormat.minutes(r))" }
        return nil
    }

    /// «Asignada por Luis Pérez»; `nil` si nadie la asignó.
    static func asignadaPorTexto(_ nombre: String?) -> String? {
        let n = shortName(nombre)
        return n.isEmpty ? nil : "Asignada por \(n)"
    }

    /// Nombre y primer apellido.
    static func shortName(_ name: String?) -> String {
        (name ?? "").split(whereSeparator: { $0.isWhitespace }).prefix(2).joined(separator: " ")
    }

    /// Icono del tipo de actividad (`CoreActivityRules.kindGlyph`).
    static func kindSymbol(_ coreKind: String?) -> String {
        switch (coreKind ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "tarea": return "checkmark.circle"
        case "proyecto": return "folder"
        case "obra": return "hammer"
        case "servicio": return "wrench.and.screwdriver"
        case "comercial": return "briefcase"
        default: return "pin"
        }
    }

    /// `ActivitySuperiorRules.estaCancelada`.
    static func estaCancelada(estatus: String?, cancelledAt: String?) -> Bool {
        (estatus ?? "").trimmingCharacters(in: .whitespacesAndNewlines).caseInsensitiveCompare("Cancelada") == .orderedSame
            || !(cancelledAt ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// «Cancelada por Luis Pérez · El cliente pospuso el servicio» (`avisoCancelada`).
    static func avisoCancelada(estatus: String?, cancelledAt: String?, canceladaPor: String?, motivo: String?) -> String? {
        guard estaCancelada(estatus: estatus, cancelledAt: cancelledAt) else { return nil }
        return ActivityCancelNotice.text(motivo: motivo, canceladaPor: canceladaPor) ?? "Cancelada"
    }

    /// Prioridad en palabras (`NxStatusLabels.priority`); `nil` sin prioridad.
    static func priorityLabel(_ raw: String?) -> String? {
        let key = (raw ?? "").trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        switch key {
        case "", "—", "NULL": return nil
        case "LOW", "BAJA": return "Baja"
        case "MEDIUM", "NORMAL", "MEDIA": return "Media"
        case "HIGH", "ALTA": return "Alta"
        case "URGENT", "URGENTE", "CRITICAL", "CRITICA", "CRÍTICA": return "Urgente"
        default: return humanize(raw ?? "")
        }
    }

    /// Enum crudo → «Preventivo» (`NxStatusLabels.label`, sin la tabla de estatus de pago).
    static func humanize(_ raw: String) -> String {
        let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if text.isEmpty || text == "null" { return "Sin estatus" }
        let human = text.replacingOccurrences(of: "_", with: " ").lowercased()
        return human.prefix(1).uppercased() + human.dropFirst()
    }

    /// Etiqueta del tipo de evento del historial (`timelineKindLabel`).
    static func timelineKindLabel(_ kind: String?) -> String {
        let k = (kind ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        switch k {
        case "enviada": return "Enviada"
        case "reprogramada": return "Reprogramada"
        case "cumplida": return "Cumplida"
        case "revision", "revisión": return "Revisión"
        case "evidencia": return "Evidencia"
        case "estado": return "Estado"
        case "agenda": return "Agenda"
        case "despacho": return "Despacho"
        case "acs": return "ACS"
        case "incidencia": return "Incidencia"
        case "recomendación", "recomendacion": return "Recomendación"
        case "material": return "Material"
        case "reasignación", "reasignacion": return "Reasignación"
        case "": return "Evento"
        default:
            let raw = (kind ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            return raw.prefix(1).uppercased() + raw.dropFirst()
        }
    }

    /// Color de la raya y del chip de cada evento; `nil` = marca (raya) / gris (chip).
    static func timelineColor(_ kind: String?) -> Color? {
        switch (kind ?? "").lowercased() {
        case "enviada", "despacho": return NxColors.azul
        case "reprogramada": return NxColors.naranja
        case "cumplida": return NxColors.verde
        case "revision", "revisión": return NxColors.morado
        default: return nil
        }
    }
}

// MARK: - Cabecera

/// Cabecera (`ActivityHeaderV2`): tipo · estado · semáforo · urgente · despacho,
/// título a 22 Bold y «Folio X · Asignada por Y · Plan/Real».
struct ActivityHeaderV2: View {
    let activityId: Int
    let titulo: String
    let folio: String
    let coreKind: String?
    let ticketTypeCustom: String?
    let estatus: String?
    let prioridad: String?
    let semaforo: String?
    let asignadoPor: String?
    let minutosPlan: Double?
    let minutosReales: Double?
    let sesion: SesionActividad?
    let isDespacho: Bool

    private var tituloMostrado: String {
        let t = titulo.trimmingCharacters(in: .whitespacesAndNewlines)
        if !t.isEmpty { return t }
        let f = folio.trimmingCharacters(in: .whitespacesAndNewlines)
        if !f.isEmpty { return f }
        return "Actividad #\(activityId)"
    }

    private var meta: String {
        let f = folio.trimmingCharacters(in: .whitespacesAndNewlines)
        return [
            f.isEmpty ? nil : "Folio \(f)",
            ActivityDetailRules.asignadaPorTexto(asignadoPor),
            ActivityDetailRules.planRealTexto(plan: minutosPlan, real: minutosReales),
        ]
        .compactMap { $0 }
        .joined(separator: " · ")
    }

    var body: some View {
        let estado = ActivityDetailRules.estado(estatus: estatus, sesion: sesion)
        VStack(alignment: .leading, spacing: 8) {
            CoreFlowLayout(spacing: 6) {
                NxChip(
                    text: CoreStatusUI.kind(coreKind, ticketTypeCustom: ticketTypeCustom),
                    color: NxBrand.category(coreKind),
                    systemImage: ActivityDetailRules.kindSymbol(coreKind)
                )
                NxChip(text: estado.label, color: estado.color, dot: true)
                if let luz = ActivityDetailRules.luz(semaforo) {
                    NxChip(text: luz.etiqueta, color: luz.color)
                }
                if ActivityDetailRules.isUrgent(prioridad) {
                    NxChip(text: "Urgente", color: NxColors.danger)
                }
                if isDespacho {
                    NxChip(text: "Despacho", color: NxColors.categoryMagenta, systemImage: "paperplane")
                }
            }
            Text(tituloMostrado)
                .font(.system(size: 22, weight: .bold))
                .lineSpacing(0.6)
                .foregroundStyle(NxColors.fg)
                .lineLimit(3)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            if !meta.isEmpty {
                Text(meta)
                    .font(.system(size: 13))
                    .foregroundStyle(NxColors.muted)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Sitio y datos

/// Dónde es el trabajo (`ActivityPlaceCard`): cliente, sucursal y «Mapa» si hay coordenadas.
struct ActivityPlaceCard: View {
    let titulo: String
    let detalle: String
    let mapsURL: URL?
    @Environment(\.openURL) private var openURL

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            Image(systemName: "mappin.and.ellipse")
                .font(.system(size: 19, weight: .regular))
                .foregroundStyle(NxColors.info)
                .frame(width: 44, height: 44)
                .background(NxColors.infoSoft, in: RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 1) {
                Text(titulo)
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(NxColors.fg)
                    .lineLimit(1)
                if !detalle.isEmpty {
                    Text(detalle)
                        .font(.system(size: 13))
                        .foregroundStyle(NxColors.muted)
                        .lineLimit(2)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if let mapsURL {
                Button {
                    openURL(mapsURL)
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "map")
                            .font(.system(size: 15, weight: .semibold))
                            .frame(width: 18, height: 18)
                        Text("Mapa").font(.system(size: 14, weight: .bold))
                    }
                    .foregroundStyle(NxColors.brandText)
                    .padding(.horizontal, 14)
                    .frame(minHeight: 44)
                    .background(NxColors.brandSoft, in: RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous))
                    .contentShape(Rectangle())
                }
                .buttonStyle(NxPressableStyle())
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(NxColors.card, in: RoundedRectangle(cornerRadius: NxRadius.l, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: NxRadius.l, style: .continuous)
                .strokeBorder(NxColors.border, lineWidth: 1)
        )
    }
}

/// Una celda de la tira de datos.
struct ActivityFact: Identifiable {
    let etiqueta: String
    let valor: String
    var id: String { etiqueta }
}

/// Tira de tres datos (`ActivityFactsStrip`): Plan | Real (o Desde) | Entrega.
/// Si las tres van vacías no se dibuja.
struct ActivityFactsStrip: View {
    let celdas: [ActivityFact]

    var body: some View {
        if !celdas.allSatisfy({ $0.valor == "—" }) {
            HStack(spacing: 0) {
                ForEach(Array(celdas.enumerated()), id: \.offset) { index, celda in
                    if index > 0 {
                        Rectangle().fill(NxColors.borderSubtle).frame(width: 1)
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text(celda.etiqueta)
                            .font(.system(size: 11.5, weight: .medium))
                            .foregroundStyle(NxColors.muted)
                            .lineLimit(1)
                        Text(celda.valor)
                            .font(.system(size: 14.5, weight: .bold))
                            .foregroundStyle(celda.valor == "—" ? NxColors.fg4 : NxColors.fg)
                            .lineLimit(1)
                            .truncationMode(.tail)
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .fixedSize(horizontal: false, vertical: true)
            .background(NxColors.card, in: RoundedRectangle(cornerRadius: NxRadius.l, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: NxRadius.l, style: .continuous)
                    .strokeBorder(NxColors.border, lineWidth: 1)
            )
            .accessibilityElement(children: .combine)
        }
    }
}

/// Nota con fondo suave (`SoftNote`): indicaciones y avisos. Con color, fondo al 9 %.
struct ActivitySoftNote: View {
    let text: String
    var title: String? = nil
    var color: Color? = nil
    var systemImage: String? = nil

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            if let systemImage {
                Image(systemName: systemImage)
                    .font(.system(size: 15, weight: .regular))
                    .foregroundStyle(color ?? NxColors.muted)
                    .frame(width: 18, height: 18)
                    .padding(.top, 1)
                    .accessibilityHidden(true)
            }
            VStack(alignment: .leading, spacing: 2) {
                if let title, !title.isEmpty {
                    Text(title)
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(NxColors.fg)
                }
                Text(text)
                    .font(.system(size: 13))
                    .lineSpacing(2.4)
                    .foregroundStyle(NxColors.fg)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(color.map { $0.opacity(0.09) } ?? NxColors.sunken, in: RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}

/// Renglón de datos (`ADetailRow`): etiqueta 13 gris, valor 13 Medium. «—» o vacío no se pinta.
struct ActivityDetailRow: View {
    let label: String
    let value: String

    var body: some View {
        let v = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if !v.isEmpty && v != "—" {
            HStack(alignment: .top, spacing: 8) {
                Text(label)
                    .font(.system(size: 13))
                    .foregroundStyle(NxColors.muted)
                Spacer(minLength: 8)
                Text(v)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(NxColors.fg)
                    .multilineTextAlignment(.trailing)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .accessibilityElement(children: .combine)
        }
    }
}

// MARK: - Pasos de evidencia

/// Lista de pasos de evidencia (`ActivityStepsCard`): hecho · actual · pendiente,
/// con «N de M» y barra de avance arriba. Tocar cualquier paso abre Evidencias.
struct ActivityStepsCard: View {
    let pasos: [ActivityDockRules.Paso]
    let onOpen: () -> Void

    var body: some View {
        if !pasos.isEmpty {
            let hechos = ActivityDockRules.hechos(pasos)
            VStack(spacing: 0) {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(alignment: .center) {
                        Text("Pasos de evidencia")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundStyle(NxColors.fg)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        Text("\(hechos) de \(pasos.count)")
                            .font(.system(size: 13.5, weight: .semibold))
                            .foregroundStyle(NxColors.muted)
                    }
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule().fill(NxColors.sunken)
                            Capsule()
                                .fill(NxColors.brand)
                                .frame(width: geo.size.width * CGFloat(hechos) / CGFloat(max(pasos.count, 1)))
                        }
                    }
                    .frame(height: 8)
                    .accessibilityHidden(true)
                }
                .padding(.horizontal, 16)
                .padding(.top, 14)
                .padding(.bottom, 8)
                ForEach(Array(pasos.enumerated()), id: \.element.id) { index, paso in
                    if index > 0 { NxRowDivider() }
                    fila(paso)
                }
            }
            .background(NxColors.card)
            .clipShape(RoundedRectangle(cornerRadius: NxRadius.l, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: NxRadius.l, style: .continuous)
                    .strokeBorder(NxColors.border, lineWidth: 1)
            )
        }
    }

    private func fila(_ paso: ActivityDockRules.Paso) -> some View {
        let actual = paso.estado == .actual
        let hecho = paso.estado == .hecho
        return Button(action: onOpen) {
            HStack(alignment: .center, spacing: 12) {
                if actual {
                    RoundedRectangle(cornerRadius: 2, style: .continuous)
                        .fill(NxColors.brand)
                        .frame(width: 3, height: 40)
                }
                ZStack {
                    RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous)
                        .fill(hecho ? NxColors.successSoft : (actual ? NxColors.brand : NxColors.sunken))
                    if !hecho && !actual {
                        RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous)
                            .strokeBorder(NxColors.borderStrong, lineWidth: 1.5)
                    }
                    Image(systemName: hecho ? "checkmark" : paso.systemImage)
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(hecho ? NxColors.success : (actual ? Color.white : NxColors.muted))
                }
                .frame(width: 40, height: 40)
                VStack(alignment: .leading, spacing: 1) {
                    Text(paso.label)
                        .font(.system(size: 14.5, weight: .semibold))
                        .foregroundStyle(hecho || actual ? NxColors.fg : NxColors.fg2)
                        .lineLimit(1)
                    Text(paso.detalle)
                        .font(.system(size: 12.5))
                        .foregroundStyle(NxColors.muted)
                        .lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if actual {
                    NxChip(text: "Sigue", color: NxColors.brandText)
                } else {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(NxColors.fg4)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(actual ? NxColors.brandSoft.opacity(0.6) : Color.clear)
            .contentShape(Rectangle())
        }
        .buttonStyle(NxPressableStyle())
        .accessibilityElement(children: .combine)
        .accessibilityValue(hecho ? "Hecho" : (actual ? "Paso actual" : "Pendiente"))
    }
}

// MARK: - Dock inferior

/// Acción secundaria del dock (`DockSecondary`: Pausar, Adjuntar, Tomar otra…).
struct ActivityDockSecondary: Identifiable {
    let label: String
    let systemImage: String?
    var enabled: Bool = true
    let action: () -> Void
    var id: String { label }
}

/// El botón grande del dock mientras el flujo de captura está en pantalla
/// (Android `EvidenceDockAction`). Lo publica `EvidenceCaptureFlowView` con los
/// mismos cierres que usan sus botones; el detalle lo pinta al alcance del pulgar.
struct EvidenceDockAction {
    let label: String
    let enabled: Bool
    let systemImage: String?
    /// Una línea bajo el dock: qué falta o qué pasa al tocar.
    let hint: String?
    let onPrimary: () -> Void
    /// Acción secundaria opcional («Adjuntar», «Tomar otra»).
    var secondaryLabel: String? = nil
    var secondarySystemImage: String? = nil
    var onSecondary: (() -> Void)? = nil

    /// Lo que se ve: mismo texto, estado, ayuda y secundaria = no hace falta volver a pintar.
    var look: String {
        [
            label, enabled ? "1" : "0", systemImage ?? "", hint ?? "",
            secondaryLabel ?? "", secondarySystemImage ?? "", onSecondary == nil ? "0" : "1",
        ].joined(separator: "|")
    }

    func sameLook(_ other: EvidenceDockAction?) -> Bool {
        guard let other else { return false }
        return look == other.look
    }
}

/// Dock inferior fijo (`ActivityDock`): superficie blanca con sombra 8, botón
/// principal de 56 con radio 18 y texto 16 Bold, secundarias de contorno de 52 en
/// una fila y una línea de ayuda. Va en `safeAreaInset(edge: .bottom)`.
struct ActivityDockBar: View {
    let label: String
    var systemImage: String? = nil
    var enabled: Bool = true
    var loading: Bool = false
    var hint: String? = nil
    var error: String? = nil
    var secondary: [ActivityDockSecondary] = []
    let onPrimary: () -> Void

    private var on: Bool { enabled && !loading }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Rectangle()
                .fill(NxColors.borderSubtle)
                .frame(height: 1)
                .padding(.bottom, 2)
            Button(action: onPrimary) {
                HStack(spacing: 0) {
                    if loading {
                        ProgressView()
                            .controlSize(.small)
                            .tint(Color.white)
                            .frame(width: 20, height: 20)
                            .padding(.trailing, 10)
                    } else if let systemImage {
                        Image(systemName: systemImage)
                            .font(.system(size: 19, weight: .semibold))
                            .frame(width: 22, height: 22)
                            .padding(.trailing, 8)
                            .accessibilityHidden(true)
                    }
                    Text(label)
                        .font(.system(size: 16, weight: .bold))
                        .lineLimit(1)
                        .truncationMode(.tail)
                }
                .foregroundStyle(on ? Color.white : NxColors.fg4)
                .padding(.horizontal, 24)
                .frame(maxWidth: .infinity, minHeight: NxMetrics.dockButtonHeight)
                .background(
                    on ? NxColors.brand : NxColors.sunken,
                    in: RoundedRectangle(cornerRadius: 18, style: .continuous)
                )
                .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
            .buttonStyle(NxPressableStyle())
            .disabled(!on)

            if !secondary.isEmpty {
                HStack(spacing: 8) {
                    ForEach(secondary) { item in
                        let activo = item.enabled && !loading
                        Button(action: item.action) {
                            HStack(spacing: 0) {
                                if let icon = item.systemImage {
                                    Image(systemName: icon)
                                        .font(.system(size: 15, weight: .semibold))
                                        .frame(width: 18, height: 18)
                                        .padding(.trailing, 6)
                                        .accessibilityHidden(true)
                                }
                                Text(item.label)
                                    .font(.system(size: 14, weight: .semibold))
                                    .lineLimit(1)
                                    .truncationMode(.tail)
                            }
                            .foregroundStyle(activo ? NxColors.fg : NxColors.fg.opacity(0.38))
                            .padding(.horizontal, 12)
                            .frame(maxWidth: .infinity, minHeight: NxMetrics.primaryButtonHeight)
                            .overlay(
                                RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous)
                                    .strokeBorder(activo ? NxColors.borderStrong : NxColors.fg.opacity(0.12), lineWidth: 1)
                            )
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(NxPressableStyle())
                        .disabled(!activo)
                    }
                }
            }

            if let nota = error ?? hint, !nota.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Text(nota)
                    .font(.system(size: 12.5))
                    .foregroundStyle(error != nil ? NxColors.danger : NxColors.muted)
                    .lineLimit(2)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity)
        .background {
            NxColors.card
                .nxElevation(8)
                .ignoresSafeArea(edges: .bottom)
        }
    }
}

// MARK: - Aviso tipo snackbar

/// Aviso corto abajo (Android `NxSnackbarHost`): fondo pizarra, letra blanca, radio 16.
struct ActivitySnackbar: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.system(size: 14))
            .foregroundStyle(Color.white)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background {
                RoundedRectangle(cornerRadius: NxRadius.l, style: .continuous)
                    .fill(NxColors.fg)
                    .nxElevation(6)
            }
            .padding(.horizontal, 12)
            .padding(.bottom, 12)
            .accessibilityAddTraits(.isStaticText)
    }
}

#Preview("Dock y pasos") {
    VStack(spacing: 16) {
        ActivityStepsCard(
            pasos: ActivityDockRules.pasos(flow: nil, coreKind: "servicio", fotosRequeridas: 4),
            onOpen: {}
        )
        .padding(.horizontal, 16)
        Spacer()
        ActivityDockBar(
            label: "Tomar foto de entrada",
            systemImage: "camera",
            hint: "Paso 1 de 5",
            secondary: [ActivityDockSecondary(label: "Pausar", systemImage: "pause", action: {})],
            onPrimary: {}
        )
    }
    .padding(.top)
    .background(NxColors.surface)
}
