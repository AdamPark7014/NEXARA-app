import SwiftUI

/// «Lo que puedes hacer»: los permisos del rol en lenguaje llano, agrupados por
/// módulo. Espejo de `PermisosAmigables` dentro de `MyProfileScreen` (Android).
///
/// Por qué vive en el perfil y no en un ajuste escondido: cuando a alguien le sale
/// «Sin permisos para esta acción» estando en campo, la pregunta siguiente siempre
/// es «¿y qué sí puedo hacer?». Esto la contesta sin llamar a soporte.
///
/// Los permisos salen de la sesión que ya está en memoria (`GET me/permissions` los
/// refresca al volver a primer plano), así que esta sección no carga nada por su
/// cuenta: no tiene ni estado vacío ni error propios.
struct MyProfilePermisosSection: View {
    /// Dirección y super admin tienen comodines de ruta, no una lista de módulos:
    /// enseñarles la lista corta sería mentirles a la baja.
    let accesoTotal: Bool

    private let core: [PermissionLabels.Grupo]
    private let otros: [PermissionLabels.Grupo]

    @State private var verOtros = false

    init(permisos: [String], accesoTotal: Bool) {
        self.accesoTotal = accesoTotal
        let grupos = PermissionLabels.agrupar(permisos)
        self.core = grupos.filter { $0.modulo.core }
        self.otros = grupos.filter { !$0.modulo.core }
    }

    var body: some View {
        Section {
            ForEach(core) { fila($0) }

            // Lo heredado de paneles que ya no están en la app va plegado: es ruido
            // para quien solo quiere saber qué puede hacer desde el teléfono.
            if !otros.isEmpty {
                Button {
                    withAnimation { verOtros.toggle() }
                } label: {
                    Text(verOtros
                         ? "Ocultar módulos fuera de la app"
                         : "Ver módulos fuera de la app (\(otros.count))")
                        .font(.footnote)
                }
                if verOtros {
                    ForEach(otros) { fila($0) }
                }
            }
        } header: {
            Text("Lo que puedes hacer")
        } footer: {
            Text(accesoTotal
                 ? "Tienes acceso completo de dirección a NEXARA."
                 : "Según tu puesto en la empresa.")
        }
    }

    private func fila(_ grupo: PermissionLabels.Grupo) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Circle()
                .fill(grupo.modulo.core ? NxBrand.primary : Color.secondary)
                .frame(width: 8, height: 8)
                .padding(.top, 6)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(grupo.modulo.nombre)
                    .font(.subheadline.weight(.semibold))
                Text(PermissionLabels.unirAcciones(grupo.acciones))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .accessibilityElement(children: .combine)
    }
}
