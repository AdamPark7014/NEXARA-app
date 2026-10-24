import SwiftUI
import UIKit

// MARK: - Cromo de navegación
//
// Barra superior clara (título en tinta, fondo del lienzo) y barra inferior
// propia. Las usa `CoreShellView`; las pantallas aplican `.nxBrandNavBar(…)`
// a lo que ellas mismas empujan o presentan.

// MARK: - Entorno que pone el shell

private struct NxOpenNotificationsKey: EnvironmentKey {
    static let defaultValue: (() -> Void)? = nil
}

private struct NxShellChromeKey: EnvironmentKey {
    static let defaultValue: NxShellChrome? = nil
}

extension EnvironmentValues {
    /// Abre la bandeja de notificaciones. Lo pone `CoreShellView`; fuera del
    /// shell (portal, inicio de sesión) es `nil` y la campana no se dibuja.
    var nxOpenNotifications: (() -> Void)? {
        get { self[NxOpenNotificationsKey.self] }
        set { self[NxOpenNotificationsKey.self] = newValue }
    }

    /// Estado del cromo del shell (barra inferior visible u oculta).
    var nxShellChrome: NxShellChrome? {
        get { self[NxShellChromeKey.self] }
        set { self[NxShellChromeKey.self] = newValue }
    }
}

/// Lo que las pantallas le piden al shell. Hoy, solo ocultar la barra inferior
/// (Android `conBarraInferior`: fuera en el detalle de actividad, que lleva su dock).
final class NxShellChrome: ObservableObject {
    @Published private(set) var ocultanBarraInferior: Set<UUID> = []

    var barraInferiorOculta: Bool { !ocultanBarraInferior.isEmpty }

    func ocultarBarraInferior(_ token: UUID) {
        guard !ocultanBarraInferior.contains(token) else { return }
        ocultanBarraInferior.insert(token)
    }

    func mostrarBarraInferior(_ token: UUID) {
        guard ocultanBarraInferior.contains(token) else { return }
        ocultanBarraInferior.remove(token)
    }
}

// MARK: - Barra superior clara

/// `true` cuando una vista de DENTRO ya puso su propia barra: la de fuera
/// no repite campana ni título (si el shell y la pantalla la aplican los dos,
/// se ve una sola campana).
private struct NxBrandNavBarInteriorKey: PreferenceKey {
    static let defaultValue = false

    static func reduce(value: inout Bool, nextValue: () -> Bool) {
        value = value || nextValue()
    }
}

private struct NxBrandNavBarModifier: ViewModifier {
    let title: String?
    let showsBell: Bool
    let large: Bool
    @Environment(\.nxOpenNotifications) private var openNotifications
    @State private var hayOtraDentro = false

    private var muestraTitulo: Bool { title != nil && !hayOtraDentro && !large }
    private var muestraCampana: Bool { showsBell && openNotifications != nil && !hayOtraDentro }

    func body(content: Content) -> some View {
        conTitulo(
            content.onPreferenceChange(NxBrandNavBarInteriorKey.self) { hayOtraDentro = $0 }
        )
        .navigationBarTitleDisplayMode(large ? .large : .inline)
        .toolbarBackground(NxColors.surface, for: .navigationBar)
        .toolbarBackground(.visible, for: .navigationBar)
        // Barra clara: título y hora en tinta. El acento de la flecha sale del
        // rasgo claro (teal), no de una franja de color.
        .toolbarColorScheme(.light, for: .navigationBar)
        // Volver = solo la flecha, sin el nombre de la pantalla anterior (Android).
        .toolbarRole(.editor)
        .toolbar {
            if muestraTitulo {
                ToolbarItem(placement: .principal) {
                    NxBrandNavTitle(text: title ?? "")
                }
            }
            if muestraCampana {
                ToolbarItem(placement: .topBarTrailing) {
                    NxBellButton(action: openNotifications ?? {})
                }
            }
        }
        .preference(key: NxBrandNavBarInteriorKey.self, value: true)
    }

    /// `title` no cambia durante la vida del modificador: la rama es estable y no
    /// recrea la pantalla.
    @ViewBuilder
    private func conTitulo<V: View>(_ view: V) -> some View {
        if let title {
            view.navigationTitle(title)
        } else {
            view
        }
    }
}

/// Título de la barra clara: 17 SemiBold en tinta, una línea.
private struct NxBrandNavTitle: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.system(size: 17, weight: .semibold))
            .foregroundStyle(NxColors.fg)
            .lineLimit(1)
            .truncationMode(.tail)
            .accessibilityAddTraits(.isHeader)
    }
}

extension View {
    /// Barra superior clara. En la raíz de una pestaña el título es grande;
    /// al empujar, queda en línea y la flecha de volver es la del sistema.
    ///
    /// - `title`: `navigationTitle`. Con `nil` se respeta el de la pantalla.
    /// - `showsBell`: `false` dentro de Notificaciones (abrirla ya da todo por visto).
    /// - `large`: título grande, solo en la raíz de pestaña.
    ///
    /// Lo aplica quien abre la pantalla. Si dos lo aplican a la misma vista
    /// se ve una sola campana.
    func nxBrandNavBar(title: String? = nil, showsBell: Bool = true, large: Bool = false) -> some View {
        modifier(NxBrandNavBarModifier(title: title, showsBell: showsBell, large: large))
    }

    /// Oculta la barra inferior del shell mientras esta pantalla está a la vista
    /// (Android `conBarraInferior = false`). Fuera del shell no hace nada.
    func nxOcultaBarraInferior() -> some View {
        modifier(NxOcultaBarraInferiorModifier())
    }
}

private struct NxOcultaBarraInferiorModifier: ViewModifier {
    @Environment(\.nxShellChrome) private var chrome
    @State private var token = UUID()

    func body(content: Content) -> some View {
        content
            .onAppear { chrome?.ocultarBarraInferior(token) }
            .onDisappear { chrome?.mostrarBarraInferior(token) }
    }
}

/// Campana blanca con su insignia roja (Android: `Icons.Default.Notifications`
/// en la `TopAppBar`). Identificador `bell-button` para las pruebas de UI.
struct NxBellButton: View {
    let action: () -> Void
    @ObservedObject private var badge = NotificationsBadgeStore.shared

    var body: some View {
        Button(action: action) {
            ZStack(alignment: .topTrailing) {
                Image(systemName: "bell.fill")
                    .foregroundStyle(NxColors.fg)
                if badge.unreadCount > 0 {
                    NxCountBadge(count: badge.unreadCount)
                        .fixedSize()
                        .offset(x: 10, y: -8)
                }
            }
        }
        .tint(NxColors.fg)
        .accessibilityLabel(badge.unreadCount > 0 ? "Notificaciones, \(badge.unreadCount) sin leer" : "Notificaciones")
        .accessibilityIdentifier("bell-button")
    }
}

/// Insignia roja de conteo (Material 3 `Badge`): 16 de alto, «99+» desde 100.
struct NxCountBadge: View {
    let count: Int

    var body: some View {
        Text(count > 99 ? "99+" : "\(count)")
            .font(.system(size: 11, weight: .medium))
            .foregroundStyle(Color.white)
            .lineLimit(1)
            .padding(.horizontal, 4)
            .frame(minWidth: 16, minHeight: 16)
            .background(NxColors.danger, in: Capsule())
            .accessibilityHidden(true)
    }
}

// MARK: - Barra inferior

/// Un destino de la barra inferior.
struct NxBottomBarItem: Identifiable {
    /// Clave estable; el botón lleva `accessibilityIdentifier("tab-<id>")`.
    let id: String
    let title: String
    /// SF Symbol de contorno (inactiva), como `Icons.Outlined` de Android.
    let systemImage: String
    /// SF Symbol relleno (activa), como `Icons.Filled` de Android.
    let selectedSystemImage: String
    /// Conteo de la insignia; 0 = sin insignia.
    var badge: Int = 0
    /// Cómo se lee la insignia en VoiceOver: «3 pendientes», «3 sin leer».
    var badgeNoun: String = "pendientes"
}

/// Barra inferior: icono y palabra. La activa va en tinta, las demás en gris.
/// Sin pastilla. Vibración ligera al cambiar; tocar la activa no hace nada.
struct NxBottomBar: View {
    let items: [NxBottomBarItem]
    let selectedId: String
    let onSelect: (String) -> Void

    static let height: CGFloat = 56

    var body: some View {
        HStack(alignment: .top, spacing: NxSpacing.s) {
            ForEach(items) { item in
                NxBottomBarButton(item: item, selected: item.id == selectedId) {
                    guard item.id != selectedId else { return }
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    onSelect(item.id)
                }
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: Self.height)
        .background(NxColors.surface.ignoresSafeArea(edges: .bottom))
        .accessibilityElement(children: .contain)
    }
}

private struct NxBottomBarButton: View {
    let item: NxBottomBarItem
    let selected: Bool
    let action: () -> Void

    private var etiquetaAccesible: String {
        item.badge > 0 ? "\(item.title), \(item.badge) \(item.badgeNoun)" : item.title
    }

    var body: some View {
        Button(action: action) {
            VStack(spacing: 2) {
                Image(systemName: selected ? item.selectedSystemImage : item.systemImage)
                    .font(.system(size: 22, weight: .regular))
                    .foregroundStyle(selected ? NxColors.fg : NxColors.muted)
                    .frame(width: 28, height: 24)
                    .overlay(alignment: .topTrailing) {
                        if item.badge > 0 {
                            NxCountBadge(count: item.badge)
                                .fixedSize()
                                .offset(x: 8, y: -6)
                        }
                    }
                Text(item.title)
                    .font(.system(size: 10, weight: selected ? .semibold : .medium))
                    .foregroundStyle(selected ? NxColors.fg : NxColors.muted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .padding(.top, 6)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .contentShape(Rectangle())
            .animation(.easeOut(duration: 0.2), value: selected)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(etiquetaAccesible)
        .accessibilityAddTraits(selected ? AccessibilityTraits.isSelected : [])
        .accessibilityIdentifier("tab-\(item.id)")
    }
}
