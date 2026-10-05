import SwiftUI

/// «Lo que puedes hacer»: los permisos del rol en lenguaje llano, agrupados por
/// módulo. Misma tarjeta que `PermisosAmigables` de `MyProfileScreen` (Android):
/// blanca, radio 16, título, «Según tu puesto…», una fila gris por módulo y lo
/// heredado de otros paneles plegado bajo un botón de texto.
///
/// Por qué vive en el perfil y no en un ajuste escondido: cuando a alguien le sale
/// «Sin permisos para esta acción» estando en campo, la pregunta siguiente siempre
/// es «¿y qué sí puedo hacer?». Esto la contesta sin llamar a soporte.
///
/// Los permisos salen de la sesión que ya está en memoria (`GET me/permissions` los
/// refresca al volver a primer plano), así que esta tarjeta no carga nada por su
/// cuenta: no tiene ni estado vacío ni error propios.
struct MyProfilePermisosSection: View {
    /// Dirección y super admin tienen comodines de ruta, no una lista de módulos:
    /// enseñarles la lista corta sería mentirles a la baja.
    let accesoTotal: Bool

    private let core: [PermissionLabels.Grupo]
    private let otros: [PermissionLabels.Grupo]

    @State private var verOtros = false

    private static let sub = NxColors.rgb(0x64748B)

    init(permisos: [String], accesoTotal: Bool) {
        self.accesoTotal = accesoTotal
        let grupos = PermissionLabels.agrupar(permisos)
        self.core = grupos.filter { $0.modulo.core }
        self.otros = grupos.filter { !$0.modulo.core }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Lo que puedes hacer")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(NxColors.fg)
                .accessibilityAddTraits(.isHeader)
            Text(accesoTotal
                 ? "Tienes acceso completo de dirección a NEXARA."
                 : "Según tu puesto en la empresa.")
                .font(NxType.bodySmall)
                .foregroundStyle(Self.sub)

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
                        .font(NxType.labelLarge)
                        .foregroundStyle(NxColors.brand)
                        .padding(.horizontal, 12)
                        .frame(minHeight: 40)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                if verOtros {
                    ForEach(otros) { fila($0) }
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .nxCardSurface(radius: NxRadius.l, elevation: 1)
    }

    /// `PermisoFila`: fondo #F8FAFC de radio 10, punto de 8 (de marca si el
    /// módulo vive en la app), nombre 14 SemiBold y las acciones en 12,5 gris.
    private func fila(_ grupo: PermissionLabels.Grupo) -> some View {
        HStack(alignment: .center, spacing: 10) {
            Circle()
                .fill(grupo.modulo.core ? NxColors.brand : Self.sub)
                .frame(width: 8, height: 8)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 0) {
                Text(grupo.modulo.nombre)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(NxColors.fg)
                Text(PermissionLabels.unirAcciones(grupo.acciones))
                    .font(NxType.bodySmall)
                    .foregroundStyle(Self.sub)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(NxColors.surface, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}
