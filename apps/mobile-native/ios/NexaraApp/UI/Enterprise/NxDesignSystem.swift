import SwiftUI
import UIKit

// MARK: - Marca: familia navy / cian de la web

/// Tonos del sistema público de la web (`--ds-bg`, `--ds-surface`, `--ds-cyan`).
/// El azul de acción sigue siendo `NxBrand.primary`; el navy es para superficies
/// de marca (encabezados, baldosa del logo) y el cian para resaltes en vivo.
extension NxBrand {
    /// #070F1E — fondo profundo de la web.
    static let navyDeep = Color(red: 0.027, green: 0.059, blue: 0.118)
    /// #0E1A30 — superficie navy.
    static let navy = Color(red: 0.055, green: 0.102, blue: 0.188)
    /// #132340 — segunda capa navy (tarjeta sobre superficie).
    static let navyRaised = Color(red: 0.075, green: 0.137, blue: 0.251)
    /// #2DD8F2 — cian de la web.
    static let cyan = Color(red: 0.176, green: 0.847, blue: 0.949)
    /// Cian legible en los dos modos: #0891B2 sobre blanco, #2DD8F2 sobre oscuro.
    static let cyanAdaptive = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.176, green: 0.847, blue: 0.949, alpha: 1)
            : UIColor(red: 0.031, green: 0.569, blue: 0.698, alpha: 1)
    })
    /// Encabezado de marca: navy en los dos modos, texto blanco encima.
    static let headerGradient = LinearGradient(
        colors: [
            Color(red: 0.055, green: 0.102, blue: 0.188),
            Color(red: 0.075, green: 0.137, blue: 0.251),
        ],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
}

// MARK: - Espaciado y radios

/// Rejilla de 4 pt. Las pantallas no escriben números sueltos de padding.
enum NxSpacing {
    static let xxs: CGFloat = 2
    static let xs: CGFloat = 4
    static let s: CGFloat = 8
    static let m: CGFloat = 12
    static let l: CGFloat = 16
    static let xl: CGFloat = 24
    static let xxl: CGFloat = 32
}

/// Radios de la web (`--ds-radius-sm/-/-lg`).
enum NxRadius {
    static let s: CGFloat = 8
    static let m: CGFloat = 12
    static let l: CGFloat = 16
}

/// Medidas mínimas de toque (HIG: 44 pt).
enum NxMetrics {
    static let minTap: CGFloat = 44
    /// Botón principal: se toca con guantes y sin mirar.
    static let primaryButtonHeight: CGFloat = 50
}

// MARK: - Formato es-MX (formatters en caché)

/// Crear un `DateFormatter` o `NumberFormatter` cuesta; hacerlo en cada `body`
/// o en cada fila de una lista se nota al hacer scroll. Aquí viven una sola vez.
enum NxFormat {
    static let locale = Locale(identifier: "es_MX")

    private static let moneyFormatter: NumberFormatter = {
        let f = NumberFormatter()
        f.locale = Locale(identifier: "es_MX")
        f.numberStyle = .currency
        f.currencyCode = "MXN"
        f.currencySymbol = "$"
        f.minimumFractionDigits = 2
        f.maximumFractionDigits = 2
        return f
    }()

    private static let moneyWholeFormatter: NumberFormatter = {
        let f = NumberFormatter()
        f.locale = Locale(identifier: "es_MX")
        f.numberStyle = .currency
        f.currencyCode = "MXN"
        f.currencySymbol = "$"
        f.minimumFractionDigits = 0
        f.maximumFractionDigits = 0
        return f
    }()

    private static let integerFormatter: NumberFormatter = {
        let f = NumberFormatter()
        f.locale = Locale(identifier: "es_MX")
        f.numberStyle = .decimal
        f.maximumFractionDigits = 0
        return f
    }()

    private static let dayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_MX")
        f.dateFormat = "d MMM yyyy"
        return f
    }()

    private static let dayTimeFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_MX")
        f.dateFormat = "d MMM yyyy, HH:mm"
        return f
    }()

    private static let timeFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_MX")
        f.dateFormat = "HH:mm"
        return f
    }()

    private static let shortDayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_MX")
        f.dateFormat = "EEE d MMM"
        return f
    }()

    private static let apiDayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.calendar = Calendar(identifier: .gregorian)
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

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

    private static let relativeFormatter: RelativeDateTimeFormatter = {
        let f = RelativeDateTimeFormatter()
        f.locale = Locale(identifier: "es_MX")
        f.unitsStyle = .full
        return f
    }()

    /// «$1,234.50».
    static func mxn(_ value: Double) -> String {
        moneyFormatter.string(from: NSNumber(value: value)) ?? "$\(value)"
    }

    /// «$1,235», para KPIs y tarjetas donde los centavos estorban.
    static func mxnWhole(_ value: Double) -> String {
        moneyWholeFormatter.string(from: NSNumber(value: value)) ?? "$\(Int(value))"
    }

    /// «1,234».
    static func integer(_ value: Int) -> String {
        integerFormatter.string(from: NSNumber(value: value)) ?? "\(value)"
    }

    /// «26 sep 2026».
    static func day(_ date: Date) -> String { dayFormatter.string(from: date) }

    /// «26 sep 2026, 18:30».
    static func dayTime(_ date: Date) -> String { dayTimeFormatter.string(from: date) }

    /// «18:30».
    static func time(_ date: Date) -> String { timeFormatter.string(from: date) }

    /// «sáb 26 sep».
    static func shortDay(_ date: Date) -> String { shortDayFormatter.string(from: date) }

    /// «2026-09-26» para parámetros del API (siempre gregoriano, sin locale).
    static func apiDay(_ date: Date) -> String { apiDayFormatter.string(from: date) }

    /// ISO-8601 con o sin fracción de segundo.
    static func parseISO(_ raw: String?) -> Date? {
        guard let raw, !raw.isEmpty else { return nil }
        return isoFractional.date(from: raw) ?? isoPlain.date(from: raw) ?? apiDayFormatter.date(from: raw)
    }

    /// «2026-09-26T18:30:00.000Z».
    static func isoString(_ date: Date) -> String { isoFractional.string(from: date) }

    /// «Hoy, 18:30» · «Ayer, 09:10» · «sáb 26 sep, 18:30».
    static func friendly(_ date: Date, now: Date = Date()) -> String {
        let cal = Calendar.current
        if cal.isDate(date, inSameDayAs: now) { return "Hoy, \(time(date))" }
        if let ayer = cal.date(byAdding: .day, value: -1, to: now), cal.isDate(date, inSameDayAs: ayer) {
            return "Ayer, \(time(date))"
        }
        if cal.isDate(date, equalTo: now, toGranularity: .year) {
            return "\(shortDay(date)), \(time(date))"
        }
        return dayTime(date)
    }

    /// Versión para cadenas ISO del API; «—» si no hay fecha.
    static func friendly(iso: String?) -> String {
        guard let date = parseISO(iso) else { return "—" }
        return friendly(date)
    }

    /// «hace 5 minutos».
    static func relative(_ date: Date, now: Date = Date()) -> String {
        relativeFormatter.localizedString(for: date, relativeTo: now)
    }
}

// MARK: - Estados en palabras de campo

/// Estados crudos del API («pendiente», «in_progress», «APPROVED»…) traducidos a
/// lo que entiende un técnico. Nunca se pinta el valor del enum tal cual.
enum NxStatusText {
    static func label(_ raw: String?) -> String {
        let clave = normalizar(raw)
        guard !clave.isEmpty else { return "—" }
        if let conocido = etiquetas[clave] { return conocido }
        let legible = clave.replacingOccurrences(of: "_", with: " ")
        return legible.prefix(1).uppercased() + legible.dropFirst()
    }

    static func tone(_ raw: String?) -> NxTone {
        let clave = normalizar(raw)
        if tonos.success.contains(clave) { return .success }
        if tonos.warning.contains(clave) { return .warning }
        if tonos.danger.contains(clave) { return .danger }
        if tonos.info.contains(clave) { return .info }
        return .neutral
    }

    private static func normalizar(_ raw: String?) -> String {
        (raw ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
            .replacingOccurrences(of: "-", with: "_")
            .replacingOccurrences(of: " ", with: "_")
    }

    private static let etiquetas: [String: String] = [
        "pending": "Pendiente", "pendiente": "Pendiente", "por_aprobar": "Por aprobar",
        "open": "Abierto", "abierto": "Abierto", "abierta": "Abierta", "new": "Nuevo", "nuevo": "Nuevo",
        "in_progress": "En curso", "en_proceso": "En curso", "en_curso": "En curso", "proceso": "En curso",
        "assigned": "Asignado", "asignado": "Asignado", "asignada": "Asignada",
        "on_hold": "En espera", "en_espera": "En espera", "waiting": "En espera",
        "approved": "Aprobado", "aprobado": "Aprobado", "aprobada": "Aprobada",
        "rejected": "Rechazado", "rechazado": "Rechazado", "rechazada": "Rechazada",
        "cancelled": "Cancelado", "canceled": "Cancelado", "cancelado": "Cancelado", "cancelada": "Cancelada",
        "completed": "Terminado", "done": "Terminado", "finished": "Terminado",
        "completado": "Terminado", "completada": "Terminada", "finalizado": "Terminado", "finalizada": "Terminada",
        "closed": "Cerrado", "cerrado": "Cerrado", "cerrada": "Cerrada",
        "resolved": "Resuelto", "resuelto": "Resuelto", "resuelta": "Resuelta",
        "paid": "Pagado", "pagado": "Pagado", "pagada": "Pagada",
        "partial": "Pago parcial", "parcial": "Pago parcial", "partially_paid": "Pago parcial",
        "overdue": "Vencido", "vencido": "Vencido", "vencida": "Vencida",
        "draft": "Borrador", "borrador": "Borrador",
        "sent": "Enviado", "enviado": "Enviado", "enviada": "Enviada",
        "delivered": "Entregado", "entregado": "Entregado", "entregada": "Entregada",
        "returned": "Devuelto", "devuelto": "Devuelto", "devuelta": "Devuelta",
        "active": "Activo", "activo": "Activo", "activa": "Activa",
        "inactive": "Inactivo", "inactivo": "Inactivo", "inactiva": "Inactiva",
        "scheduled": "Programado", "programado": "Programado", "programada": "Programada",
        "urgent": "Urgente", "urgente": "Urgente", "high": "Alta", "alta": "Alta",
        "medium": "Media", "media": "Media", "normal": "Normal", "low": "Baja", "baja": "Baja",
        "por_validar": "En revisión", "en_revision": "En revisión", "review": "En revisión",
        "comprobado": "Comprobado", "comprobada": "Comprobada", "por_comprobar": "Por comprobar",
        "disponible": "Disponible", "available": "Disponible", "en_uso": "En uso", "in_use": "En uso",
        "mantenimiento": "En mantenimiento", "maintenance": "En mantenimiento",
    ]

    private static let tonos: (success: Set<String>, warning: Set<String>, danger: Set<String>, info: Set<String>) = (
        success: ["approved", "aprobado", "aprobada", "completed", "done", "finished", "completado",
                  "completada", "finalizado", "finalizada", "paid", "pagado", "pagada", "resolved",
                  "resuelto", "resuelta", "delivered", "entregado", "entregada", "active", "activo",
                  "activa", "comprobado", "comprobada", "disponible", "available", "closed", "cerrado", "cerrada"],
        warning: ["pending", "pendiente", "por_aprobar", "on_hold", "en_espera", "waiting", "partial",
                  "parcial", "partially_paid", "draft", "borrador", "por_comprobar", "medium", "media",
                  "mantenimiento", "maintenance", "por_validar", "en_revision", "review"],
        danger: ["rejected", "rechazado", "rechazada", "overdue", "vencido", "vencida", "urgent",
                 "urgente", "high", "alta", "cancelled", "canceled", "cancelado", "cancelada"],
        info: ["open", "abierto", "abierta", "new", "nuevo", "in_progress", "en_proceso", "en_curso",
               "proceso", "assigned", "asignado", "asignada", "sent", "enviado", "enviada", "scheduled",
               "programado", "programada", "en_uso", "in_use", "returned", "devuelto", "devuelta"]
    )
}

// MARK: - Tarjeta

private struct NxCardModifier: ViewModifier {
    var padding: CGFloat
    var highlight: Color?

    func body(content: Content) -> some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                Color(.secondarySystemGroupedBackground),
                in: RoundedRectangle(cornerRadius: NxRadius.l, style: .continuous)
            )
            .overlay(
                RoundedRectangle(cornerRadius: NxRadius.l, style: .continuous)
                    .strokeBorder(highlight ?? Color.primary.opacity(0.08), lineWidth: highlight == nil ? 0.5 : 1.5)
            )
    }
}

extension View {
    /// Tarjeta estándar: fondo agrupado, radio 16 continuo y filo sutil.
    func nxCard(padding: CGFloat = NxSpacing.l, highlight: Color? = nil) -> some View {
        modifier(NxCardModifier(padding: padding, highlight: highlight))
    }

    /// Área de toque mínima de 44 × 44 pt sin cambiar el dibujo.
    func nxTapTarget() -> some View {
        frame(minWidth: NxMetrics.minTap, minHeight: NxMetrics.minTap)
            .contentShape(Rectangle())
    }
}

// MARK: - Botones

/// Botón principal: ancho completo, 50 pt de alto, azul de marca.
struct NxPrimaryButtonStyle: ButtonStyle {
    var tint: Color = NxBrand.primary

    func makeBody(configuration: Configuration) -> some View {
        NxPrimaryButtonBody(configuration: configuration, tint: tint)
    }
}

private struct NxPrimaryButtonBody: View {
    let configuration: ButtonStyleConfiguration
    let tint: Color
    @Environment(\.isEnabled) private var isEnabled

    var body: some View {
        configuration.label
            .font(.headline)
            .foregroundStyle(Color.white)
            .frame(maxWidth: .infinity, minHeight: NxMetrics.primaryButtonHeight)
            .padding(.horizontal, NxSpacing.l)
            .background(
                (isEnabled ? tint : Color.secondary.opacity(0.35)),
                in: RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous)
            )
            .opacity(configuration.isPressed ? 0.85 : 1)
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
            .contentShape(Rectangle())
    }
}

/// Botón secundario: mismo tamaño que el principal, fondo tenue.
struct NxSecondaryButtonStyle: ButtonStyle {
    var tint: Color = NxBrand.adaptive

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundStyle(tint)
            .frame(maxWidth: .infinity, minHeight: NxMetrics.primaryButtonHeight)
            .padding(.horizontal, NxSpacing.l)
            .background(tint.opacity(0.12), in: RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous))
            .opacity(configuration.isPressed ? 0.75 : 1)
            .contentShape(Rectangle())
    }
}

/// Botón de solo icono con su nombre para VoiceOver y 44 pt de toque.
struct NxIconButton: View {
    let systemName: String
    let label: String
    var tint: Color? = nil
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemName)
                .symbolRenderingMode(.hierarchical)
                .foregroundStyle(tint.map { AnyShapeStyle($0) } ?? AnyShapeStyle(TintShapeStyle()))
                .nxTapTarget()
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

// MARK: - Estados de pantalla

/// Primera carga en curso: indicador nativo y una frase, centrado.
struct NxLoadingState: View {
    var text: String = "Cargando…"

    var body: some View {
        VStack(spacing: NxSpacing.m) {
            ProgressView().controlSize(.large)
            Text(text)
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, NxSpacing.xxl)
        .accessibilityElement(children: .combine)
    }
}

/// Filas de relleno con `.redacted` mientras llega la primera carga de una lista.
struct NxSkeletonRows: View {
    var count: Int = 5

    var body: some View {
        VStack(spacing: NxSpacing.m) {
            ForEach(0..<count, id: \.self) { _ in
                HStack(spacing: NxSpacing.m) {
                    RoundedRectangle(cornerRadius: NxRadius.s, style: .continuous)
                        .fill(Color.secondary.opacity(0.18))
                        .frame(width: 40, height: 40)
                    VStack(alignment: .leading, spacing: NxSpacing.xs) {
                        Text("Nombre de ejemplo largo").font(.subheadline.weight(.semibold))
                        Text("Detalle secundario de la fila").font(.caption)
                    }
                    Spacer(minLength: 0)
                }
                .nxCard(padding: NxSpacing.m)
            }
        }
        .redacted(reason: .placeholder)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Cargando")
    }
}

/// Primera carga fallida: no hay nada que enseñar, ofrece «Reintentar».
struct NxErrorState: View {
    var title: String = "No se pudo cargar"
    let message: String
    var systemImage: String = "wifi.exclamationmark"
    let retry: () -> Void

    var body: some View {
        ContentUnavailableView {
            Label(title, systemImage: systemImage)
        } description: {
            Text(message)
        } actions: {
            Button {
                retry()
            } label: {
                Label("Reintentar", systemImage: "arrow.clockwise")
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .tint(NxBrand.primary)
        }
    }
}

/// Refresco fallido con datos viejos en pantalla: cinta, no pantalla en blanco.
struct NxStaleBanner: View {
    let message: String
    var retry: (() -> Void)? = nil

    var body: some View {
        HStack(alignment: .top, spacing: NxSpacing.m) {
            Image(systemName: "wifi.exclamationmark")
                .foregroundStyle(NxTone.warning.fg)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: NxSpacing.xxs) {
                Text("Mostrando lo último que se pudo cargar")
                    .font(.subheadline.weight(.semibold))
                Text(message)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
            if let retry {
                Button("Reintentar", action: retry)
                    .font(.caption.weight(.semibold))
                    .nxTapTarget()
            }
        }
        .padding(NxSpacing.m)
        .background(NxTone.warning.bg, in: RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}
