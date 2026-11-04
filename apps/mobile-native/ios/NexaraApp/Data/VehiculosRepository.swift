import Foundation

/// Vehículos utilitarios (`apps/api/src/vehicles`): qué traigo asignado, qué
/// puedo solicitar y el check list de salida y devolución con foto en vivo.
///
/// Todo campo que el API pueda mandar en `null` se decodifica con valor por
/// omisión: un registro raro deja la tarjeta incompleta, nunca tumba la pantalla.

/// «Ranger · ABC-123»: para lo que es de una línea (título de navegación, VoiceOver,
/// avisos). Sin nombre, «Vehículo». Sin placas, solo el nombre.
private func tituloNombreYPlacas(nombre: String, placas: String?, separador: String = " · ") -> String {
    let base = nombre.isEmpty ? "Vehículo" : nombre
    guard let placas, !placas.isEmpty else { return base }
    return "\(base)\(separador)\(placas)"
}

// MARK: - DTOs

/// El vehículo, tal como lo nombra la asignación activa.
struct VehiculoRef: Decodable, Hashable {
    var id: Int = 0
    var nombre: String = ""
    var placas: String?

    private enum CodingKeys: String, CodingKey { case id, nombre, placas }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? c.decode(Int.self, forKey: .id)) ?? 0
        nombre = (try? c.decode(String.self, forKey: .nombre)) ?? ""
        placas = try? c.decode(String.self, forKey: .placas)
    }

    var titulo: String { tituloNombreYPlacas(nombre: nombre, placas: placas) }
}

struct ConductorRef: Decodable, Hashable {
    var id: Int = 0
    var nombre: String = ""

    private enum CodingKeys: String, CodingKey { case id, nombre }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? c.decode(Int.self, forKey: .id)) ?? 0
        nombre = (try? c.decode(String.self, forKey: .nombre)) ?? ""
    }
}

/// El trabajo al que se carga el viaje en curso. La salida directa de inventario no trae.
struct ActividadDeViaje: Decodable, Hashable {
    var id: Int = 0
    var folio: String?
    var titulo: String?
    var proyecto: String?

    private enum CodingKeys: String, CodingKey { case id, folio, titulo, proyecto }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? c.decode(Int.self, forKey: .id)) ?? 0
        folio = try? c.decode(String.self, forKey: .folio)
        titulo = try? c.decode(String.self, forKey: .titulo)
        proyecto = try? c.decode(String.self, forKey: .proyecto)
    }
}

/// Lo que traigo ahora mismo: de una solicitud aprobada o tomado del inventario.
struct AsignacionActiva: Decodable, Identifiable, Hashable {
    var id: Int = 0
    /// `"solicitud"` o `"inventario"`: decide a qué par de rutas va el check list.
    var origen: String = "solicitud"
    var vehiculo: VehiculoRef?
    var actividad: ActividadDeViaje?
    var inicio: String?
    var fin: String?
    var odometroInicio: Int?
    var combustibleInicioPct: Int?
    var requiereSalida: Bool = false
    var requiereDevolucion: Bool = false

    private enum CodingKeys: String, CodingKey {
        case id, origen, vehiculo, actividad, inicio, fin
        case odometroInicio, combustibleInicioPct, requiereSalida, requiereDevolucion
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? c.decode(Int.self, forKey: .id)) ?? 0
        origen = (try? c.decode(String.self, forKey: .origen)) ?? "solicitud"
        vehiculo = try? c.decode(VehiculoRef.self, forKey: .vehiculo)
        actividad = try? c.decode(ActividadDeViaje.self, forKey: .actividad)
        inicio = try? c.decode(String.self, forKey: .inicio)
        fin = try? c.decode(String.self, forKey: .fin)
        odometroInicio = try? c.decode(Int.self, forKey: .odometroInicio)
        combustibleInicioPct = try? c.decode(Int.self, forKey: .combustibleInicioPct)
        requiereSalida = (try? c.decode(Bool.self, forKey: .requiereSalida)) ?? false
        requiereDevolucion = (try? c.decode(Bool.self, forKey: .requiereDevolucion)) ?? false
    }

    var esInventario: Bool { origen.lowercased() == "inventario" }

    /// Nivel de gasolina con el que salió, para pintarlo en la tarjeta.
    var nivelInicio: NivelCombustible? { NivelCombustible.from(pct: combustibleInicioPct) }
}

/// Una solicitud mía en curso (pendiente, aprobada o rechazada).
struct SolicitudResumen: Decodable, Identifiable, Hashable {
    var id: Int = 0
    var nombreVehiculo: String?
    var placasVehiculo: String?
    var estatusAprobacion: String = ""
    var entregaEstatus: String = ""
    var fechaInicioSolicitada: String?
    var fechaFinSolicitada: String?

    private enum CodingKeys: String, CodingKey {
        case id, nombreVehiculo, placasVehiculo, estatusAprobacion, entregaEstatus
        case fechaInicioSolicitada, fechaFinSolicitada
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? c.decode(Int.self, forKey: .id)) ?? 0
        nombreVehiculo = try? c.decode(String.self, forKey: .nombreVehiculo)
        placasVehiculo = try? c.decode(String.self, forKey: .placasVehiculo)
        estatusAprobacion = (try? c.decode(String.self, forKey: .estatusAprobacion)) ?? ""
        entregaEstatus = (try? c.decode(String.self, forKey: .entregaEstatus)) ?? ""
        fechaInicioSolicitada = try? c.decode(String.self, forKey: .fechaInicioSolicitada)
        fechaFinSolicitada = try? c.decode(String.self, forKey: .fechaFinSolicitada)
    }

    var titulo: String { tituloNombreYPlacas(nombre: nombreVehiculo ?? "", placas: placasVehiculo) }

    var aprobada: Bool {
        ["aprobada", "aprobado"].contains(estatusAprobacion.lowercased())
    }

    var rechazada: Bool {
        ["rechazada", "rechazado"].contains(estatusAprobacion.lowercased())
    }
}

/// Un vehículo del inventario que podría tomar.
struct VehiculoFlota: Decodable, Identifiable, Hashable {
    var id: Int = 0
    var nombre: String = ""
    var placas: String?
    var estatus: String = ""
    var activo: Bool = true
    var disponible: Bool = false
    var conductor: ConductorRef?
    var desde: String?
    var proximaDevolucion: String?
    var odometroUltimo: Int?
    var combustibleUltimoPct: Int?
    var gpsProveedor: String?
    var tieneRastreador: Bool = false

    private enum CodingKeys: String, CodingKey {
        case id, nombre, placas, estatus, activo, disponible, conductor, desde
        case proximaDevolucion, odometroUltimo, combustibleUltimoPct, gpsProveedor, tieneRastreador
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? c.decode(Int.self, forKey: .id)) ?? 0
        nombre = (try? c.decode(String.self, forKey: .nombre)) ?? ""
        placas = try? c.decode(String.self, forKey: .placas)
        estatus = (try? c.decode(String.self, forKey: .estatus)) ?? ""
        activo = (try? c.decode(Bool.self, forKey: .activo)) ?? true
        disponible = (try? c.decode(Bool.self, forKey: .disponible)) ?? false
        conductor = try? c.decode(ConductorRef.self, forKey: .conductor)
        desde = try? c.decode(String.self, forKey: .desde)
        proximaDevolucion = try? c.decode(String.self, forKey: .proximaDevolucion)
        odometroUltimo = try? c.decode(Int.self, forKey: .odometroUltimo)
        combustibleUltimoPct = try? c.decode(Int.self, forKey: .combustibleUltimoPct)
        gpsProveedor = try? c.decode(String.self, forKey: .gpsProveedor)
        tieneRastreador = (try? c.decode(Bool.self, forKey: .tieneRastreador)) ?? false
    }

    var titulo: String { tituloNombreYPlacas(nombre: nombre, placas: placas) }

    /// Un dato por renglón: el nombre y las placas debajo (fila de la lista y hoja de solicitud).
    var tituloRenglones: String { tituloNombreYPlacas(nombre: nombre, placas: placas, separador: "\n") }
}

/// Una solicitud de vehículo de otra persona (`GET vehicles`), para que dirección la decida.
struct SolicitudPorAprobar: Decodable, Identifiable, Hashable {
    var id: Int = 0
    var nombreVehiculo: String?
    var placasVehiculo: String?
    var motivoUso: String?
    /// `Pendiente` | `Aprobado` | `Rechazado`.
    var estatusAprobacion: String = ""
    var fechaInicioSolicitada: String?
    var fechaFinSolicitada: String?
    var solicitante: ConductorRef?
    var vehiculo: VehiculoRef?
    var actividad: ViaticoActividadRef?

    private enum CodingKeys: String, CodingKey {
        case id, nombreVehiculo, placasVehiculo, motivoUso, estatusAprobacion
        case fechaInicioSolicitada, fechaFinSolicitada, solicitante, vehiculo, actividad
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? c.decode(Int.self, forKey: .id)) ?? 0
        nombreVehiculo = try? c.decode(String.self, forKey: .nombreVehiculo)
        placasVehiculo = try? c.decode(String.self, forKey: .placasVehiculo)
        motivoUso = try? c.decode(String.self, forKey: .motivoUso)
        estatusAprobacion = (try? c.decode(String.self, forKey: .estatusAprobacion)) ?? ""
        fechaInicioSolicitada = try? c.decode(String.self, forKey: .fechaInicioSolicitada)
        fechaFinSolicitada = try? c.decode(String.self, forKey: .fechaFinSolicitada)
        solicitante = try? c.decode(ConductorRef.self, forKey: .solicitante)
        vehiculo = try? c.decode(VehiculoRef.self, forKey: .vehiculo)
        actividad = try? c.decode(ViaticoActividadRef.self, forKey: .actividad)
    }
}

/// `GET vehicles/mis-vehiculos`.
struct MisVehiculosResponse: Decodable {
    var activa: AsignacionActiva?
    var solicitudes: [SolicitudResumen] = []
    var disponibles: [VehiculoFlota] = []

    private enum CodingKeys: String, CodingKey { case activa, solicitudes, disponibles }

    init() {}

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        activa = try? c.decode(AsignacionActiva.self, forKey: .activa)
        solicitudes = (try? c.decode([SolicitudResumen].self, forKey: .solicitudes)) ?? []
        disponibles = (try? c.decode([VehiculoFlota].self, forKey: .disponibles)) ?? []
    }
}

// MARK: - Ficha, lectura de fotos y cargas (`apps/api/src/costos/vehiculos`)

/// `POST vehicles/ficha/leer-foto` con `tipo=TABLERO`. Lo que no se pudo leer llega en `nil`.
struct TableroLeido: Decodable {
    var odometroKm: Int?
    var combustible: String?
    var legible: Bool = false

    private enum CodingKeys: String, CodingKey { case odometroKm, combustible, legible }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        odometroKm = try? c.decode(Int.self, forKey: .odometroKm)
        combustible = try? c.decode(String.self, forKey: .combustible)
        legible = (try? c.decode(Bool.self, forKey: .legible)) ?? false
    }
}

/// `POST vehicles/ficha/leer-foto` con `tipo=TICKET`. `revisar`: litros × precio no da el total.
struct TicketLeido: Decodable {
    var litros: Double?
    var importe: Double?
    var legible: Bool = false
    var revisar: Bool = false

    private enum CodingKeys: String, CodingKey { case litros, importe, legible, revisar }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        litros = try? c.decode(Double.self, forKey: .litros)
        importe = try? c.decode(Double.self, forKey: .importe)
        legible = (try? c.decode(Bool.self, forKey: .legible)) ?? false
        revisar = (try? c.decode(Bool.self, forKey: .revisar)) ?? false
    }
}

/// Lo que estas pantallas usan de `GET vehicles/ficha/:id`; el resto de la ficha no se decodifica.
/// De cada carga solo se lee lo que mide el rendimiento: el importe no se pide a propósito.
struct FichaVehiculo: Decodable {
    var odometroKm: Int?
    var cargas: [GasolinaRules.CargaPrevia] = []
    var veCostos: Bool = false

    private enum CodingKeys: String, CodingKey { case odometro, cargas, acceso }
    private enum OdometroKeys: String, CodingKey { case km }
    private enum AccesoKeys: String, CodingKey { case veCostos }

    private struct Carga: Decodable {
        var odometro: Int?
        var litros: Double?
        var tanqueLleno: Bool?

        private enum CodingKeys: String, CodingKey { case odometro, litros, tanqueLleno }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            odometro = try? c.decode(Int.self, forKey: .odometro)
            litros = try? c.decode(Double.self, forKey: .litros)
            tanqueLleno = try? c.decode(Bool.self, forKey: .tanqueLleno)
        }
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        if let odometro = try? c.nestedContainer(keyedBy: OdometroKeys.self, forKey: .odometro) {
            odometroKm = try? odometro.decode(Int.self, forKey: .km)
        }
        if let acceso = try? c.nestedContainer(keyedBy: AccesoKeys.self, forKey: .acceso) {
            veCostos = (try? acceso.decode(Bool.self, forKey: .veCostos)) ?? false
        }
        let filas = (try? c.decode([Carga].self, forKey: .cargas)) ?? []
        cargas = filas.compactMap { fila in
            guard let odometro = fila.odometro, let litros = fila.litros else { return nil }
            return GasolinaRules.CargaPrevia(odometro: odometro, litros: litros, tanqueLleno: fila.tanqueLleno == true)
        }
    }
}

// MARK: - Vista de dirección

struct RenglonReparto: Decodable, Hashable {
    var km: Double?
    var importe: Double?
}

struct RepartoMes: Decodable, Hashable {
    var proyectos: RenglonReparto?
    var cotizaciones: RenglonReparto?
    var oficina: RenglonReparto?
    var sinLigar: RenglonReparto?
    var parado: Double?
}

struct ResumenMes: Decodable, Hashable {
    var km: Double?
    var costoMes: Double?
    var porKm: Double?
    var aIndirectos: Double?
}

struct ProximoServicioFicha: Decodable, Hashable {
    var faltanKm: Double?
    var fecha: String?
    var estado: String?
}

struct VehiculoDelMes: Decodable, Hashable {
    var id: Int?
    var kmDelMes: Double?
    var porKm: Double?
    var proximoServicio: ProximoServicioFicha?
}

struct AvisoFlotilla: Decodable, Hashable {
    var tono: String?
    var titulo: String?
    var texto: String?
}

/// `GET vehicles/ficha/flotilla`. Los importes llegan en `nil` a quien no ve costos. Cada parte se
/// decodifica por su lado: una rara deja la pantalla incompleta, no la tumba.
struct FlotillaMes: Decodable {
    var vehiculos: [VehiculoDelMes] = []
    var reparto: RepartoMes?
    var resumen: ResumenMes?
    var avisos: [AvisoFlotilla] = []

    private enum CodingKeys: String, CodingKey { case vehiculos, reparto, resumen, avisos }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        vehiculos = (try? c.decode([VehiculoDelMes].self, forKey: .vehiculos)) ?? []
        reparto = try? c.decode(RepartoMes.self, forKey: .reparto)
        resumen = try? c.decode(ResumenMes.self, forKey: .resumen)
        avisos = (try? c.decode([AvisoFlotilla].self, forKey: .avisos)) ?? []
    }
}

struct CargaDireccion: Decodable, Hashable {
    var id: Int?
    var fecha: String?
    var odometro: Double?
    var litros: Double?
    var importe: Double?
    var tanqueLleno: Bool?
}

struct ActividadRef: Decodable, Hashable {
    var titulo: String?
}

struct DestinoViaje: Decodable, Hashable {
    var nombre: String?
}

struct ViajeFicha: Decodable, Hashable {
    var id: Int?
    var fecha: String?
    var actividad: ActividadRef?
    var destino: DestinoViaje?
    var km: Double?
    var importe: Double?
    var sinFoto: Bool?
}

struct ServicioFicha: Decodable, Hashable {
    var id: Int?
    var fecha: String?
    var concepto: String?
    var costo: Double?
    var proveedor: String?
}

struct DesgloseCosto: Decodable, Hashable {
    var nombre: String?
    var importe: Double?
}

struct MantenimientoFicha: Decodable, Hashable {
    var apartado: Double?
    var gastado: Double?
}

struct CostosFicha: Decodable, Hashable {
    var porKm: Double?
    var desglose: [DesgloseCosto]?
    var mantenimiento: MantenimientoFicha?
}

struct OdometroDireccion: Decodable, Hashable {
    var km: Double?
}

struct RendimientoDireccion: Decodable, Hashable {
    var usado: Double?
}

/// `GET vehicles/ficha/:id` para la vista de dirección: lo mismo que la web, con importes.
struct FichaDireccion: Decodable {
    var odometro: OdometroDireccion?
    var rendimiento: RendimientoDireccion?
    var cargas: [CargaDireccion] = []
    var viajes: [ViajeFicha] = []
    var servicios: [ServicioFicha] = []
    var proximoServicio: ProximoServicioFicha?
    var costos: CostosFicha?

    private enum CodingKeys: String, CodingKey {
        case odometro, rendimiento, cargas, viajes, servicios, proximoServicio, costos
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        odometro = try? c.decode(OdometroDireccion.self, forKey: .odometro)
        rendimiento = try? c.decode(RendimientoDireccion.self, forKey: .rendimiento)
        cargas = (try? c.decode([CargaDireccion].self, forKey: .cargas)) ?? []
        viajes = (try? c.decode([ViajeFicha].self, forKey: .viajes)) ?? []
        servicios = (try? c.decode([ServicioFicha].self, forKey: .servicios)) ?? []
        proximoServicio = try? c.decode(ProximoServicioFicha.self, forKey: .proximoServicio)
        costos = try? c.decode(CostosFicha.self, forKey: .costos)
    }
}

private struct FlotillaLista: Decodable {
    var vehiculos: [VehiculoFlota] = []
}

// MARK: - A qué ruta va el check list

/// Salida o devolución, de una solicitud aprobada o del inventario. Las cuatro
/// rutas piden exactamente el mismo multipart.
enum ChecklistVehiculoAccion: Hashable {
    case salida(asignacion: Int, inventario: Bool)
    case devolucion(asignacion: Int, inventario: Bool)

    init(salida: Bool, asignacion: AsignacionActiva) {
        if salida {
            self = .salida(asignacion: asignacion.id, inventario: asignacion.esInventario)
        } else {
            self = .devolucion(asignacion: asignacion.id, inventario: asignacion.esInventario)
        }
    }

    var path: String {
        switch self {
        case .salida(let id, let inventario):
            return inventario ? "vehicles/inventory/\(id)/checkout" : "vehicles/\(id)/start-use"
        case .devolucion(let id, let inventario):
            return inventario ? "vehicles/inventory/\(id)/return" : "vehicles/\(id)/end-use"
        }
    }

    var esSalida: Bool {
        if case .salida = self { return true }
        return false
    }

    var titulo: String { esSalida ? "Salida" : "Regreso" }
}

// MARK: - Repositorio

final class VehiculosRepository {
    static let shared = VehiculosRepository()
    private let api = ApiClient.shared
    private init() {}

    /// `GET vehicles/mis-vehiculos`.
    func misVehiculos() async throws -> MisVehiculosResponse {
        let data = try await api.get("vehicles/mis-vehiculos")
        do {
            return try JSONDecoder().decode(MisVehiculosResponse.self, from: data)
        } catch {
            throw ApiError.decoding(error)
        }
    }

    /// `POST vehicles` — pide un vehículo para una actividad.
    func solicitar(
        actividadId: Int,
        vehicleId: Int,
        motivoUso: String,
        fechaInicioSolicitada: Date,
        fechaFinSolicitada: Date
    ) async throws {
        struct Body: Encodable {
            let actividadId: Int
            let vehicleId: Int
            let motivoUso: String
            let fechaInicioSolicitada: String
            let fechaFinSolicitada: String
        }
        let body = Body(
            actividadId: actividadId,
            vehicleId: vehicleId,
            motivoUso: motivoUso,
            fechaInicioSolicitada: CoreFormat.isoString(fechaInicioSolicitada),
            fechaFinSolicitada: CoreFormat.isoString(fechaFinSolicitada)
        )
        let data = try await api.postJSON("vehicles", body: body)
        if CoreRepository.isQueuedOffline(data) { throw CoreError.queuedOffline }
    }

    /// `GET vehicles`: las solicitudes que este usuario alcanza a ver. La lista completa;
    /// lo que está por decidir lo separa `FlotillaRules.porAprobar`.
    func solicitudes() async throws -> [SolicitudPorAprobar] {
        let data = try await api.get("vehicles")
        return try ApiClient.decodeList(data)
    }

    /// `PATCH vehicles/:id/approve`. Solo con señal: el servidor revisa si la solicitud sigue
    /// abierta y si a esta persona le toca el paso; su 403 se enseña tal cual.
    func decidirSolicitud(id: Int, aprobar: Bool, nota: String?) async throws {
        struct Body: Encodable {
            let action: String
            let note: String?
        }
        try await CoreRepository.requireOnline()
        let limpia = nota?.trimmingCharacters(in: .whitespacesAndNewlines)
        let data = try await api.patchJSON(
            "vehicles/\(id)/approve",
            body: Body(action: aprobar ? "approve" : "reject", note: (limpia?.isEmpty ?? true) ? nil : limpia)
        )
        if CoreRepository.isQueuedOffline(data) { throw CoreError.queuedOffline }
    }

    /// `POST vehicles/inventory` (`vehicles.inventory`): solo el nombre es obligatorio.
    func darDeAltaUnidad(nombre: String, placas: String?, notas: String?) async throws {
        struct Body: Encodable {
            let nombre: String
            let placas: String?
            let notas: String?
        }
        try await CoreRepository.requireOnline()
        let data = try await api.postJSON(
            "vehicles/inventory",
            body: Body(
                nombre: nombre.trimmingCharacters(in: .whitespacesAndNewlines),
                placas: placas?.nilSiVacio,
                notas: notas?.nilSiVacio
            )
        )
        if CoreRepository.isQueuedOffline(data) { throw CoreError.queuedOffline }
    }

    /// `GET vehicles/flotilla`: toda la flota, con quién trae cada vehículo.
    func flotilla() async throws -> [VehiculoFlota] {
        let data = try await api.get("vehicles/flotilla")
        do {
            return try JSONDecoder().decode(FlotillaLista.self, from: data).vehiculos
        } catch {
            throw ApiError.decoding(error)
        }
    }

    /// `GET vehicles/ficha/flotilla?mes=2026-11`.
    func flotillaMes(_ mes: String) async throws -> FlotillaMes {
        let data = try await api.get("vehicles/ficha/flotilla", query: ["mes": mes])
        do {
            return try JSONDecoder().decode(FlotillaMes.self, from: data)
        } catch {
            throw ApiError.decoding(error)
        }
    }

    func fichaDireccion(vehicleId: Int) async throws -> FichaDireccion {
        let data = try await api.get("vehicles/ficha/\(vehicleId)")
        do {
            return try JSONDecoder().decode(FichaDireccion.self, from: data)
        } catch {
            throw ApiError.decoding(error)
        }
    }

    /// `GET vehicles/ficha/:id`.
    func ficha(vehicleId: Int) async throws -> FichaVehiculo {
        let data = try await api.get("vehicles/ficha/\(vehicleId)")
        do {
            return try JSONDecoder().decode(FichaVehiculo.self, from: data)
        } catch {
            throw ApiError.decoding(error)
        }
    }

    /// Lee km y gasolina de la foto. Lo lee el servidor: la app nunca habla con la IA.
    /// `odometroPrevio`: el servidor descarta una lectura menor, porque un odómetro no retrocede.
    func leerTablero(foto: CapturedGeoPhoto, odometroPrevio: Int?) async throws -> TableroLeido {
        var campos = ["tipo": "TABLERO"]
        if let odometroPrevio { campos["odometroPrevio"] = String(odometroPrevio) }
        let data = try await leerFoto(campos: campos, foto: foto)
        do {
            return try JSONDecoder().decode(TableroLeido.self, from: data)
        } catch {
            throw ApiError.decoding(error)
        }
    }

    func leerTicket(foto: CapturedGeoPhoto) async throws -> TicketLeido {
        let data = try await leerFoto(campos: ["tipo": "TICKET"], foto: foto)
        do {
            return try JSONDecoder().decode(TicketLeido.self, from: data)
        } catch {
            throw ApiError.decoding(error)
        }
    }

    private func leerFoto(campos: [String: String], foto: CapturedGeoPhoto) async throws -> Data {
        try await CoreRepository.requireOnline()
        return try await api.uploadMultipartFiles(
            "vehicles/ficha/leer-foto",
            fields: campos,
            files: [(field: "foto", data: foto.jpeg, fileName: "foto.jpg", mimeType: "image/jpeg")]
        )
    }

    /// `POST vehicles/ficha/:id/cargas`. Las dos fotos son opcionales para el servidor. Igual que
    /// el check list, no va a la cola sin conexión: el cuerpo es binario.
    func registrarCarga(
        vehicleId: Int,
        odometro: Int,
        litros: Double,
        importe: Double,
        tanqueLleno: Bool,
        ticket: CapturedGeoPhoto?,
        tablero: CapturedGeoPhoto?
    ) async throws {
        try await CoreRepository.requireOnline()
        var files: [(field: String, data: Data, fileName: String, mimeType: String)] = []
        if let ticket {
            files.append((field: "ticket", data: ticket.jpeg, fileName: "ticket.jpg", mimeType: "image/jpeg"))
        }
        if let tablero {
            files.append((field: "tablero", data: tablero.jpeg, fileName: "tablero.jpg", mimeType: "image/jpeg"))
        }
        let data = try await api.uploadMultipartFiles(
            "vehicles/ficha/\(vehicleId)/cargas",
            fields: [
                "odometro": String(odometro),
                "litros": String(litros),
                "importe": String(importe),
                "tanqueLleno": tanqueLleno ? "true" : "false",
            ],
            files: files
        )
        if CoreRepository.isQueuedOffline(data) { throw CoreError.queuedOffline }
    }

    /// Check list de salida o devolución: las siete fotos, su `meta` y el tablero.
    ///
    /// No va a la cola sin conexión: el cuerpo es binario y la cola solo sabe
    /// reenviar texto, así que las fotos se perderían sin que nadie se entere.
    func enviarChecklist(
        path: String,
        fotos: [String: CapturedGeoPhoto],
        odometroKm: Int,
        combustible: String
    ) async throws {
        try await CoreRepository.requireOnline()

        var meta: [String: Any] = [:]
        for (field, photo) in fotos {
            var entry: [String: Any] = ["capturedAt": CoreFormat.isoString(photo.capturedAt)]
            if let coords = photo.coords {
                entry["lat"] = coords.latitude
                entry["lng"] = coords.longitude
            } else {
                entry["lat"] = NSNull()
                entry["lng"] = NSNull()
            }
            meta[field] = entry
        }
        let metaJson = (try? JSONSerialization.data(withJSONObject: meta, options: [.sortedKeys]))
            .flatMap { String(data: $0, encoding: .utf8) } ?? "{}"

        // Primero los siete slots en su orden de pantalla; después, por si acaso,
        // cualquier campo extra que traiga quien llame.
        var pendientes = fotos
        var files: [(field: String, data: Data, fileName: String, mimeType: String)] = []
        for slot in ChecklistVehiculoRules.slots {
            guard let photo = pendientes.removeValue(forKey: slot.field) else { continue }
            files.append((field: slot.field, data: photo.jpeg, fileName: "\(slot.field).jpg", mimeType: "image/jpeg"))
        }
        for field in pendientes.keys.sorted() {
            guard let photo = pendientes[field] else { continue }
            files.append((field: field, data: photo.jpeg, fileName: "\(field).jpg", mimeType: "image/jpeg"))
        }

        let data = try await api.uploadMultipartFiles(
            path,
            fields: [
                "meta": metaJson,
                "odometroKm": String(odometroKm),
                "combustible": combustible,
            ],
            files: files
        )
        if CoreRepository.isQueuedOffline(data) { throw CoreError.queuedOffline }
    }

    /// Misma llamada, con los tipos del check list en vez de cadenas sueltas.
    func enviarChecklist(
        accion: ChecklistVehiculoAccion,
        fotos: [SlotChecklist: CapturedGeoPhoto],
        odometroKm: Int,
        combustible: NivelCombustible
    ) async throws {
        var porCampo: [String: CapturedGeoPhoto] = [:]
        for (slot, photo) in fotos { porCampo[slot.field] = photo }
        try await enviarChecklist(
            path: accion.path,
            fotos: porCampo,
            odometroKm: odometroKm,
            combustible: combustible.apiValue
        )
    }
}
