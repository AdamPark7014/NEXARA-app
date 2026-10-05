import UIKit

/// Color de la hora y la batería.
///
/// Sobre la barra teal tienen que ir en BLANCO, como en cualquier app de iOS con barra
/// de color. Apple ya rechazó una versión (2.3.10) por una franja sólida con la hora en
/// negro encima: se lee como barra de estado de Android. `.toolbarColorScheme(.dark)` de
/// SwiftUI no alcanzaba: con el `TabView` del shell y las cubiertas a pantalla completa
/// la hora salía negra en casi todas las pantallas (capturas de CI del 05-10).
///
/// Por eso el estilo es GLOBAL (`UIViewControllerBasedStatusBarAppearance = NO` en
/// Info.plist, oscuro por omisión) y lo decide quien sabe qué hay arriba: el shell (Inicio
/// sin cubierta = cabecera clara → negro; el resto lleva barra teal → blanco) y la raíz
/// (login y bienvenida → negro; portal → blanco).
enum NxStatusBar {
    @MainActor
    static func textoBlanco(_ blanco: Bool) {
        let estilo: UIStatusBarStyle = blanco ? .lightContent : .darkContent
        guard UIApplication.shared.statusBarStyle != estilo else { return }
        UIApplication.shared.setStatusBarStyle(estilo, animated: false)
    }
}
