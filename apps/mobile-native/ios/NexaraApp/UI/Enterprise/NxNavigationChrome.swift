import SwiftUI
import UIKit

// MARK: - Cromo de navegación igual a Android
//
// Barra superior teal (Android `TopAppBar` con `NxBrandTopAppBarColors`) y barra
// inferior propia (Android `NxBottomTabBar`, Material 3 `NavigationBar`). Las
// usa `CoreShellView`; las pantallas solo aplican `.nxBrandNavBar(…)` a lo que
// ellas mismas empujan o presentan.

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

// MARK: - Barra superior teal

/// `true` cuando una vista de DENTRO ya puso su propia barra teal: la de fuera
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
    @Environment(\.nxOpenNotifications) private var openNotifications
    @State private var hayOtraDentro = false

    private var muestraTitulo: Bool { title != nil && !hayOtraDentro }
    private var muestraCampana: Bool { showsBell && openNotifications != nil && !hayOtraDentro }

    func body(content: Content) -> some View {
        conTitulo(
            content.onPreferenceChange(NxBrandNavBarInteriorKey.self) { hayOtraDentro = $0 }
        )
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(NxColors.brand, for: .navigationBar)
        .toolbarBackground(.visible, for: .navigationBar)
        // Barra «oscura»: título blanco y la hora y la batería en blanco. Los
        // botones de la barra salen blancos porque `AccentColor` es blanco con
        // rasgo oscuro (ver `NxBrand`).
        .toolbarColorScheme(.dark, for: .navigationBar)
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

/// Título de la barra teal: 16 SemiBold blanco en una línea (Android `titleMedium`).
private struct NxBrandNavTitle: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(Color.white)
            .lineLimit(1)
            .truncationMode(.tail)
            .accessibilityAddTraits(.isHeader)
    }
}

extension View {
    /// Barra superior teal de Android en esta pantalla: fondo #1F9E84 siempre
    /// visible, título 16 SemiBold blanco en una línea, flecha de volver blanca
    /// (solo si la pantalla está apilada), hora y batería en blanco y, a la
    /// derecha, la campana con su insignia roja.
    ///
    /// - `title`: si se da, se pinta con la letra exacta de Android y se usa como
    ///   `navigationTitle`. Con `nil` se respeta el título que ponga la pantalla.
    /// - `showsBell`: `false` dentro de Notificaciones (abrirla ya da todo por visto).
    ///
    /// Regla: lo aplica QUIEN ABRE la pantalla (el shell a sus pestañas y
    /// cubiertas, el hub a sus módulos, cada pantalla a lo que empuja). Si dos lo
    /// aplican a la misma vista no pasa nada: se ve una sola campana.
    func nxBrandNavBar(title: String? = nil, showsBell: Bool = true) -> some View {
        modifier(NxBrandNavBarModifier(title: title, showsBell: showsBell))
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
                    .foregroundStyle(Color.white)
                if badge.unreadCount > 0 {
                    NxCountBadge(count: badge.unreadCount)
                        .fixedSize()
                        .offset(x: 10, y: -8)
                }
            }
        }
        .tint(Color.white)
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

/// Barra inferior de Android (`NxBottomTabBar` = Material 3 `NavigationBar`):
/// fondo #F8FAFC sin sombra, 80 de alto más el área segura. La activa lleva una
/// pastilla de 64 × 32 (radio 16) en #CFECE4 detrás del icono relleno #0F5F4F y
/// el texto 12 SemiBold #0F172A; las demás, icono de contorno y texto 12 Medium
/// #6B7889. Insignia roja con «99+» en la esquina del icono. Vibración ligera al
/// cambiar de pestaña; tocar la activa no hace nada (como Android).
struct NxBottomBar: View {
    let items: [NxBottomBarItem]
    let selectedId: String
    let onSelect: (String) -> Void

    static let height: CGFloat = 80

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
            VStack(spacing: 4) {
                ZStack {
                    Capsule()
                        .fill(NxColors.brandSoft2)
                        .frame(width: 64, height: 32)
                        .scaleEffect(x: selected ? 1 : 0.5, y: 1)
                        .opacity(selected ? 1 : 0)
                    Image(systemName: selected ? item.selectedSystemImage : item.systemImage)
                        .font(.system(size: 20, weight: .medium))
                        .foregroundStyle(selected ? NxColors.brandDeep : NxColors.muted)
                        .frame(width: 24, height: 24)
                        .overlay(alignment: .topLeading) {
                            if item.badge > 0 {
                                NxCountBadge(count: item.badge)
                                    .fixedSize()
                                    .offset(x: 12, y: -4)
                            }
                        }
                }
                .frame(width: 64, height: 32)
                Text(item.title)
                    .font(.system(size: 12, weight: selected ? .semibold : .medium))
                    .foregroundStyle(selected ? NxColors.fg : NxColors.muted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .padding(.top, 12)
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
