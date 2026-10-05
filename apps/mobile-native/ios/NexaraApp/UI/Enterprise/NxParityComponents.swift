import SwiftUI
import UIKit

// MARK: - Paridad visual con Android
//
// Componentes con el MISMO aspecto que los de la app Android (la referencia que
// aprobó el dueño): radios, rellenos, tamaños de letra, pesos, bordes y sombras.
// Cada uno dice de qué pieza de Android sale. Los colores salen de `NxColors`.
//
// Regla para las pantallas: nada de `List(.insetGrouped)`, `Form` ni
// `ContentUnavailableView` para imitar a Android; fondo `NxColors.surface`,
// tarjetas blancas (`NxPanelShell`, `MoreTarjeta`, `.nxCard()`) y estas piezas.

// MARK: - Tipografía

/// Escala tipográfica de Android (`ui/theme/Type.kt`) con TAMAÑOS FIJOS y la
/// fuente del sistema. No sigue el Dynamic Type de iOS a propósito: los títulos
/// de las tarjetas tienen que medir lo mismo que en Android.
enum NxType {
    /// 22 SemiBold.
    static let headlineSmall = Font.system(size: 22, weight: .semibold)
    /// 20 SemiBold.
    static let titleLarge = Font.system(size: 20, weight: .semibold)
    /// 16 SemiBold.
    static let titleMedium = Font.system(size: 16, weight: .semibold)
    /// 14 SemiBold.
    static let titleSmall = Font.system(size: 14, weight: .semibold)
    /// 16 normal.
    static let bodyLarge = Font.system(size: 16, weight: .regular)
    /// 14 normal.
    static let bodyMedium = Font.system(size: 14, weight: .regular)
    /// 12,5 normal.
    static let bodySmall = Font.system(size: 12.5, weight: .regular)
    /// 14 SemiBold (texto de botones).
    static let labelLarge = Font.system(size: 14, weight: .semibold)
    /// 12 Medium.
    static let labelMedium = Font.system(size: 12, weight: .medium)
    /// 11 Medium.
    static let labelSmall = Font.system(size: 11, weight: .medium)
}

/// Estilo de texto con interlineado de Android (`lineHeight`), para párrafos.
/// `Text("…").nxTextStyle(.bodyMedium)` = 14 normal con alto de línea 20.
enum NxTextStyle {
    case headlineSmall, titleLarge, titleMedium, titleSmall
    case bodyLarge, bodyMedium, bodySmall
    case labelLarge, labelMedium, labelSmall

    var font: Font {
        switch self {
        case .headlineSmall: return NxType.headlineSmall
        case .titleLarge: return NxType.titleLarge
        case .titleMedium: return NxType.titleMedium
        case .titleSmall: return NxType.titleSmall
        case .bodyLarge: return NxType.bodyLarge
        case .bodyMedium: return NxType.bodyMedium
        case .bodySmall: return NxType.bodySmall
        case .labelLarge: return NxType.labelLarge
        case .labelMedium: return NxType.labelMedium
        case .labelSmall: return NxType.labelSmall
        }
    }

    /// Alto de línea de Android menos el natural de la fuente del sistema (≈1,2 × tamaño).
    var lineSpacing: CGFloat {
        switch self {
        case .headlineSmall: return 1.6   // 28 - 22·1,2
        case .titleLarge: return 2        // 26 - 20·1,2
        case .titleMedium: return 2.8     // 22 - 16·1,2
        case .titleSmall: return 3.2      // 20 - 14·1,2
        case .bodyLarge: return 4.8       // 24 - 16·1,2
        case .bodyMedium: return 3.2      // 20 - 14·1,2
        case .bodySmall: return 2         // 17 - 12,5·1,2
        case .labelLarge: return 3.2
        case .labelMedium: return 1.6
        case .labelSmall: return 2.8
        }
    }
}

extension View {
    /// Fuente + interlineado de Android para un estilo de `NxTextStyle`.
    func nxTextStyle(_ style: NxTextStyle) -> some View {
        font(style.font).lineSpacing(style.lineSpacing)
    }
}

// MARK: - Superficies, sombras y fondo de pantalla

extension View {
    /// Sombra de elevación de Material (dp): 1 = hub, 2 = tarjetas, 6 = FAB.
    /// Va en la FORMA de fondo, no en el contenido (si no, sombrea las letras).
    func nxElevation(_ dp: CGFloat) -> some View {
        let nivel = min(max(dp, 0), 12)
        return self
            .shadow(color: Color.black.opacity(nivel == 0 ? 0 : 0.05), radius: nivel, x: 0, y: 0)
            .shadow(
                color: Color.black.opacity(nivel == 0 ? 0 : min(0.08 + 0.01 * nivel, 0.16)),
                radius: nivel * 0.9,
                x: 0,
                y: nivel * 0.5
            )
    }

    /// Fondo de tarjeta de Android: forma redondeada blanca con su sombra detrás
    /// del contenido. No recorta ni rellena: solo pinta el fondo.
    func nxCardSurface(
        radius: CGFloat = NxRadius.l,
        elevation: CGFloat = 2,
        fill: Color = NxColors.card
    ) -> some View {
        background {
            RoundedRectangle(cornerRadius: radius, style: .continuous)
                .fill(fill)
                .nxElevation(elevation)
        }
    }

    /// Fondo de pantalla de Android (#F8FAFC) hasta los bordes. Para pantallas
    /// con `ScrollView` / `VStack`.
    func nxScreenBackground() -> some View {
        frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(NxColors.surface.ignoresSafeArea())
    }

    /// Igual que `nxScreenBackground`, pero además quita el gris de iOS de las
    /// `List` / `Form` de dentro (`scrollContentBackground(.hidden)`). Úsalo solo
    /// en la pantalla que tiene la lista: también vale para sus hojas hijas.
    func nxListBackground() -> some View {
        scrollContentBackground(.hidden)
            .nxScreenBackground()
    }
}

/// Estilo de botón para tarjetas tocables: no cambia colores, solo se atenúa al
/// pulsar (el «ripple» de Android).
struct NxPressableStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .opacity(configuration.isPressed ? 0.88 : 1)
            .scaleEffect(configuration.isPressed ? 0.995 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

// MARK: - Tarjetas

/// Tarjeta blanca estándar (Android `NxPanelShell`): radio 16, elevación 2,
/// relleno 14. Su contenido va en columna SIN separación (como `Column` de
/// Android); pasa `spacing` si la quieres. Con `onClick` toda la tarjeta se toca.
struct NxPanelShell<Content: View>: View {
    var padding: CGFloat
    var spacing: CGFloat
    var onClick: (() -> Void)?
    let content: Content

    init(
        padding: CGFloat = 14,
        spacing: CGFloat = 0,
        onClick: (() -> Void)? = nil,
        @ViewBuilder content: () -> Content
    ) {
        self.padding = padding
        self.spacing = spacing
        self.onClick = onClick
        self.content = content()
    }

    var body: some View {
        if let onClick {
            Button(action: onClick) { panel }
                .buttonStyle(NxPressableStyle())
        } else {
            panel
        }
    }

    private var panel: some View {
        VStack(alignment: .leading, spacing: spacing) { content }
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .nxCardSurface()
            .contentShape(RoundedRectangle(cornerRadius: NxRadius.l, style: .continuous))
    }
}

/// Renglón-tarjeta (Android `NxListRow`): título 14 SemiBold (2 líneas),
/// subtítulo 12,5 gris (2 líneas), meta 11, chip de estado y algo opcional a la
/// derecha. Usa las etiquetas: `NxListRow(title:…, onClick: { }, trailing: { … })`.
struct NxListRow<Trailing: View>: View {
    let title: String
    var subtitle: String?
    var meta: String?
    var chipText: String?
    var chipTone: NxTone
    var onClick: (() -> Void)?
    let trailing: Trailing

    init(
        title: String,
        subtitle: String? = nil,
        meta: String? = nil,
        chipText: String? = nil,
        chipTone: NxTone = .neutral,
        onClick: (() -> Void)? = nil,
        @ViewBuilder trailing: () -> Trailing
    ) {
        self.title = title
        self.subtitle = subtitle
        self.meta = meta
        self.chipText = chipText
        self.chipTone = chipTone
        self.onClick = onClick
        self.trailing = trailing()
    }

    var body: some View {
        NxPanelShell(onClick: onClick) {
            HStack(alignment: .center, spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(NxColors.fg)
                        .lineLimit(2)
                    if let subtitle, !subtitle.isEmpty {
                        Text(subtitle)
                            .font(NxType.bodySmall)
                            .foregroundStyle(NxColors.muted)
                            .lineLimit(2)
                    }
                    if let meta, !meta.isEmpty {
                        Text(meta)
                            .font(NxType.labelSmall)
                            .foregroundStyle(NxColors.muted)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if let chipText, !chipText.isEmpty {
                    NxStatusChip(text: chipText, tone: chipTone)
                }
                trailing
            }
        }
        .accessibilityElement(children: .combine)
    }
}

extension NxListRow where Trailing == EmptyView {
    init(
        title: String,
        subtitle: String? = nil,
        meta: String? = nil,
        chipText: String? = nil,
        chipTone: NxTone = .neutral,
        onClick: (() -> Void)? = nil
    ) {
        self.init(
            title: title,
            subtitle: subtitle,
            meta: meta,
            chipText: chipText,
            chipTone: chipTone,
            onClick: onClick,
            trailing: { EmptyView() }
        )
    }
}

/// Encabezado denso (Android `NxDenseSectionHeader`): 13 Bold y una pista de
/// 11,5 gris debajo. Sin caja: la jerarquía la dan el aire y la letra.
struct NxDenseSectionHeader<Trailing: View>: View {
    let title: String
    var hint: String?
    let trailing: Trailing

    init(title: String, hint: String? = nil, @ViewBuilder trailing: () -> Trailing) {
        self.title = title
        self.hint = hint
        self.trailing = trailing()
    }

    var body: some View {
        HStack(alignment: .center, spacing: NxSpacing.s) {
            VStack(alignment: .leading, spacing: 0) {
                Text(title)
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(NxColors.fg)
                    .lineLimit(1)
                    .accessibilityAddTraits(.isHeader)
                if let hint, !hint.isEmpty {
                    Text(hint)
                        .font(.system(size: 11.5))
                        .foregroundStyle(NxColors.muted)
                        .lineLimit(2)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            trailing
        }
    }
}

extension NxDenseSectionHeader where Trailing == EmptyView {
    init(title: String, hint: String? = nil) {
        self.init(title: title, hint: hint, trailing: { EmptyView() })
    }
}

/// Separador de 1 px entre filas de una misma superficie (Android `NxRowDivider`).
struct NxRowDivider: View {
    var body: some View {
        Rectangle()
            .fill(NxColors.borderSubtle)
            .frame(height: 1)
            .accessibilityHidden(true)
    }
}

// MARK: - Errores

/// Mensajes técnicos de red → frase que entiende un técnico en campo
/// (Android `nxFriendlyError`).
enum NxFriendlyError {
    static func text(_ raw: String?) -> String {
        let msg = (raw ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if msg.isEmpty { return "Revisa tu conexión e inténtalo de nuevo." }
        let lower = msg.lowercased()
        if lower.contains("unable to resolve host") || lower.contains("failed to connect")
            || lower.contains("no address associated") || lower.contains("network is unreachable")
            || lower.contains("offline") || lower.contains("not connected to the internet") {
            return "Sin conexión a internet. Revisa tus datos o Wi‑Fi."
        }
        if lower.contains("timeout") || lower.contains("timed out") {
            return "El servidor tardó demasiado. Inténtalo de nuevo."
        }
        if lower.contains("http 401") || lower.contains("unauthorized") {
            return "Tu sesión expiró. Vuelve a iniciar sesión."
        }
        if lower.contains("http 403") || lower.contains("forbidden") {
            return "No tienes permiso para ver esto."
        }
        if lower.contains("http 404") {
            return "No se encontró la información."
        }
        if lower.hasPrefix("http 5") || lower.contains("internal server error") {
            return "El servidor tuvo un problema. Inténtalo en un momento."
        }
        return msg
    }
}

/// Bloque de error dentro de una pantalla con más cosas (Android `NxErrorBlock`):
/// tarjeta roja suave, «No se pudo cargar», la causa y «Reintentar».
struct NxErrorBlock: View {
    let message: String?
    var onRetry: (() -> Void)? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: NxSpacing.s) {
            Text("No se pudo cargar")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(NxColors.danger)
            Text(NxFriendlyError.text(message))
                .font(NxType.bodySmall)
                .foregroundStyle(NxColors.fg)
                .fixedSize(horizontal: false, vertical: true)
            if let onRetry {
                Button("Reintentar", action: onRetry)
                    .buttonStyle(NxPillButtonStyle(fill: .clear, foreground: NxColors.brand, border: NxColors.borderStrong))
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(NxColors.dangerSoft, in: RoundedRectangle(cornerRadius: NxRadius.l, style: .continuous))
        .accessibilityElement(children: .contain)
    }
}

/// Falló una recarga pero la pantalla ya tiene datos (Android
/// `NxRefreshErrorBanner`): cinta ámbar, «No se pudo actualizar…», «Reintentar»
/// y cerrar opcional. Nunca borra lo que ya se veía.
struct NxRefreshErrorBanner: View {
    let message: String?
    var onRetry: (() -> Void)? = nil
    var onDismiss: (() -> Void)? = nil

    private static let tinta = NxColors.rgb(0xB45309)
    private static let texto = NxColors.rgb(0x78350F)

    var body: some View {
        HStack(alignment: .center, spacing: 0) {
            Image(systemName: "icloud.slash")
                .font(.system(size: 15, weight: .regular))
                .foregroundStyle(Self.tinta)
                .frame(width: 18, height: 18)
                .padding(.trailing, 10)
                .accessibilityHidden(true)
            Text("No se pudo actualizar. \(NxFriendlyError.text(message))")
                .font(NxType.bodySmall)
                .foregroundStyle(Self.texto)
                .padding(.vertical, 8)
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
            if let onRetry {
                Button(action: onRetry) {
                    Text("Reintentar")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(Self.tinta)
                        .padding(.horizontal, 8)
                        .nxTapTarget()
                }
                .buttonStyle(.plain)
            }
            if let onDismiss {
                Button(action: onDismiss) {
                    Image(systemName: "xmark")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Self.texto)
                        .nxTapTarget()
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Cerrar aviso")
            }
        }
        .padding(.leading, 14)
        .padding(.trailing, 4)
        .padding(.vertical, 4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(NxColors.warningSoft, in: RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous))
        .accessibilityElement(children: .contain)
    }
}

// MARK: - Carga

/// Bloque gris con brillo que barre de izquierda a derecha cada 1,2 s (Android
/// `NxSkeletonBlock`: #E2E8F0 ↔ #F8FAFC). Sin brillo si «Reducir movimiento».
struct NxSkeletonBlock: View {
    var height: CGFloat = 16
    var cornerRadius: CGFloat = 8
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private static let base = NxColors.border
    private static let brillo = NxColors.surface

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30.0, paused: reduceMotion)) { timeline in
            GeometryReader { geo in
                let segundos = timeline.date.timeIntervalSinceReferenceDate
                let fase = CGFloat(segundos.truncatingRemainder(dividingBy: 1.2) / 1.2)
                let ancho = max(geo.size.width, 1)
                // Mismo barrido que Android (600 px → 230 pt, banda de ±76 pt).
                let inicio = (fase * 230 - 76) / ancho
                let fin = (fase * 230 + 76) / ancho
                LinearGradient(
                    colors: reduceMotion ? [Self.base, Self.base] : [Self.base, Self.brillo, Self.base],
                    startPoint: UnitPoint(x: inicio, y: 0.5),
                    endPoint: UnitPoint(x: fin, y: 0.5)
                )
            }
        }
        .frame(height: height)
        .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
        .accessibilityHidden(true)
    }
}

/// Lista de carga (Android `NxSkeletonList`): bloques de 72 con radio 16
/// separados 8.
struct NxSkeletonList: View {
    var itemCount: Int = 5
    var itemHeight: CGFloat = 72

    var body: some View {
        VStack(spacing: NxSpacing.s) {
            ForEach(0..<max(itemCount, 0), id: \.self) { _ in
                NxSkeletonBlock(height: itemHeight, cornerRadius: NxRadius.l)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Cargando")
    }
}

// MARK: - Chips y estados

/// Píldora de color (Android `NxChip`): fondo al 12 % del color, punto u icono
/// opcional y texto 12,5 SemiBold en el color.
struct NxChip: View {
    let text: String
    let color: Color
    var systemImage: String? = nil
    var dot: Bool = false

    var body: some View {
        HStack(spacing: 5) {
            if dot {
                Circle().fill(color).frame(width: 7, height: 7)
            }
            if let systemImage {
                Image(systemName: systemImage)
                    .font(.system(size: 12, weight: .semibold))
                    .frame(width: 14, height: 14)
            }
            Text(text)
                .font(.system(size: 12.5, weight: .semibold))
                .lineLimit(1)
        }
        .foregroundStyle(color)
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(color.opacity(0.12), in: Capsule())
        .accessibilityElement(children: .combine)
    }
}

/// Estado como punto y palabra (Android `NxStatusDot`). `color == nil` = el gris
/// del flujo normal; se pone color solo cuando ese renglón pide acción.
struct NxStatusDot: View {
    let text: String
    var color: Color? = nil
    var fontSize: CGFloat = 12.5
    var fontWeight: Font.Weight = .medium
    var maxLines: Int = 1

    var body: some View {
        let tinta = color ?? NxColors.fg2
        HStack(alignment: .center, spacing: 6) {
            Circle().fill(tinta).frame(width: 6, height: 6)
            Text(text)
                .font(.system(size: fontSize, weight: fontWeight))
                .foregroundStyle(tinta)
                .lineLimit(maxLines)
        }
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Tira de cifras

/// Una celda de la tira de cifras (Android `NxMetric`). `color` tiñe solo la
/// cifra, y solo cuando pide que alguien haga algo.
struct NxMetric: Identifiable {
    /// Identificador estable; la pantalla lo usa para saber qué celda se tocó.
    let clave: String
    let etiqueta: String
    let valor: String
    /// De qué se compone la cifra: «de 8 en el equipo», «1 urgente».
    var pista: String? = nil
    /// `nil` = tinta normal.
    var color: Color? = nil

    var id: String { clave }
}

/// Tira de cifras (Android `NxMetricStrip`): UNA caja con borde y celdas
/// divididas; con 4 o más cifras, 2 columnas. Etiqueta 11 Medium, cifra 24 Bold,
/// pista 11. Con `onSelect`, cada celda filtra y la elegida se tiñe de marca.
/// Vacía no dibuja nada (una fila de ceros no informa).
struct NxMetricStrip: View {
    let items: [NxMetric]
    var seleccion: String? = nil
    var onSelect: ((String) -> Void)? = nil

    private var columnas: Int { items.count >= 4 ? 2 : max(items.count, 1) }

    private var filas: [[NxMetric]] {
        stride(from: 0, to: items.count, by: columnas).map {
            Array(items[$0..<min($0 + columnas, items.count)])
        }
    }

    var body: some View {
        if !items.isEmpty {
            VStack(spacing: 0) {
                ForEach(Array(filas.enumerated()), id: \.offset) { indice, celdas in
                    if indice > 0 {
                        Rectangle().fill(NxColors.borderSubtle).frame(height: 1)
                    }
                    HStack(spacing: 0) {
                        ForEach(Array(celdas.enumerated()), id: \.offset) { i, metric in
                            if i > 0 {
                                Rectangle().fill(NxColors.borderSubtle).frame(width: 1)
                            }
                            celda(metric)
                        }
                        // Hueco de la última fila incompleta: sin borde, para no fingir una celda.
                        ForEach(0..<(columnas - celdas.count), id: \.self) { _ in
                            Color.clear.frame(maxWidth: .infinity)
                        }
                    }
                    .fixedSize(horizontal: false, vertical: true)
                }
            }
            .background(NxColors.card)
            .clipShape(RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: NxRadius.m, style: .continuous)
                    .strokeBorder(NxColors.border, lineWidth: 1)
            )
        }
    }

    @ViewBuilder
    private func celda(_ metric: NxMetric) -> some View {
        let activa = seleccion != nil && seleccion == metric.clave
        let contenido = VStack(alignment: .leading, spacing: 1) {
            Text(metric.etiqueta)
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(NxColors.fg2)
                .lineLimit(1)
            Text(metric.valor)
                .font(.system(size: 24, weight: .bold))
                .foregroundStyle(metric.color ?? NxColors.fg)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            if let pista = metric.pista, !pista.isEmpty {
                Text(pista)
                    .font(.system(size: 11))
                    .foregroundStyle(NxColors.muted)
                    .lineLimit(1)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(activa ? NxColors.brandSoft.opacity(0.55) : Color.clear)
        .contentShape(Rectangle())

        if let onSelect {
            Button { onSelect(metric.clave) } label: { contenido }
                .buttonStyle(.plain)
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(activa ? AccessibilityTraits.isSelected : [])
        } else {
            contenido
                .accessibilityElement(children: .combine)
        }
    }
}

// MARK: - Filtros y controles

/// Fila de filtros que se desliza, sin fondo ni recuadro (Android `NxFilterBar`).
struct NxFilterBar<Content: View>: View {
    var horizontalPadding: CGFloat
    let content: Content

    init(horizontalPadding: CGFloat = 16, @ViewBuilder content: () -> Content) {
        self.horizontalPadding = horizontalPadding
        self.content = content()
    }

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(alignment: .center, spacing: NxSpacing.s) { content }
                .padding(.horizontal, horizontalPadding)
                .padding(.vertical, 1)
        }
    }
}

/// Pastilla de filtro (Android `NxFilterPill`): 40 de alto, punto de color,
/// conteo; activa con borde de marca de 1,5 y fondo `brandSoft`.
struct NxFilterPill: View {
    let label: String
    var count: Int?
    let selected: Bool
    var color: Color?
    let onClick: () -> Void

    init(label: String, count: Int? = nil, selected: Bool, color: Color? = nil, onClick: @escaping () -> Void) {
        self.label = label
        self.count = count
        self.selected = selected
        self.color = color
        self.onClick = onClick
    }

    private var fondo: Color {
        if selected, let color { return color.opacity(0.12) }
        return selected ? NxColors.brandSoft : NxColors.card
    }

    private var filo: Color {
        if selected, let color { return color.opacity(0.55) }
        return selected ? NxColors.brand : NxColors.border
    }

    var body: some View {
        Button(action: onClick) {
            HStack(alignment: .center, spacing: 6) {
                if let color {
                    Circle().fill(color).frame(width: 7, height: 7)
                }
                Text(label)
                    .font(.system(size: 13, weight: selected ? .bold : .medium))
                    .foregroundStyle(selected ? NxColors.fg : NxColors.fg2)
                    .lineLimit(1)
                if let count {
                    Text("\(count)")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle((selected ? NxColors.fg : NxColors.fg2).opacity(0.65))
                        .lineLimit(1)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .frame(minHeight: 40)
            .background(fondo, in: Capsule())
            .overlay(Capsule().strokeBorder(filo, lineWidth: selected ? 1.5 : 1))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(selected ? AccessibilityTraits.isSelected : [])
    }
}

/// Control segmentado (Android `NxSegmented`): un contenedor de radio 8 con
/// borde; la opción activa va llena de marca con letra blanca.
struct NxSegmented: View {
    let options: [String]
    let selectedIndex: Int
    let onSelect: (Int) -> Void

    init(options: [String], selectedIndex: Int, onSelect: @escaping (Int) -> Void) {
        self.options = options
        self.selectedIndex = selectedIndex
        self.onSelect = onSelect
    }

    init(options: [String], selection: Binding<Int>) {
        self.init(options: options, selectedIndex: selection.wrappedValue, onSelect: { selection.wrappedValue = $0 })
    }

    var body: some View {
        HStack(spacing: 2) {
            ForEach(Array(options.enumerated()), id: \.offset) { i, label in
                let on = i == selectedIndex
                Button { onSelect(i) } label: {
                    Text(label)
                        .font(.system(size: 13, weight: on ? .bold : .medium))
                        .foregroundStyle(on ? Color.white : NxColors.fg2)
                        .lineLimit(1)
                        .padding(.horizontal, 14)
                        .frame(minHeight: 40)
                        .background(
                            on ? NxColors.brand : Color.clear,
                            in: RoundedRectangle(cornerRadius: 6, style: .continuous)
                        )
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(on ? AccessibilityTraits.isSelected : [])
            }
        }
        .padding(2)
        .background(NxColors.card, in: RoundedRectangle(cornerRadius: NxRadius.s, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: NxRadius.s, style: .continuous)
                .strokeBorder(NxColors.border, lineWidth: 1)
        )
    }
}

/// Campo de búsqueda (Android `NxSearchField` = `OutlinedTextField`): contorno
/// #CBD5E1 (2 de marca con foco), radio 16, lupa y botón para borrar.
struct NxSearchField: View {
    @Binding var text: String
    var placeholder: String
    var enabled: Bool
    @FocusState private var focused: Bool

    init(text: Binding<String>, placeholder: String = "Buscar…", enabled: Bool = true) {
        self._text = text
        self.placeholder = placeholder
        self.enabled = enabled
    }

    var body: some View {
        HStack(alignment: .center, spacing: 0) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 17, weight: .regular))
                .foregroundStyle(focused ? NxColors.brand : NxColors.muted)
                .frame(width: 48, height: 48)
                .accessibilityHidden(true)
            TextField("", text: $text, prompt: Text(placeholder).foregroundColor(NxColors.muted))
                .font(NxType.bodyLarge)
                .foregroundStyle(NxColors.fg)
                .tint(NxColors.brand)
                .focused($focused)
                .submitLabel(.search)
                .autocorrectionDisabled()
                .accessibilityLabel(placeholder)
            if !text.isEmpty {
                Button { text = "" } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(NxColors.muted)
                        .frame(width: 48, height: 48)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Limpiar búsqueda")
            } else {
                Spacer().frame(width: 12)
            }
        }
        .frame(minHeight: 56)
        .overlay(
            RoundedRectangle(cornerRadius: NxRadius.l, style: .continuous)
                .strokeBorder(focused ? NxColors.brand : NxColors.borderStrong, lineWidth: focused ? 2 : 1)
        )
        .contentShape(Rectangle())
        .onTapGesture { if enabled { focused = true } }
        .disabled(!enabled)
        .opacity(enabled ? 1 : 0.6)
    }
}

// MARK: - Botones

/// Botón principal (Android `NxPrimaryButton`): 52 de alto, radio 12, marca,
/// spinner o icono de 18 a la izquierda. Ancho completo por omisión.
struct NxPrimaryButton: View {
    let title: String
    var systemImage: String?
    var loading: Bool
    var enabled: Bool
    var fullWidth: Bool
    var tint: Color
    let action: () -> Void

    init(
        _ title: String,
        systemImage: String? = nil,
        loading: Bool = false,
        enabled: Bool = true,
        fullWidth: Bool = true,
        tint: Color = NxColors.brand,
        action: @escaping () -> Void
    ) {
        self.title = title
        self.systemImage = systemImage
        self.loading = loading
        self.enabled = enabled
        self.fullWidth = fullWidth
        self.tint = tint
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            NxButtonContent(title: title, systemImage: systemImage, loading: loading, progressTint: .white)
        }
        .buttonStyle(NxPrimaryButtonStyle(tint: tint, fullWidth: fullWidth))
        .disabled(!enabled || loading)
    }
}

/// Botón secundario (Android `NxSecondaryButton` = `OutlinedButton`): misma
/// altura, contorno #CBD5E1 y letra de marca. Del ancho de su texto por omisión.
struct NxSecondaryButton: View {
    let title: String
    var systemImage: String?
    var loading: Bool
    var enabled: Bool
    var fullWidth: Bool
    var tint: Color
    let action: () -> Void

    init(
        _ title: String,
        systemImage: String? = nil,
        loading: Bool = false,
        enabled: Bool = true,
        fullWidth: Bool = false,
        tint: Color = NxColors.brand,
        action: @escaping () -> Void
    ) {
        self.title = title
        self.systemImage = systemImage
        self.loading = loading
        self.enabled = enabled
        self.fullWidth = fullWidth
        self.tint = tint
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            NxButtonContent(title: title, systemImage: systemImage, loading: loading, progressTint: tint)
        }
        .buttonStyle(NxSecondaryButtonStyle(tint: tint, fullWidth: fullWidth))
        .disabled(!enabled || loading)
    }
}

/// Contenido de los botones de Android: spinner de 18 (o icono de 18) y el texto.
private struct NxButtonContent: View {
    let title: String
    let systemImage: String?
    let loading: Bool
    let progressTint: Color

    var body: some View {
        HStack(alignment: .center, spacing: 0) {
            if loading {
                ProgressView()
                    .controlSize(.small)
                    .tint(progressTint)
                    .frame(width: 18, height: 18)
                    .padding(.trailing, 10)
            } else if let systemImage {
                Image(systemName: systemImage)
                    .font(.system(size: 16, weight: .semibold))
                    .frame(width: 18, height: 18)
                    .padding(.trailing, 8)
                    .accessibilityHidden(true)
            }
            Text(title).lineLimit(1)
        }
    }
}

/// Botón de píldora de Material 3 (`Button` / `OutlinedButton` con relleno
/// 14 × 8): 40 de alto, letra 14 SemiBold. Lo usan Aprobar / Rechazar.
struct NxPillButtonStyle: ButtonStyle {
    var fill: Color
    var foreground: Color
    var border: Color? = nil

    func makeBody(configuration: Configuration) -> some View {
        NxPillButtonBody(configuration: configuration, fill: fill, foreground: foreground, border: border)
    }
}

private struct NxPillButtonBody: View {
    let configuration: ButtonStyleConfiguration
    let fill: Color
    let foreground: Color
    let border: Color?
    @Environment(\.isEnabled) private var isEnabled

    var body: some View {
        configuration.label
            .font(NxType.labelLarge)
            .lineLimit(1)
            .foregroundStyle(isEnabled ? foreground : NxColors.fg.opacity(0.38))
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .frame(minHeight: 40)
            .background(isEnabled ? fill : (border == nil ? NxColors.fg.opacity(0.12) : Color.clear), in: Capsule())
            .overlay {
                if let border {
                    Capsule().strokeBorder(isEnabled ? border : NxColors.fg.opacity(0.12), lineWidth: 1)
                }
            }
            .opacity(configuration.isPressed ? 0.85 : 1)
            .contentShape(Capsule())
    }
}

/// Aprobar (verde lleno) / Rechazar (contorno, letra roja), como los botones de
/// `NxDecisionCard` de Android.
struct NxDecisionButtons: View {
    var approveLabel: String = "Aprobar"
    var rejectLabel: String = "Rechazar"
    var acting: Bool = false
    let onApprove: () -> Void
    let onReject: () -> Void

    var body: some View {
        HStack(spacing: NxSpacing.s) {
            Button(approveLabel, action: onApprove)
                .buttonStyle(NxPillButtonStyle(fill: NxColors.success, foreground: .white))
            Button(rejectLabel, action: onReject)
                .buttonStyle(NxPillButtonStyle(fill: .clear, foreground: NxColors.danger, border: NxColors.borderStrong))
        }
        .disabled(acting)
    }
}

// MARK: - Pestañas subrayadas

/// Una pestaña de `NxUnderlineTabs`.
struct NxUnderlineTab<ID: Hashable>: Identifiable {
    let id: ID
    let title: String
    var systemImage: String? = nil
}

/// Pestañas subrayadas (Android `VistaTabs` / `TabRow`): texto 13,5 (Bold y de
/// marca la activa, Medium gris las demás), icono opcional de 17, subrayado de
/// marca de 2 y un divisor debajo. `scrollable` para muchas pestañas.
struct NxUnderlineTabs<ID: Hashable>: View {
    let tabs: [NxUnderlineTab<ID>]
    @Binding var selection: ID
    var scrollable: Bool

    init(tabs: [NxUnderlineTab<ID>], selection: Binding<ID>, scrollable: Bool = false) {
        self.tabs = tabs
        self._selection = selection
        self.scrollable = scrollable
    }

    var body: some View {
        VStack(spacing: 0) {
            if scrollable {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 0) {
                        ForEach(tabs) { tab in pestana(tab).padding(.horizontal, 12) }
                    }
                    .padding(.horizontal, 4)
                }
            } else {
                HStack(spacing: 0) {
                    ForEach(tabs) { tab in pestana(tab).frame(maxWidth: .infinity) }
                }
                .padding(.horizontal, NxSpacing.screenH)
            }
            Rectangle().fill(NxColors.border).frame(height: 1)
        }
    }

    private func pestana(_ tab: NxUnderlineTab<ID>) -> some View {
        let on = tab.id == selection
        return Button {
            selection = tab.id
        } label: {
            VStack(spacing: 0) {
                HStack(spacing: 6) {
                    if let systemImage = tab.systemImage {
                        Image(systemName: systemImage)
                            .font(.system(size: 15, weight: .medium))
                            .frame(width: 17, height: 17)
                            .accessibilityHidden(true)
                    }
                    Text(tab.title)
                        .font(.system(size: 13.5, weight: on ? .bold : .medium))
                        .lineLimit(1)
                }
                .foregroundStyle(on ? NxColors.brand : NxColors.fg2)
                .padding(.top, 12)
                .padding(.bottom, 8)
                // El subrayado es el único adorno: marca dónde estás sin dibujar una caja.
                Rectangle()
                    .fill(on ? NxColors.brand : Color.clear)
                    .frame(height: 2)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? AccessibilityTraits.isSelected : [])
    }
}

// MARK: - Botón flotante

/// Botón flotante extendido (Android `ExtendedFloatingActionButton` de marca):
/// 56 de alto, radio 16, icono de 24 y texto 14 SemiBold blancos, elevación 6.
struct NxFab: View {
    let title: String
    var systemImage: String = "plus"
    let action: () -> Void

    init(_ title: String, systemImage: String = "plus", action: @escaping () -> Void) {
        self.title = title
        self.systemImage = systemImage
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            HStack(alignment: .center, spacing: 12) {
                Image(systemName: systemImage)
                    .font(.system(size: 20, weight: .semibold))
                    .frame(width: 24, height: 24)
                    .accessibilityHidden(true)
                Text(title)
                    .font(NxType.labelLarge)
                    .lineLimit(1)
            }
            .foregroundStyle(Color.white)
            .padding(.leading, 16)
            .padding(.trailing, 20)
            .frame(height: 56)
            .background(
                RoundedRectangle(cornerRadius: NxRadius.l, style: .continuous)
                    .fill(NxColors.brand)
                    .nxElevation(6)
            )
            .contentShape(RoundedRectangle(cornerRadius: NxRadius.l, style: .continuous))
        }
        .buttonStyle(NxPressableStyle())
    }
}

extension View {
    /// Pone un `NxFab` en la esquina inferior derecha, a 16 de los bordes, como
    /// `Modifier.align(Alignment.BottomEnd).padding(16)` en Android.
    func nxFab(
        _ title: String,
        systemImage: String = "plus",
        visible: Bool = true,
        action: @escaping () -> Void
    ) -> some View {
        overlay(alignment: .bottomTrailing) {
            if visible {
                NxFab(title, systemImage: systemImage, action: action)
                    .padding(NxSpacing.l)
            }
        }
    }
}

// MARK: - Avatar

/// Avatar único de la app: foto protegida en círculo o iniciales.
///
/// - `.suave` (Android `PersonAvatar`): fondo `brandSoft`, iniciales de marca
///   en ExtraBold al 34 % del lado.
/// - `.marca` (cabecera del hub «Más»): círculo de marca con iniciales blancas.
///
/// `borde` dibuja un aro de 2 (el de la foto de perfil del hub).
struct NxAvatar: View {
    enum Estilo { case suave, marca }

    let nombre: String
    var url: String? = nil
    var size: CGFloat = 44
    var estilo: Estilo = .suave
    var borde: Color? = nil

    var body: some View {
        Group {
            if let url, !url.isEmpty {
                AuthenticatedImage(url: url, contentMode: .fill, background: NxColors.brandSoft)
            } else {
                ZStack {
                    Circle().fill(estilo == .marca ? NxColors.brand : NxColors.brandSoft)
                    Text(Self.iniciales(nombre))
                        .font(.system(
                            size: size * (estilo == .marca ? 0.31 : 0.34),
                            weight: estilo == .marca ? .bold : .heavy
                        ))
                        .foregroundStyle(estilo == .marca ? Color.white : NxColors.brand)
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                }
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .overlay {
            if let borde {
                Circle().strokeBorder(borde, lineWidth: 2)
            }
        }
        .accessibilityHidden(true)
    }

    /// «CG»: primeras letras de las dos primeras palabras; «?» sin nombre.
    static func iniciales(_ nombre: String) -> String {
        let letras = nombre
            .split(whereSeparator: { $0.isWhitespace })
            .prefix(2)
            .compactMap { $0.first }
        let texto = String(letras).uppercased()
        return texto.isEmpty ? "?" : texto
    }
}

// MARK: - Piezas de «Más» (Android `ui/console/more/MoreScreenParts.kt`)

/// Tarjeta blanca de las pantallas de consulta (Android `MoreTarjeta`): radio 16,
/// elevación 2, relleno 14 y 8 entre sus elementos.
struct MoreTarjeta<Contenido: View>: View {
    var onClick: (() -> Void)?
    let contenido: Contenido

    init(onClick: (() -> Void)? = nil, @ViewBuilder contenido: () -> Contenido) {
        self.onClick = onClick
        self.contenido = contenido()
    }

    var body: some View {
        NxPanelShell(spacing: NxSpacing.s, onClick: onClick) { contenido }
    }
}

/// Cabecera de un bloque (Android `MoreCabecera`): título 14 Bold, subtítulo 11
/// y una cuenta 12 gris a la derecha.
struct MoreCabecera: View {
    let titulo: String
    var subtitulo: String? = nil
    var trailing: String? = nil

    var body: some View {
        HStack(alignment: .center, spacing: NxSpacing.s) {
            VStack(alignment: .leading, spacing: 0) {
                Text(titulo)
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(NxColors.fg)
                    .accessibilityAddTraits(.isHeader)
                if let subtitulo, !subtitulo.isEmpty {
                    Text(subtitulo)
                        .font(NxType.labelSmall)
                        .foregroundStyle(NxColors.muted)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if let trailing, !trailing.isEmpty {
                Text(trailing)
                    .font(NxType.labelMedium)
                    .foregroundStyle(NxColors.muted)
            }
        }
        .padding(.horizontal, 2)
    }
}

/// Lo que la pantalla NO hace, al pie y SIN botón (Android `MoreNotaDeAlcance`).
struct MoreNotaDeAlcance: View {
    let texto: String

    var body: some View {
        HStack(alignment: .top, spacing: NxSpacing.s) {
            Image(systemName: "info.circle")
                .font(.system(size: 14, weight: .regular))
                .foregroundStyle(NxColors.muted)
                .frame(width: 16, height: 16)
                .accessibilityHidden(true)
            Text(texto)
                .font(NxType.labelMedium)
                .foregroundStyle(NxColors.muted)
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 4)
        .padding(.vertical, 8)
    }
}

/// Un número con su etiqueta, su pie y su tono (Android `KpisEquipoRules.Dato`).
struct MoreDato: Identifiable {
    let etiqueta: String
    let valor: String
    let pie: String
    var tono: NxTone = .neutral

    var id: String { etiqueta }
}

/// Tarjeta de dato (Android `MoreDatoCard`): etiqueta 12 gris, cuadrito del tono
/// y cifra 22 Bold, pie 11. El color nunca va solo: el pie lo dice con palabras.
struct MoreDatoCard: View {
    let dato: MoreDato

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(dato.etiqueta)
                .font(NxType.labelMedium)
                .foregroundStyle(NxColors.muted)
            HStack(alignment: .center, spacing: 6) {
                RoundedRectangle(cornerRadius: 4, style: .continuous)
                    .fill(dato.tono.fg)
                    .frame(width: 8, height: 8)
                Text(dato.valor)
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(NxColors.fg)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
            }
            Text(dato.pie)
                .font(NxType.labelSmall)
                .foregroundStyle(NxColors.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .nxCardSurface()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(dato.etiqueta): \(dato.valor). \(dato.pie)")
    }
}

/// Los datos en rejilla (Android `MoreRejillaDeDatos`): 2 columnas, 10 de separación.
struct MoreRejillaDeDatos: View {
    let datos: [MoreDato]
    var columnas: Int = 2

    var body: some View {
        let cols = max(columnas, 1)
        let filas = stride(from: 0, to: datos.count, by: cols).map {
            Array(datos[$0..<min($0 + cols, datos.count)])
        }
        VStack(spacing: NxSpacing.listGap) {
            ForEach(Array(filas.enumerated()), id: \.offset) { _, fila in
                HStack(alignment: .top, spacing: NxSpacing.listGap) {
                    ForEach(Array(fila.enumerated()), id: \.offset) { _, dato in
                        MoreDatoCard(dato: dato)
                    }
                    ForEach(0..<(cols - fila.count), id: \.self) { _ in
                        Color.clear.frame(maxWidth: .infinity)
                    }
                }
            }
        }
    }
}

/// Barra de avance con su texto (Android `MoreBarra`). `progreso == nil` es
/// desconocido, no cero: barra vacía en gris y el texto lo dice.
struct MoreBarra: View {
    let progreso: Double?
    let etiqueta: String
    var tono: NxTone = .brand

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 4, style: .continuous).fill(tono.bg)
                    RoundedRectangle(cornerRadius: 4, style: .continuous)
                        .fill(progreso == nil ? NxColors.muted : tono.fg)
                        .frame(width: geo.size.width * CGFloat(min(max(progreso ?? 0, 0), 1)))
                }
            }
            .frame(height: 8)
            .accessibilityHidden(true)
            Text(etiqueta)
                .font(NxType.labelSmall)
                .foregroundStyle(NxColors.muted)
        }
    }
}

/// Cinta de «esto que ves es de hace un momento» (Android `MoreAvisoDesactualizado`).
struct MoreAvisoDesactualizado: View {
    let mensaje: String
    var onCerrar: (() -> Void)? = nil

    var body: some View {
        HStack(alignment: .center, spacing: 10) {
            Image(systemName: "icloud.slash")
                .font(.system(size: 17, weight: .regular))
                .foregroundStyle(NxColors.warning)
                .frame(width: 20, height: 20)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 0) {
                Text("Sigues viendo lo último que se pudo cargar")
                    .font(.system(size: 12.5, weight: .semibold))
                    .foregroundStyle(NxColors.fg)
                Text(mensaje)
                    .font(NxType.labelSmall)
                    .foregroundStyle(NxColors.muted)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if let onCerrar {
                Button(action: onCerrar) {
                    Image(systemName: "xmark")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(NxColors.muted)
                        .nxTapTarget()
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Ocultar el aviso")
            }
        }
        .padding(.leading, 14)
        .padding(.trailing, 4)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(NxColors.warningSoft, in: RoundedRectangle(cornerRadius: NxRadius.l, style: .continuous))
        .accessibilityElement(children: .contain)
    }
}

/// Chip de semáforo con su palabra; el color solo acompaña (Android `MoreChipSemaforo`).
struct MoreChipSemaforo: View {
    let semaforo: CoreExtrasSemaforo
    var etiqueta: String? = nil

    var body: some View {
        NxStatusChip(text: etiqueta ?? semaforo.etiqueta, tone: semaforo.tono)
    }
}
