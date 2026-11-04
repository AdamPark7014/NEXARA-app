import Foundation

/// Quién ve qué en Almacén y cómo se dice un movimiento, sin una línea de SwiftUI.
///
/// Se decide igual que en el servidor: dirección por rol o correo; quien opera, porque trae
/// `stock.manage` sin ser dirección; los demás solo consultan. Es pista para no enseñar
/// botones de más: quien decide es el API.
enum AlmacenReglas {

    enum Perfil: Hashable {
        case direccion, opera, consulta
    }

    /// Las pestañas de la pantalla. Abre en lo que está bajo mínimo: la pregunta en campo
    /// es «¿alcanza o hay que pedir?».
    enum Vista: String, CaseIterable, Identifiable {
        case bajoMinimo
        case todo
        case movimientos

        var id: String { rawValue }

        var etiqueta: String {
            switch self {
            case .bajoMinimo: return "Bajo mínimo"
            case .todo: return "Todo el inventario"
            case .movimientos: return "Movimientos"
            }
        }
    }

    static func perfil(esDireccion: Bool, permisos: [String]) -> Perfil {
        if esDireccion { return .direccion }
        return permisos.contains("stock.manage") ? .opera : .consulta
    }

    static func perfil(de usuario: SessionUser?) -> Perfil {
        perfil(
            esDireccion: CoreOrg.esDireccion(email: usuario?.email, roleKey: usuario?.roleKey),
            permisos: usuario?.permissions ?? []
        )
    }

    /// Solo quien opera escanea: registrar entradas y salidas es suyo.
    static func muestraEscaner(_ perfil: Perfil) -> Bool { perfil == .opera }

    static func vistas(_ perfil: Perfil) -> [Vista] {
        switch perfil {
        case .direccion, .opera: return [.bajoMinimo, .todo, .movimientos]
        case .consulta: return [.bajoMinimo, .todo]
        }
    }

    /// Lo que la pantalla no hace, según quién la mira.
    static func limite(_ perfil: Perfil) -> String {
        switch perfil {
        case .direccion:
            return "Consulta de toda la empresa. Registrar entradas, salidas y altas lo hace quien opera el almacén."
        case .opera:
            return "Con el escáner se consultan productos, se dan de alta y se registran entradas y salidas. "
                + "Traspasos, ajustes y costos se hacen desde la computadora."
        case .consulta:
            return "Solo consulta. Registrar entradas, salidas y altas lo hace quien opera el almacén."
        }
    }

    /// El vacío de una empresa sin existencias, dicho con lo que sigue para quien mira.
    static func vacioExistencias(_ perfil: Perfil) -> String {
        switch perfil {
        case .direccion:
            return "Todavía no hay productos con existencia. Cuando almacén dé de alta el primero y registre su entrada, aquí lo ves."
        case .opera:
            return "Todavía no hay productos con existencia. Escanea el primero, dalo de alta y registra su entrada."
        case .consulta:
            return "Todavía no hay productos con existencia. Cuando almacén los registre, aquí ves qué hay y en dónde."
        }
    }

    static func vacioMovimientos(_ perfil: Perfil) -> String {
        perfil == .opera
            ? "Cada entrada y salida que registres con el escáner queda aquí, con quién la hizo."
            : "Cada entrada y salida que registre almacén queda aquí, con quién la hizo."
    }

    // MARK: - Movimientos

    /// Los mismos nombres que el Kardex de la web (`stock-movement-pdf.ts`).
    static func etiquetaMovimiento(_ tipo: String?) -> String {
        switch (tipo ?? "").trimmingCharacters(in: .whitespacesAndNewlines).uppercased() {
        case "RECEIPT": return "Entrada"
        case "DISPATCH": return "Salida"
        case "TRANSFER": return "Traspaso"
        case "ADJUSTMENT": return "Ajuste"
        case "RETURN": return "Devolución"
        case "SCRAP": return "Merma"
        case "PRODUCTION_IN": return "Entrada de producción"
        case "PRODUCTION_OUT": return "Salida a producción"
        default: return "Movimiento"
        }
    }

    /// De dónde sale y a dónde entra; `nil` si el movimiento no dice ninguno de los dos.
    static func rutaMovimiento(_ movimiento: MovimientoDeAlmacen) -> String? {
        let origen = movimiento.fromWarehouse?.name.nilSiVacio
        let destino = movimiento.toWarehouse?.name.nilSiVacio
        if let origen, let destino { return "\(origen) → \(destino)" }
        if let origen { return "Sale de \(origen)" }
        if let destino { return "Entra a \(destino)" }
        return nil
    }

    /// Quién lo hizo. Sin dato se dice, no se deja el hueco.
    static func quienLoHizo(_ movimiento: MovimientoDeAlmacen) -> String {
        movimiento.createdBy?.nombre?.nilSiVacio ?? "Sin persona registrada"
    }

    static func tituloMovimiento(_ movimiento: MovimientoDeAlmacen) -> String {
        movimiento.product?.name.nilSiVacio ?? "Producto sin nombre"
    }

    static func buscarMovimientos(_ movimientos: [MovimientoDeAlmacen], consulta: String) -> [MovimientoDeAlmacen] {
        let q = consulta.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !q.isEmpty else { return movimientos }
        return movimientos.filter { m in
            [m.product?.name, m.product?.sku, m.createdBy?.nombre, m.movementNumber, m.fromWarehouse?.name, m.toWarehouse?.name]
                .compactMap { $0 }
                .contains { $0.lowercased().contains(q) }
        }
    }
}
