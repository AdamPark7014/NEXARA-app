import SwiftUI
import UIKit

// MARK: - Cromo de navegación igual a Android
//
// Barra superior de Core clara, sobre el fondo de la pantalla (Android `TopAppBar` con
// `NxCoreTopAppBarColors`, canvas de las apps del 28-10); la verde con letras blancas queda
// para el portal (`NxBrandTopAppBarColors`). Barra inferior propia, blanca (Android
// `NxBottomTabBar`). Las usa `CoreShellView`; las pantallas solo aplican `.nxBrandNavBar(…)`
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

// MARK: - Barra superior

/// Las dos barras superiores de la app.
enum NxNavBarEstilo {
    /// Core (canvas del 28-10): fondo #EEF1F5 (el de la pantalla), título 17 SemiBold #14171F,
    /// flecha de volver y campana en #14171F.
    case core
    /// Portal de clientes y sucursales: la verde de marca con letras blancas (Android la conserva).
    case portal

    var fondo: Color { self == .portal ? NxColors.brand : NxColors.surface }
    /// Título, campana y botones propios de la barra.
    var tinta: Color { self == .portal ? Color.white : NxColors.fg }
    var tamanoTitulo: CGFloat { self == .portal ? 16 : 17 }
    /// La verde se pinta con rasgo oscuro: así la flecha de volver y los botones con el acento
    /// salen blancos (`AccentColor` es blanco con rasgo oscuro y `NxBarraSuperior.tinte` también).
    var esquema: ColorScheme { self == .portal ? .dark : .light }
}

/// Lo que SwiftUI no deja pintar por pantalla: el color de la flecha de volver del sistema.
enum NxBarraSuperior {
    /// #14171F en la barra clara de Core y blanco en la verde del portal (la que va con rasgo
    /// oscuro). Sin esto la flecha saldría en el verde del acento.
    static let tinte = UIColor { rasgos in
        rasgos.userInterfaceStyle == .dark
            ? UIColor.white
            : UIColor(red: 0x14 / 255.0, green: 0x17 / 255.0, blue: 0x1F / 255.0, alpha: 1)
    }

    /// Se llama una vez al arrancar (`AppDelegate`, en el hilo principal), antes de crear la
    /// primera barra. Si SwiftUI le pusiera encima el acento, la flecha saldría verde: se ve
    /// igual, solo cambia el tono.
    static func configurar() {
        UINavigationBar.appearance().tintColor = tinte
    }
}

/// `true` cuando una vista de DENTRO ya puso su propia barra: la de fuera no repite campana ni
/// título (si el shell y la pantalla la aplican los dos, se ve una sola campana).
private struct NxBrandNavBarInteriorKey: PreferenceKey {
    static let defaultValue = false

    static func reduce(value: inout Bool, nextValue: () -> Bool) {
        value = value || nextValue()
    }
}

private struct NxBrandNavBarModifier: ViewModifier {
    let title: String?
    let showsBell: Bool
    let estilo: NxNavBarEstilo
    @Environment(\.nxOpenNotifications) private var openNotifications
    @State private var hayOtraDentro = false

    private var muestraTitulo: Bool { title != nil && !hayOtraDentro }
    private var muestraCampana: Bool { showsBell && openNotifications != nil && !hayOtraDentro }

    func body(content: Content) -> some View {
        conTitulo(
            content.onPreferenceChange(NxBrandNavBarInteriorKey.self) { hayOtraDentro = $0 }
        )
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(estilo.fondo, for: .navigationBar)
        .toolbarBackground(.visible, for: .navigationBar)
        // Core: barra clara (la hora y la batería en oscuro las pone `NxStatusBar` desde el
        // shell). Portal: barra «oscura» para que la flecha y los botones salgan blancos.
        .toolbarColorScheme(estilo.esquema, for: .navigationBar)
        // Volver = solo la flecha, sin el nombre de la pantalla anterior (Android).
        .toolbarRole(.editor)
        .toolbar {
            if muestraTitulo {
                ToolbarItem(placement: .principal) {
                    NxBrandNavTitle(text: title ?? "", estilo: estilo)
                }
            }
            if muestraCampana {
                ToolbarItem(placement: .topBarTrailing) {
                    NxBellButton(tinta: estilo.tinta, action: openNotifications ?? {})
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

/// Título de la barra en una línea: 17 SemiBold #14171F en Core, 16 SemiBold blanco en el
/// portal (Android `titleMedium`).
private struct NxBrandNavTitle: View {
    let text: String
    let estilo: NxNavBarEstilo

    var body: some View {
        Text(text)
            .font(.system(size: estilo.tamanoTitulo, weight: .semibold))
            .foregroundStyle(estilo.tinta)
            .lineLimit(1)
            .truncationMode(.tail)
            .accessibilityAddTraits(.isHeader)
    }
}

extension View {
    /// Barra superior de esta pantalla, siempre visible. En Core (por omisión) es la clara del
    /// canvas: fondo #EEF1F5 (el de la pantalla), título 17 SemiBold #14171F en una línea,
    /// flecha de volver #14171F (solo si la pantalla está apilada) y, a la derecha, la campana
    /// #14171F con su insignia roja. La hora y la batería van en oscuro (`NxStatusBar`).
    ///
    /// - `title`: si se da, se pinta con la letra exacta de Android y se usa como
    ///   `navigationTitle`. Con `nil` se respeta el título que ponga la pantalla.
    /// - `showsBell`: `false` dentro de Notificaciones (abrirla ya da todo por visto).
    /// - `estilo`: `.portal` para la verde con letras blancas del portal de clientes.
    ///
    /// Regla: lo aplica QUIEN ABRE la pantalla (el shell a sus pestañas y
    /// cubiertas, el hub a sus módulos, cada pantalla a lo que empuja). Si dos lo
    /// aplican a la misma vista no pasa nada: se ve una sola campana.
    func nxBrandNavBar(title: String? = nil, showsBell: Bool = true, estilo: NxNavBarEstilo = .core) -> some View {
        modifier(NxBrandNavBarModifier(title: title, showsBell: showsBell, estilo: estilo))
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

/// Campana de la barra con su insignia roja (Android: `Icons.Default.Notifications`
/// en la `TopAppBar`): #14171F en la barra clara de Core. Identificador `bell-button`
/// para las pruebas de UI.
struct NxBellButton: View {
    var tinta: Color = NxColors.fg
    let action: () -> Void
    @ObservedObject private var badge = NotificationsBadgeStore.shared

    var body: some View {
        Button(action: action) {
            ZStack(alignment: .topTrailing) {
                Image(systemName: "bell.fill")
                    .foregroundStyle(tinta)
                if badge.unreadCount > 0 {
                    NxCountBadge(count: badge.unreadCount)
                        .fixedSize()
                        .offset(x: 10, y: -8)
                }
            }
        }
        .tint(tinta)
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

/// Barra inferior de Core (Android `NxBottomTabBar`, canvas «App · Mi día» del 28-10):
/// blanca, con una sombra suave hacia arriba, 80 de alto más el área segura. La activa va en
/// el verde de marca #168570 (icono relleno y texto 12 SemiBold), sin pastilla; las demás,
/// icono de contorno y texto 12 Medium #5B6272. Insignia roja con «99+» en la esquina del
/// icono. Vibración ligera al cambiar de pestaña; tocar la activa no hace nada (como Android).
struct NxBottomBar: View {
    let items: [NxBottomBarItem]
    let selectedId: String
    let onSelect: (String) -> Void

    static let height: CGFloat = 80

    var body: some View {
        HStack(alignment: .top, spacing: NxSpacing.xs) {
            ForEach(items) { item in
                NxBottomBarButton(item: item, selected: item.id == selectedId) {
                    guard item.id != selectedId else { return }
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    onSelect(item.id)
                }
            }
        }
        .padding(.horizontal, NxSpacing.xs)
        .frame(maxWidth: .infinity)
        .frame(height: Self.height)
        .background {
            // Blanca hasta el borde de abajo; la sombra sube sobre el contenido (canvas:
            // `0 -12px 30px -22px rgba(16,24,40,.35)`).
            NxColors.card
                .shadow(color: NxColors.rgb(0x101828, alpha: 0.08), radius: 12, x: 0, y: -4)
                .ignoresSafeArea(edges: .bottom)
        }
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
                Image(systemName: selected ? item.selectedSystemImage : item.systemImage)
                    .font(.system(size: 20, weight: .medium))
                    .foregroundStyle(selected ? NxColors.brand : NxColors.muted)
                    .frame(width: 24, height: 24)
                    .overlay(alignment: .topLeading) {
                        if item.badge > 0 {
                            NxCountBadge(count: item.badge)
                                .fixedSize()
                                .offset(x: 12, y: -4)
                        }
                    }
                    .frame(width: 64, height: 32)
                Text(item.title)
                    .font(.system(size: 12, weight: selected ? .semibold : .medium))
                    .foregroundStyle(selected ? NxColors.brand : NxColors.muted)
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
