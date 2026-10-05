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
    /// Margen lateral de todas las pantallas (Android `NxSpacing.ScreenH`).
    static let screenH: CGFloat = 16
    /// Separación entre tarjetas de una lista (Android `NxSpacing.ListGap`).
    static let listGap: CGFloat = 10
}

/// Radios v2: 8 controles chicos · 12 controles · 16 tarjetas · 20 hojas y tarjetas hero.
enum NxRadius {
    static let s: CGFloat = 8
    static let m: CGFloat = 12
    static let l: CGFloat = 16
    static let xl: CGFloat = 20
}

/// Medidas mínimas de toque (HIG: 44 pt).
enum NxMetrics {
    static let minTap: CGFloat = 44
    /// Botón principal (v2): 52 pt, se toca con guantes y sin mirar.
    static let primaryButtonHeight: CGFloat = 52
    /// Acción principal del dock del detalle, al alcance del pulgar.
    static let dockButtonHeight: CGFloat = 56
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

/// Tarjeta de Android (`Card` con `NxDimens.PanelElevation`): blanco, radio 16 y
/// sombra de elevación 2, sin filo. `highlight` añade un borde de 1,5 de ese color.
private struct NxCardModifier: ViewModifier {
    var padding: CGFloat
    var highlight: Color?

    func body(content: Content) -> some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .nxCardSurface()
            .overlay {
                if let highlight {
                    RoundedRectangle(cornerRadius: NxRadius.l, style: .continuous)
                        .strokeBorder(highlight, lineWidth: 1.5)
                }
            }
    }
}

extension View {
    /// Tarjeta estándar (Android `Card`): blanco, radio 16, elevación 2.
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

/// Botón principal (Android `NxPrimaryButton`): 52 de alto, radio 12, teal de
/// marca, letra 14 SemiBold blanca. Ancho completo salvo `fullWidth: false`.
/// Deshabilitado: gris del texto al 12 % con letra al 38 %, como Material 3.
struct NxPrimaryButtonStyle: ButtonStyle {
    var tint: Color = NxBrand.primary
    var fullWidth: Bool = true

    func makeBody(configuration: Configuration) -> some View {
        NxPrimaryButtonBody(configuration: configuration, tint: tint, fullWidth: fullWidth)
    }
}

private struct NxPrimaryButtonBody: View {
    let configuration: ButtonStyleConfiguration
    let tint: Color
    let fullWidth: Bool
    @Environment(\.isEnabled) private var isEnabled

    var body: some View {
        configuration.label
            .font(NxType.labelLarge)
            .lineLimit(1)
            .foregroundStyle(isEnabled ? Color.white : NxColors.fg.opacity(0.38))
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
            .frame(maxWidth: fullWidth ? .infinity : nil, minHeight: NxMetrics.primaryButtonHeight)
            .background(
                isEnabled ? tint : NxColors.fg.opacity(0.12),
                in: RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous)
            )
            .opacity(configuration.isPressed ? 0.85 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
            .contentShape(Rectangle())
    }
}

/// Botón secundario (Android `NxSecondaryButton` = `OutlinedButton`): misma
/// altura y radio que el principal, contorno #CBD5E1 y letra de marca.
struct NxSecondaryButtonStyle: ButtonStyle {
    var tint: Color = NxBrand.primary
    var fullWidth: Bool = true

    func makeBody(configuration: Configuration) -> some View {
        NxSecondaryButtonBody(configuration: configuration, tint: tint, fullWidth: fullWidth)
    }
}

private struct NxSecondaryButtonBody: View {
    let configuration: ButtonStyleConfiguration
    let tint: Color
    let fullWidth: Bool
    @Environment(\.isEnabled) private var isEnabled

    var body: some View {
        configuration.label
            .font(NxType.labelLarge)
            .lineLimit(1)
            .foregroundStyle(isEnabled ? tint : NxColors.fg.opacity(0.38))
            .padding(.horizontal, 18)
            .padding(.vertical, 12)
            .frame(maxWidth: fullWidth ? .infinity : nil, minHeight: NxMetrics.primaryButtonHeight)
            .background(
                configuration.isPressed ? tint.opacity(0.08) : Color.clear,
                in: RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous)
            )
            .overlay(
                RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous)
                    .strokeBorder(isEnabled ? NxColors.borderStrong : NxColors.fg.opacity(0.12), lineWidth: 1)
            )
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

/// Primera carga en curso (Android `NxLoadingBlock`): indicador de marca y una
/// frase 12,5 gris, centrados.
struct NxLoadingState: View {
    var text: String = "Cargando…"

    var body: some View {
        VStack(spacing: NxSpacing.m) {
            ProgressView()
                .controlSize(.large)
                .tint(NxColors.brand)
            Text(text)
                .font(NxType.bodySmall)
                .foregroundStyle(NxColors.muted)
        }
        .frame(maxWidth: .infinity)
        .padding(NxSpacing.xl)
        .accessibilityElement(children: .combine)
    }
}

/// Bloques de carga con brillo mientras llega la primera carga de una lista.
/// Mismo dibujo que `NxSkeletonList` de Android (bloques de 72, radio 16).
struct NxSkeletonRows: View {
    var count: Int = 5

    var body: some View {
        NxSkeletonList(itemCount: count)
    }
}

/// La carga falló y no hay nada que enseñar (Android `NxErrorState`): círculo
/// rojo suave con la nube tachada, título 16 SemiBold, la causa en palabras de
/// campo y «Reintentar». Si ya había datos, usar `NxRefreshErrorBanner`.
struct NxErrorState: View {
    var title: String
    let message: String?
    var systemImage: String
    let retry: (() -> Void)?

    init(
        title: String = "No se pudo cargar",
        message: String?,
        systemImage: String = "icloud.slash",
        retry: (() -> Void)? = nil
    ) {
        self.title = title
        self.message = message
        self.systemImage = systemImage
        self.retry = retry
    }

    var body: some View {
        VStack(spacing: 10) {
            ZStack {
                Circle().fill(NxColors.dangerSoft)
                Image(systemName: systemImage)
                    .font(.system(size: 22, weight: .regular))
                    .foregroundStyle(NxColors.danger)
            }
            .frame(width: 56, height: 56)
            .accessibilityHidden(true)
            Text(title)
                .font(NxType.titleMedium)
                .foregroundStyle(NxColors.fg)
                .multilineTextAlignment(.center)
            Text(NxFriendlyError.text(message))
                .font(NxType.bodyMedium)
                .foregroundStyle(NxColors.muted)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            if let retry {
                NxPrimaryButton("Reintentar", systemImage: "arrow.clockwise", fullWidth: false, action: retry)
                    .padding(.top, 4)
            }
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 40)
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .contain)
    }
}

/// Refresco fallido con datos viejos en pantalla: cinta, no pantalla en blanco.
/// Se dibuja como `NxRefreshErrorBanner` de Android.
struct NxStaleBanner: View {
    let message: String
    var retry: (() -> Void)? = nil

    var body: some View {
        NxRefreshErrorBanner(message: message, onRetry: retry)
    }
}
