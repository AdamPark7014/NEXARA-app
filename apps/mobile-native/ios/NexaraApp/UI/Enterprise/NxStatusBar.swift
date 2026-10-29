import UIKit

/// Color de la hora y la batería.
///
/// Sobre una barra de color (la verde del portal) tienen que ir en BLANCO, como en
/// cualquier app de iOS con barra de color. Apple ya rechazó una versión (2.3.10) por una
/// franja sólida con la hora en negro encima: se lee como barra de estado de Android.
/// `.toolbarColorScheme(.dark)` de SwiftUI no alcanzaba: con el `TabView` del shell y las
/// cubiertas a pantalla completa la hora salía negra en casi todas las pantallas (capturas
/// de CI del 05-10).
///
/// Por eso el estilo es GLOBAL (`UIViewControllerBasedStatusBarAppearance = NO` en
/// Info.plist, oscuro por omisión) y lo decide quien sabe qué hay arriba: el shell de Core
/// (todo claro desde el 28-10: cabecera de «Mi día» y barra superior clara → negro) y la
/// raíz (login y bienvenida → negro; portal, barra verde → blanco).
enum NxStatusBar {
    @MainActor
    static func textoBlanco(_ blanco: Bool) {
        let estilo: UIStatusBarStyle = blanco ? .lightContent : .darkContent
        guard UIApplication.shared.statusBarStyle != estilo else { return }
        UIApplication.shared.setStatusBarStyle(estilo, animated: false)
    }
}
