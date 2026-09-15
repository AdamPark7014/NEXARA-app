import SwiftUI

/// Colores de Core (mismos tonos que la web).
enum CorePalette {
    static let green = Color(red: 0.086, green: 0.639, blue: 0.290)   // #16a34a
    static let orange = Color(red: 0.851, green: 0.467, blue: 0.024)  // #d97706
    static let red = Color(red: 0.863, green: 0.149, blue: 0.149)     // #dc2626
    static let blue = Color(red: 0.145, green: 0.388, blue: 0.922)    // #2563eb
    static let purple = Color(red: 0.486, green: 0.227, blue: 0.929)  // #7c3aed
    static let slate = Color(red: 0.580, green: 0.639, blue: 0.722)   // #94a3b8
    static let amber = Color(red: 0.961, green: 0.620, blue: 0.043)   // #f59e0b
}

/// Etiquetas de estatus en lenguaje de campo (espejo de MisActividadesView web).
enum CoreStatusUI {
    static func estatus(_ raw: String?) -> (label: String, color: Color?) {
        let s = (raw ?? "").lowercased()
        if s.contains("proceso") { return ("En curso", CorePalette.blue) }
        if s.contains("validar") { return ("En revisión", CorePalette.purple) }
        if s.contains("rechazada") { return ("Te la regresaron", CorePalette.red) }
        if s.contains("finalizada") || s.contains("completada") || s.contains("aprobada") {
            return ("Terminada", CorePalette.green)
        }
        if s.contains("cancelada") { return ("Cancelada", nil) }
        return ("Por empezar", nil)
    }

    /// Avance de quien ejecuta, según su evidencia.
    static func avance(_ status: String?) -> (label: String, color: Color?) {
        switch status {
        case CoreEvidence.completed: return ("Evidencia lista", CorePalette.green)
        case CoreEvidence.exitPhoto: return ("Por cerrar", CorePalette.blue)
        case CoreEvidence.serviceSheetPdf, CoreEvidence.serviceSheetData: return ("Llenando hoja", CorePalette.blue)
        case CoreEvidence.evidencePhotos: return ("Trabajando en sitio", CorePalette.blue)
        default: return ("Sin empezar", nil)
        }
    }

    static func priority(_ raw: String?) -> (label: String, color: Color) {
        switch (raw ?? "media").lowercased() {
        case "alta", "urgente": return ("Urgente", CorePalette.red)
        case "baja": return ("Puede esperar", CorePalette.green)
        default: return ("Esta semana", CorePalette.orange)
        }
    }

    static func kind(_ coreKind: String?, ticketTypeCustom: String? = nil) -> String {
        let base: String
        switch (coreKind ?? "").lowercased() {
        case "tarea": base = "✅ Tarea"
        case "proyecto": base = "📁 Proyecto"
        case "obra": base = "🏗️ Obra"
        case "servicio": base = "🛠️ Servicio"
        case "comercial": base = "💼 Comercial"
        default: base = "📌 Actividad"
        }
        if (coreKind ?? "").lowercased() == "tarea", let custom = ticketTypeCustom, !custom.isEmpty {
            return "\(base) · \(custom)"
        }
        return base
    }

    /// Estados del tablero (`STATUS_LABELS`/`STATUS_COLORS` web). «inactivo» ya no
    /// lo produce el API; se conserva por respuestas en caché.
    static func boardStatus(_ raw: String?) -> (label: String, color: Color) {
        switch raw ?? "" {
        case "activo": return ("Activo", CorePalette.green)
        case "atrasado": return ("Atrasado", CorePalette.red)
        case "libre": return ("Terminó", CorePalette.cyan)
        case "inactivo": return ("Inactivo", CorePalette.slate)
        default: return ("Sin actividad", CorePalette.slate)
        }
    }

    static let boardStatusOrder = ["activo", "atrasado", "libre", "sin_actividad"]
}

/// Textos del tablero con detalle (espejo de `estadoTexto`/`terminoTexto` de la pizarra web).
enum CoreBoardText {
    /// «45 min», «1 h 05 min» (`formatMinutes` web).
    static func minutes(_ value: Int) -> String {
        let total = max(0, value)
        let hours = total / 60
        let mins = total % 60
        if hours <= 0 { return "\(mins) min" }
        return "\(hours) h \(String(format: "%02d", mins)) min"
    }

    /// «Atrasado 1 h 20 min», «Sin actividad desde hace 2 h 05 min» o la etiqueta del estado.
    static func estado(_ user: TeamBoardUser, now: Date = Date()) -> String {
        if user.status == "atrasado", let late = user.currentLateMinutes, late > 0 {
            return "Atrasado \(minutes(late))"
        }
        if user.status == "libre", let since = CoreFormat.date(user.idleSinceAt) {
            let mins = max(0, Int(now.timeIntervalSince(since) / 60))
            return mins < 1 ? "Sin actividad desde hace un momento" : "Sin actividad desde hace \(minutes(mins))"
        }
        return CoreStatusUI.boardStatus(user.status).label
    }

    /// «Finalizó a las 10:49 con 1 h 20 min de atraso» (rojo) o «…, a tiempo» (verde).
    static func termino(_ finished: TeamBoardLastFinished) -> (text: String, color: Color) {
        let hora = CoreFormat.time(finished.finishedAt) ?? "—"
        guard let late = finished.lateMinutes else {
            return ("Finalizó a las \(hora)", CorePalette.green)
        }
        if late <= 0 {
            return ("Finalizó a las \(hora), a tiempo", CorePalette.green)
        }
        return ("Finalizó a las \(hora) con \(minutes(late)) de atraso", CorePalette.red)
    }
}

struct CoreChip: View {
    let text: String
    var color: Color? = nil

    var body: some View {
        Text(text)
            .font(.caption.weight(.semibold))
            .lineLimit(1)
            .padding(.horizontal, 9)
            .padding(.vertical, 4)
            .foregroundStyle(color ?? Color.secondary)
            .background((color ?? Color.secondary).opacity(0.12), in: Capsule())
    }
}

/// Acomoda chips en renglones.
struct CoreFlowLayout: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        var widest: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(ProposedViewSize(width: maxWidth, height: nil))
            if x > 0 && x + size.width > maxWidth {
                y += rowHeight + spacing
                x = 0
                rowHeight = 0
            }
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
            widest = max(widest, x - spacing)
        }
        return CGSize(width: proposal.width ?? widest, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX
        var y = bounds.minY
        var rowHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(ProposedViewSize(width: bounds.width, height: nil))
            if x > bounds.minX && x + size.width > bounds.maxX {
                y += rowHeight + spacing
                x = bounds.minX
                rowHeight = 0
            }
            subview.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(width: size.width, height: size.height))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}

struct CoreStars: View {
    let value: Int
    var size: CGFloat = 13

    var body: some View {
        let v = min(5, max(0, value))
        HStack(spacing: 1) {
            ForEach(1...5, id: \.self) { index in
                Image(systemName: index <= v ? "star.fill" : "star")
                    .font(.system(size: size))
                    .foregroundStyle(index <= v ? CorePalette.amber : Color.secondary.opacity(0.5))
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Eficiencia \(v) de 5: \(CoreEvidence.ratingLabel(v))")
    }
}

struct CoreProgressBar: View {
    let percent: Double
    var showsLabel = true

    var body: some View {
        let v = min(100, max(0, percent))
        HStack(spacing: 8) {
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.secondary.opacity(0.18))
                    Capsule()
                        .fill(v >= 100 ? CorePalette.green : Color.accentColor)
                        .frame(width: geo.size.width * v / 100)
                }
            }
            .frame(height: 8)
            if showsLabel {
                Text("\(Int(v))%")
                    .font(.caption.weight(.bold))
                    .frame(minWidth: 36, alignment: .trailing)
            }
        }
    }
}

struct CoreAvatar: View {
    let name: String
    let url: String?
    var size: CGFloat = 44

    var body: some View {
        Group {
            if let url, !url.isEmpty {
                AuthenticatedImage(url: url)
            } else {
                Text(CoreFormat.initials(name))
                    .font(.system(size: size * 0.34, weight: .bold))
                    .foregroundStyle(Color.accentColor)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color.accentColor.opacity(0.14))
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
    }
}

struct CoreStatCard: View {
    let label: String
    let value: Int
    var color: Color? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("\(value)")
                .font(.title2.weight(.heavy))
                .foregroundStyle(color ?? Color.primary)
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14))
    }
}

extension View {
    /// Tarjeta estándar de Core.
    func coreCard(highlight: Color? = nil) -> some View {
        self
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(highlight ?? Color.clear, lineWidth: highlight == nil ? 0 : 1.5)
            )
    }
}
