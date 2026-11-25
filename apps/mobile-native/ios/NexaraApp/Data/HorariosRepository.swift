import Foundation

// Horarios por día y pago semanal — espejo de `HorariosRepository.kt` y `PagoSemanalRepository.kt`.
// Quién ve y quién cambia a quién lo decide el servidor (`puedeProgramar`, `puedeRegistrar`).
// Todo opcional: un campo que el servidor deje de mandar no tumba la pantalla.

// MARK: - Horarios

struct HorarioCitado: Decodable, Hashable {
    var horaEntrada: String?
    var horaSalida: String?
    var motivo: String?
}

struct DiaHorario: Decodable, Hashable {
    /// `AAAA-MM-DD`.
    var fecha: String?
    var horario: HorarioCitado?
    var programado: Bool?
    var trabaja: Bool?
    var extraMin: Int?
    var loPuso: String?
    /// `programar` · `extender` · `recortar`.
    var ajuste: String?
}

struct MiHorario: Decodable {
    var hoy: String?
    var entradaHoyAt: String?
    var dias: [DiaHorario]?
}

struct PersonaHorario: Decodable, Identifiable, Hashable {
    var id: Int
    var nombre: String?
    var puesto: String?
    var puedeProgramar: Bool?
    var entradaHoyAt: String?
    var dias: [DiaHorario]?
}

struct HorariosEquipo: Decodable {
    var hoy: String?
    var personas: [PersonaHorario]?
}

/// Leer puede salir de lo último guardado; cambiar el horario de alguien **no se encola**
/// (`ApiClient.isOnlineOnly`): llegaría tarde y ya no sería lo que el jefe decidió.
final class HorariosRepository {
    static let shared = HorariosRepository()

    private init() {}

    func mio(desde: String, hasta: String) async throws -> MiHorario {
        let data = try await ApiClient.shared.get("attendance/horarios/mio", query: ["from": desde, "to": hasta])
        return try JSONDecoder().decode(MiHorario.self, from: data)
    }

    func equipo(dia: String) async throws -> HorariosEquipo {
        let data = try await ApiClient.shared.get("attendance/horarios", query: ["from": dia, "to": dia])
        return try JSONDecoder().decode(HorariosEquipo.self, from: data)
    }

    func cambiarSalida(userId: Int, fecha: String, hasta: String, motivo: String, extender: Bool) async throws {
        struct Cuerpo: Encodable {
            let userId: Int
            let fecha: String
            let hasta: String
            let motivo: String?
        }
        try await CoreRepository.requireOnline()
        let limpio = motivo.trimmingCharacters(in: .whitespacesAndNewlines)
        let data = try await ApiClient.shared.postJSON(
            "attendance/horarios/" + (extender ? "extender" : "recortar"),
            body: Cuerpo(userId: userId, fecha: fecha, hasta: hasta, motivo: limpio.isEmpty ? nil : limpio)
        )
        if CoreRepository.isQueuedOffline(data) { throw CoreError.queuedOffline }
    }
}

// MARK: - Pago semanal

struct SaldoPago: Decodable, Hashable {
    var sugerido: Double?
    var ajustes: Double?
    var final: Double?
    var pagado: Double?
    var saldo: Double?
}

struct PagoFila: Decodable, Hashable, Identifiable {
    var userId: Int
    var nombre: String?
    var saldo: SaldoPago?
    /// `sin_monto` · `por_pagar` · `parcial` · `pagado`.
    var estado: String?

    var id: Int { userId }
}

struct PagoSemana: Decodable {
    var montosOcultos: Bool?
    var puedeRegistrar: Bool?
    var filas: [PagoFila]?
    var totales: SaldoPago?
}

struct RenglonPago: Decodable, Hashable {
    var titulo: String?
    var monto: Double?
    var detalle: String?
}

struct MovimientoPago: Decodable, Hashable {
    var id: String?
    /// `ajuste` · `pago`.
    var tipo: String?
    var monto: Double?
    var motivo: String?
    var forma: String?
    var fecha: String?
    var autorNombre: String?
}

struct PagoDetalle: Decodable {
    var puedeRegistrar: Bool?
    var saldo: SaldoPago?
    var extraPendienteMin: Int?
    var comoSeCalculo: [RenglonPago]?
    var movimientos: [MovimientoPago]?
}

/// Mueve dinero: solo con señal, también para leer. Un saldo viejo haría pagar dos veces.
final class PagoSemanalRepository {
    static let shared = PagoSemanalRepository()

    private init() {}

    private let base = "employee-payments/control-semanal"

    func semana(_ lunes: String) async throws -> PagoSemana {
        try await CoreRepository.requireOnline()
        let data = try await ApiClient.shared.get(base + "/pago", query: ["semana": lunes])
        return try JSONDecoder().decode(PagoSemana.self, from: data)
    }

    func detalle(_ lunes: String, userId: Int) async throws -> PagoDetalle {
        try await CoreRepository.requireOnline()
        let data = try await ApiClient.shared.get(
            base + "/como-se-calculo",
            query: ["semana": lunes, "userId": String(userId)]
        )
        return try JSONDecoder().decode(PagoDetalle.self, from: data)
    }

    func registrar(
        lunes: String,
        userId: Int,
        centavos: Int,
        forma: String,
        fecha: String,
        comprobante: CapturedGeoPhoto?
    ) async throws {
        try await CoreRepository.requireOnline()
        var archivos: [(field: String, data: Data, fileName: String, mimeType: String)] = []
        if let comprobante {
            archivos.append((field: "comprobante", data: comprobante.jpeg, fileName: "comprobante.jpg", mimeType: "image/jpeg"))
        }
        let data = try await ApiClient.shared.uploadMultipartFiles(
            base + "/registrar-pago",
            fields: [
                "semana": lunes,
                "userId": String(userId),
                "monto": Dinero.textoApi(centavos),
                "forma": forma,
                "fecha": fecha,
            ],
            files: archivos
        )
        if CoreRepository.isQueuedOffline(data) { throw CoreError.queuedOffline }
    }
}
