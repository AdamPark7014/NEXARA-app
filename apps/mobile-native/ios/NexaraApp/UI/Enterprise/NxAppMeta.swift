import SwiftUI

/// Datos de la app que se le enseñan a la gente. Espejo de `NexaraAppMeta` de
/// Android.
enum NxAppMeta {
    static let privacidadURL = URL(string: "https://nexara.com.mx/legal/privacidad")!
    static let soporteURL = URL(string: "https://nexara.com.mx/contacto")!
    static let sitioURL = URL(string: "https://nexara.com.mx")!

    /// Lo que ve la gente: solo la versión, sin número de compilación ni tipo de
    /// build. Sale del mismo `CFBundleShortVersionString` que ya usa
    /// `DeviceIdentity` para el `User-Agent`, para que soporte vea el mismo número
    /// en la pantalla y en la bitácora del servidor.
    static var versionLabel: String { "v\(DeviceIdentity.appVersion)" }
}

/// Pie con la versión de la app y el enlace al aviso de privacidad. Espejo de
/// `NxAppMetaFooter` de Android.
///
/// El enlace de privacidad no es decorativo: Apple y Google exigen que sea
/// alcanzable **desde dentro** de la app, no solo desde la ficha de la tienda.
struct NxAppMetaFooter: View {
    var mostrarPrivacidad: Bool = true

    var body: some View {
        VStack(spacing: 4) {
            Text("NEXARA · \(NxAppMeta.versionLabel)")
                .font(.caption2)
                .foregroundStyle(.secondary)
            if mostrarPrivacidad {
                Link("Política de privacidad", destination: NxAppMeta.privacidadURL)
                    .font(.caption2)
                    .tint(NxBrand.primary)
            }
        }
        .frame(maxWidth: .infinity)
        .multilineTextAlignment(.center)
    }
}
