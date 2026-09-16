import Foundation

/// Campos editables de `PATCH users/profile/me` (`users.controller.ts`).
/// Vacío = `null` en el API (`body.x || null`).
struct MyProfileFields: Encodable, Equatable {
    var telefono = ""
    var fechaNacimiento = ""
    var direccion = ""
    var colonia = ""
    var ciudad = ""
    var estado = ""
    var codigoPostal = ""
    var pais = "México"
    var curp = ""
    var rfc = ""
    var ineNumero = ""
    var nss = ""
    var contactoEmergenciaNombre = ""
    var contactoEmergenciaTelefono = ""

    /// «Perfil completo» de la web: 7 campos personales.
    var completeness: Int {
        let filled = [telefono, curp, rfc, nss, fechaNacimiento, ciudad, estado]
            .filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }.count
        return Int((Double(filled) / 7.0 * 100).rounded())
    }

    /// Barras de «Completitud del perfil».
    var sections: [(label: String, filled: Int, total: Int)] {
        func count(_ values: [String]) -> Int {
            values.filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }.count
        }
        return [
            ("Datos personales", count([telefono, fechaNacimiento, ciudad, estado]), 4),
            ("Documentos", count([curp, rfc, nss]), 3),
            ("Emergencia", count([contactoEmergenciaNombre, contactoEmergenciaTelefono]), 2),
        ]
    }
}

/// `GET users/profile/me`.
struct MyProfileSnapshot {
    var nombre: String
    var email: String
    var employeeNumber: String
    var roleName: String
    var departmentName: String
    var fields: MyProfileFields
}

/// `GET integra/identity/me` — vínculo con la persona del terminal ACS.
struct MyAcsIdentity {
    /// `linked` / `erp_only` / `acs_only` / `unlinked`.
    var status: String
    var employeeNumber: String
    var companyEmployeeNumber: String
    var personId: String
    var personName: String
    var howToLink: String
}

/// Primer renglón de `GET attendance/hybrid?date=` para el propio usuario.
struct MyHybridToday {
    var erpCheckIn: String
    var erpCheckOut: String
    var acsFirstAt: String
    var acsPasses: Int
    var acsFirstDoor: String
}

/// Mi perfil — mismas llamadas que `apps/web/app/(panels)/erp/my-profile/page.tsx`.
final class MyProfileRepository {
    static let shared = MyProfileRepository()
    private let api = ApiClient.shared
    private init() {}

    func load() async throws -> MyProfileSnapshot {
        let map = ConsoleHelpers.decodeMap(try await api.get("users/profile/me"))
        let perfil = map["perfil"] as? [String: Any] ?? [:]
        func s(_ key: String) -> String { ConsoleHelpers.mapStr(perfil, key) }
        var fields = MyProfileFields()
        fields.telefono = s("telefono")
        fields.fechaNacimiento = String(s("fechaNacimiento").prefix(10))
        fields.direccion = s("direccion")
        fields.colonia = s("colonia")
        fields.ciudad = s("ciudad")
        fields.estado = s("estado")
        fields.codigoPostal = s("codigoPostal")
        fields.pais = s("pais").isEmpty ? "México" : s("pais")
        fields.curp = s("curp")
        fields.rfc = s("rfc")
        fields.ineNumero = s("ineNumero")
        fields.nss = s("nss")
        fields.contactoEmergenciaNombre = s("contactoEmergenciaNombre")
        fields.contactoEmergenciaTelefono = s("contactoEmergenciaTelefono")
        return MyProfileSnapshot(
            nombre: ConsoleHelpers.mapStr(map, "nombre"),
            email: ConsoleHelpers.mapStr(map, "email"),
            employeeNumber: ConsoleHelpers.mapStr(map, "employeeNumber"),
            roleName: ConsoleHelpers.mapStr(map["role"] as? [String: Any] ?? [:], "nombre"),
            departmentName: ConsoleHelpers.mapStr(map["department"] as? [String: Any] ?? [:], "nombre"),
            fields: fields
        )
    }

    /// `true` si el API lo guardó; `false` si quedó en la cola offline.
    func save(_ fields: MyProfileFields) async throws -> Bool {
        let data = try await api.patchJSON("users/profile/me", body: fields)
        return !CoreRepository.isQueuedOffline(data)
    }

    /// Como la web: si Integra no responde, la sección dice «Sin vínculo ACS».
    func identity() async -> MyAcsIdentity? {
        guard let data = try? await api.get("integra/identity/me") else { return nil }
        let map = ConsoleHelpers.decodeMap(data)
        guard !map.isEmpty else { return nil }
        let user = map["user"] as? [String: Any] ?? [:]
        let person = map["acsPerson"] as? [String: Any] ?? [:]
        return MyAcsIdentity(
            status: ConsoleHelpers.mapStr(map, "status"),
            employeeNumber: ConsoleHelpers.mapStr(user, "employeeNumber"),
            companyEmployeeNumber: ConsoleHelpers.mapStr(user, "companyEmployeeNumber"),
            personId: ConsoleHelpers.mapStr(person, "personId"),
            personName: ConsoleHelpers.mapStr(person, "personName"),
            howToLink: ConsoleHelpers.mapStr(map, "howToLink")
        )
    }

    /// `GET attendance/hybrid?date=YYYY-MM-DD` con la fecha local de hoy.
    func hybridToday() async -> MyHybridToday? {
        let fmt = DateFormatter()
        fmt.calendar = Calendar(identifier: .gregorian)
        fmt.locale = Locale(identifier: "en_US_POSIX")
        fmt.timeZone = .current
        fmt.dateFormat = "yyyy-MM-dd"
        guard let data = try? await api.get("attendance/hybrid", query: ["date": fmt.string(from: Date())]) else {
            return nil
        }
        let map = ConsoleHelpers.decodeMap(data)
        guard let row = (map["items"] as? [[String: Any]])?.first else {
            return MyHybridToday(erpCheckIn: "", erpCheckOut: "", acsFirstAt: "", acsPasses: 0, acsFirstDoor: "")
        }
        let erp = row["erp"] as? [String: Any] ?? [:]
        let acs = row["acs"] as? [String: Any] ?? [:]
        return MyHybridToday(
            erpCheckIn: ConsoleHelpers.mapStr(erp, "checkIn"),
            erpCheckOut: ConsoleHelpers.mapStr(erp, "checkOut"),
            acsFirstAt: ConsoleHelpers.mapStr(acs, "firstAt"),
            acsPasses: ConsoleHelpers.mapInt(acs, "passes"),
            acsFirstDoor: ConsoleHelpers.mapStr(acs, "firstDoor")
        )
    }
}
