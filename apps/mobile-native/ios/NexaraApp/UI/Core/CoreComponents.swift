import SwiftUI

/// Colores de dominio de Core: los MISMOS de Android (`CoreActivityRules`:
/// VERDE, NARANJA, ROJO, AZUL, MORADO, GRIS, CIAN), tomados de `NxColors`.
enum CorePalette {
    static let green = NxColors.verde      // #16A34A
    static let orange = NxColors.naranja   // #D97706
    static let red = NxColors.rojo         // #DC2626
    static let blue = NxColors.azul        // #2563EB
    static let purple = NxColors.morado    // #7C3AED
    static let slate = NxColors.gris       // #94A3B8
    static let amber = NxColors.warning    // #F59E0B (estrellas)
    static let cyan = NxColors.cian        // #0284C7 («Terminó» en la pizarra)
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

    /// Nombre del tipo de actividad, sin icono (el icono va en `kindSymbol`).
    static func kind(_ coreKind: String?, ticketTypeCustom: String? = nil) -> String {
        let base = CoreActivityKind(rawValue: (coreKind ?? "").lowercased())?.title ?? "Actividad"
        if (coreKind ?? "").lowercased() == "tarea", let custom = ticketTypeCustom, !custom.isEmpty {
            return "\(base) · \(custom)"
        }
        return base
    }

    /// SF Symbol del tipo de actividad (tarea, proyecto, obra…).
    static func kindSymbol(_ coreKind: String?) -> String {
        CoreActivityKind(rawValue: (coreKind ?? "").lowercased())?.symbol ?? "list.bullet.rectangle"
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

    /// Orden de la leyenda (`STATUS_LABELS` web). «inactivo» solo se pinta si alguien lo trae.
    static let boardStatusOrder = ["activo", "atrasado", "libre", "sin_actividad", "inactivo"]
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

/// Chip de estado (Android `ToneChip`): píldora con fondo al 10 % y filo al
/// 35 % del color, texto 12 SemiBold e icono opcional de 14. Sin color: fondo
/// #F8FAFC, filo #E2E8F0 y texto gris.
struct CoreChip: View {
    /// SF Symbol opcional al frente del texto.
    var icon: String? = nil
    let text: String
    var color: Color? = nil

    var body: some View {
        HStack(spacing: 4) {
            if let icon {
                Image(systemName: icon)
                    .font(.system(size: 11, weight: .semibold))
                    .frame(width: 14, height: 14)
                    .accessibilityHidden(true)
            }
            Text(text)
                .font(.system(size: 12, weight: .semibold))
                .lineLimit(1)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .foregroundStyle(color ?? NxColors.muted)
        .background(color.map { $0.opacity(0.10) } ?? NxColors.surface, in: Capsule())
        .overlay(Capsule().strokeBorder(color.map { $0.opacity(0.35) } ?? NxColors.border, lineWidth: 1))
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

/// Cinco estrellas (Android `StarsText`): las de la calificación en ámbar, el
/// resto en #CBD5E1.
struct CoreStars: View {
    let value: Int
    var size: CGFloat = 13

    var body: some View {
        let v = min(5, max(0, value))
        HStack(spacing: 1) {
            ForEach(1...5, id: \.self) { index in
                Image(systemName: "star.fill")
                    .font(.system(size: size))
                    .foregroundStyle(index <= v ? CorePalette.amber : NxColors.borderStrong)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Eficiencia \(v) de 5: \(CoreEvidence.ratingLabel(v))")
    }
}

/// Barra de avance con su porcentaje (Android `ProgressWithPct`): 8 de alto,
/// pista #E2E8F0, verde al 100 % y de marca antes; «NN%» 12 Bold.
struct CoreProgressBar: View {
    let percent: Double
    var showsLabel = true

    var body: some View {
        let v = min(100, max(0, percent))
        HStack(spacing: 8) {
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(NxColors.border)
                    Capsule()
                        .fill(v >= 100 ? CorePalette.green : NxColors.brand)
                        .frame(width: geo.size.width * v / 100)
                }
            }
            .frame(height: 8)
            if showsLabel {
                Text("\(Int(v.rounded()))%")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(NxColors.fg)
                    .frame(minWidth: 36, alignment: .trailing)
            }
        }
    }
}

/// Avatar de persona. Dibuja `NxAvatar` (estilo suave de Android `PersonAvatar`).
struct CoreAvatar: View {
    let name: String
    let url: String?
    var size: CGFloat = 44

    var body: some View {
        NxAvatar(nombre: name, url: url, size: size)
    }
}

struct CoreStatCard: View {
    let label: String
    let value: Int
    var color: Color? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("\(value)")
                .font(.system(size: 22, weight: .bold))
                .monospacedDigit()
                .foregroundStyle(color ?? NxColors.fg)
            Text(label)
                .font(NxType.labelMedium)
                .foregroundStyle(NxColors.muted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(NxSpacing.m)
        .nxCardSurface(radius: NxRadius.m + 2)
        .accessibilityElement(children: .combine)
    }
}

extension View {
    /// Tarjeta estándar de Core (Android `NxPanelShell`: relleno 14, radio 16, elevación 2).
    func coreCard(highlight: Color? = nil) -> some View {
        nxCard(padding: NxSpacing.m + 2, highlight: highlight)
    }
}
