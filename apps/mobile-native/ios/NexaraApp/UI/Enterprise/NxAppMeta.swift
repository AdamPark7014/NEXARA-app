import SwiftUI

/// Datos de la app que se le enseñan a la gente. Espejo de `NexaraAppMeta` de
/// Android.
enum NxAppMeta {
    static let privacidadURL = URL(string: "https://nexara.com.mx/legal/privacidad")!
    static let soporteURL = URL(string: "https://nexara.com.mx/contacto")!
    static let sitioURL = URL(string: "https://nexara.com.mx")!
    /// Solicitud de eliminación de cuenta y datos (guideline 5.1.1(v) de Apple).
    /// Las cuentas las crea la organización, no la propia app, así que la baja
    /// se gestiona desde la web; la app solo abre esta página.
    static let eliminarCuentaURL = URL(string: "https://nexara.com.mx/legal/eliminar-cuenta")!

    /// Lo que ve la gente: solo la versión, sin número de compilación ni tipo de
    /// build. Sale del mismo `CFBundleShortVersionString` que ya usa
    /// `DeviceIdentity` para el `User-Agent`, para que soporte vea el mismo número
    /// en la pantalla y en la bitácora del servidor.
    static var versionLabel: String { "v\(DeviceIdentity.appVersion)" }
}

/// Pie con la versión de la app y los enlaces al aviso de privacidad y a
/// soporte. Espejo de `NxAppMetaFooter` de Android.
///
/// El enlace de privacidad no es decorativo: Apple y Google exigen que sea
/// alcanzable **desde dentro** de la app, no solo desde la ficha de la tienda.
/// El de soporte cubre la misma exigencia de contacto con el desarrollador.
struct NxAppMetaFooter: View {
    var mostrarPrivacidad: Bool = true
    var mostrarSoporte: Bool = true

    var body: some View {
        VStack(spacing: 4) {
            Text("NEXARA · \(NxAppMeta.versionLabel)")
                .font(NxType.labelSmall)
                .foregroundStyle(NxColors.muted)
            if mostrarPrivacidad || mostrarSoporte {
                HStack(spacing: 12) {
                    if mostrarPrivacidad {
                        Link("Política de privacidad", destination: NxAppMeta.privacidadURL)
                    }
                    if mostrarSoporte {
                        Link("Soporte", destination: NxAppMeta.soporteURL)
                    }
                }
                .font(NxType.labelSmall)
                .tint(NxBrand.primary)
            }
        }
        .frame(maxWidth: .infinity)
        .multilineTextAlignment(.center)
    }
}
