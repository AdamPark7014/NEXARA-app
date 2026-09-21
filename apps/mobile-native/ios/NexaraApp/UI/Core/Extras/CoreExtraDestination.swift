import SwiftUI

/// A dónde lleva un módulo del hub «Más».
///
/// Existe para que haya **un solo** sitio que lo decida. Antes lo decidían dos
/// —la lista del hub y el shell cuando llega un enlace o un push— y se
/// desincronizaron: Vehículos ya tenía pantalla nativa y, aun así, un push de
/// vehículo abría la ficha de «ábrelo en la web». Cualquier módulo que estrene
/// pantalla se añade aquí una vez y los dos caminos lo respetan.
///
/// Espejo de `ConsoleRoutes.forExtra` en Android.
struct CoreExtraDestination: View {
    let module: CoreExtraModule

    var body: some View {
        switch module {
        case .vehiculos:
            VehiculosView()
        case .kpisEquipo:
            KpisEquipoView()
        case .organigrama:
            OrganigramaView()
        case .proyectos:
            ProyectosView()
        case .almacen:
            AlmacenView()
        case .viaticos:
            ViaticosView()
        case .cotizaciones, .herramientas:
            // Sin pantalla propia todavía; van en otra ola.
            CoreModulePlaceholderView(module: module)
        }
    }

    /// ¿Este módulo ya se abre dentro de la app? Lo usa el hub para avisar,
    /// antes de que se toque, de cuáles siguen sacando al navegador.
    static func tienePantallaNativa(_ module: CoreExtraModule) -> Bool {
        switch module {
        case .vehiculos, .kpisEquipo, .organigrama, .proyectos, .almacen, .viaticos:
            return true
        case .cotizaciones, .herramientas:
            return false
        }
    }
}
