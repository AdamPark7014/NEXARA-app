import SwiftUI

/// A dónde lleva un módulo del hub «Más».
///
/// Existe para que haya **un solo** sitio que lo decida. Antes lo decidían dos
/// —la lista del hub y el shell cuando llega un enlace o un push— y se
/// desincronizaron: Vehículos ya tenía pantalla nativa y, aun así, un push de
/// vehículo abría la ficha de «ábrelo en la web». Cualquier módulo que estrene
/// pantalla se añade aquí una vez y los dos caminos lo respetan.
///
/// Espejo de `ConsoleRoutes.forExtra` en Android. La app ya no manda a nadie a
/// la web: lo que todavía no tiene pantalla no sale en el hub y, si llega por
/// enlace, el shell lo manda a Inicio.
struct CoreExtraDestination: View {
    let module: CoreExtraModule

    var body: some View {
        switch module {
        case .vehiculos:
            VehiculosView()
        case .kpisEquipo:
            KpisEquipoView()
        case .proyectos:
            ProyectosView()
        case .almacen:
            AlmacenView()
        case .viaticos:
            ViaticosView()
        case .herramientas:
            HerramientasView()
        case .cotizaciones, .gastos, .aprobaciones, .pagosEmpleados:
            // Pantalla nativa en camino (otra ola). Mientras, ni enlace a la web
            // ni ficha a medias: no aparecen en el hub y aquí solo se avisa.
            CoreModulePendienteView(module: module)
        }
    }

    /// ¿Este módulo ya se abre dentro de la app? El hub solo enseña los que sí,
    /// y el shell no abre por enlace los que no.
    static func tienePantallaNativa(_ module: CoreExtraModule) -> Bool {
        switch module {
        case .vehiculos, .kpisEquipo, .proyectos, .almacen, .viaticos, .herramientas:
            return true
        case .cotizaciones, .gastos, .aprobaciones, .pagosEmpleados:
            return false
        }
    }
}

/// Vista temporal de un módulo que todavía no tiene pantalla nativa. Sin
/// ningún enlace a la web; la sustituye la pantalla real en cuanto exista.
struct CoreModulePendienteView: View {
    let module: CoreExtraModule

    var body: some View {
        ScrollView {
            NxEmptyState(
                title: "En construcción",
                subtitle: module.summary,
                systemImage: module.systemImage
            )
            .padding(.top, NxSpacing.xl)
        }
        .nxScreenBackground()
        .navigationTitle(module.title)
    }
}
