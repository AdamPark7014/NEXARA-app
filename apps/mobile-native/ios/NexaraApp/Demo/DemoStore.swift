import Foundation

typealias DemoJSON = [String: Any]

/// Evita el «heterogeneous collection literal» de Swift: un diccionario escrito como
/// argumento de esta función ya tiene tipo `[String: Any]`.
@inline(__always)
func dj(_ value: DemoJSON) -> DemoJSON { value }

/// Evidencia de una actividad (lo que sube quien la ejecuta).
struct DemoEvidenceState {
    var status = "ENTRY_PHOTO"
    var entryPhoto = ""
    var entryAt: Date?
    var photos: [String] = []
    var photosAt: Date?
    var sheet: [String: String] = [:]
    var sheetAt: Date?
    var exitPhoto = ""
    var exitAt: Date?
    /// Vacío · `APPROVED` · `REJECTED`
    var reviewStatus = ""
    var reviewNotes = ""
    var rejectedSteps: [String] = []
}

/// Revisión de una evidencia por su superior.
struct DemoReview {
    var decision: String
    var notes: String
    var rating: Int
    var at: Date
    var steps: [String]
}

/// Estado en memoria del modo demostración. Todo lo que el usuario «hace» en la demo
/// (checar, mandar un mensaje, iniciar una actividad, aprobar un viático) se guarda aquí y
/// se ve en las siguientes lecturas; se borra al salir del demo. Nada llega a un servidor.
///
/// Es una clase con candado (no un actor) para poder reiniciarse desde código síncrono
/// (`DemoMode.activate`) y para que `DemoBackend.handle` resuelva cada petición de una
/// sola vez, sin puntos de suspensión a medias.
final class DemoStore: @unchecked Sendable {
    static let shared = DemoStore()

    let lock = NSLock()

    /// Instante de entrada al demo: las horas de los datos son relativas a él.
    var epoch = Date()

    // Asistencia propia
    var myEntry: Date?
    var myExit: Date?
    var myEntryPhoto = ""
    var myExitPhoto = ""
    var gpsConsent = false

    // Comida propia
    var lunchOut: Date?
    var lunchIn: Date?
    var lunchOutPhoto = ""
    var lunchInPhoto = ""
    var lunchReviews: [Int: String] = [:]

    // Actividades
    var startedAt: [Int: Date] = [:]
    var openOrder: [Int] = DemoData.myOpenIds
    var reorderNote: [Int: String] = [:]
    var evidence: [Int: DemoEvidenceState] = [:]
    var reviews: [String: DemoReview] = [:]
    var extraActivities: [DemoActivity] = []
    var nextActivityId = 5200
    /// Reloj por sesiones: pausas abiertas y desde cuándo corre cada reloj reanudado.
    var pausas: [Int: DemoPausa] = [:]
    var sesionDesde: [Int: Date] = [:]

    // Escáner de almacén y herramientas
    var stockAjustes: [Int: Double] = [:]
    var stockAltas: [String: DemoJSON] = [:]
    var prestamosHerramienta: [Int: String] = [:]

    // Chat
    var messageDates: [Int: Date] = [:]
    var messages: [Int: [DemoJSON]] = [:]
    var channelUnread: [Int: Int] = [:]
    var channelTopic: [Int: String] = [:]
    var channelMuted: Set<Int> = []
    var extraChannels: [DemoChannelSeed] = []
    var removedChannels: Set<Int> = []
    var nextMessageId = 8000
    var nextChannelId = 300

    // Notificaciones
    var notifRead: Set<Int> = []
    var notifRemoved: Set<Int> = []

    // Viáticos
    var viaticos: [DemoJSON] = []
    var nextViaticoId = 9000

    // Clientes
    var extraClients: [DemoClient] = []
    var nextClientId = 3200

    // Vehículos
    var vehicleAssigned = true
    var vehicleRequests: [DemoJSON] = []

    // Perfil
    var profileFields: [String: String] = DemoStore.defaultProfileFields

    private init() {
        seed()
    }

    /// Vuelve a empezar: datos frescos y un nuevo instante de referencia.
    func reset() {
        lock.lock()
        defer { lock.unlock() }
        seed()
    }

    /// Solo se llama con el candado tomado (o desde `init`).
    private func seed() {
        epoch = Date()
        myEntry = nil
        myExit = nil
        myEntryPhoto = ""
        myExitPhoto = ""
        gpsConsent = false
        lunchOut = nil
        lunchIn = nil
        lunchOutPhoto = ""
        lunchInPhoto = ""
        lunchReviews = [:]
        startedAt = [:]
        openOrder = DemoData.myOpenIds
        reorderNote = [:]
        evidence = [:]
        reviews = [:]
        extraActivities = []
        nextActivityId = 5200
        pausas = [:]
        sesionDesde = [:]
        stockAjustes = [:]
        stockAltas = [:]
        prestamosHerramienta = [:]
        messages = [:]
        channelUnread = [:]
        channelTopic = [:]
        channelMuted = []
        extraChannels = []
        removedChannels = []
        nextMessageId = 8000
        nextChannelId = 300
        notifRead = []
        notifRemoved = []
        viaticos = []
        nextViaticoId = 9000
        extraClients = []
        nextClientId = 3200
        vehicleAssigned = true
        vehicleRequests = []
        profileFields = DemoStore.defaultProfileFields
        messageDates = [:]

        for channel in DemoData.chatChannels {
            channelUnread[channel.id] = channel.unread
            var seeded: [DemoJSON] = []
            for message in DemoData.chatSeed(channel.id) {
                seeded.append(chatMessage(seed: message, channelId: channel.id))
            }
            messages[channel.id] = seeded
        }
        seedReactions()
        viaticos = seedViaticos()
    }

    // MARK: Utilidades de tiempo (relativas al epoch)

    /// Instante `minutes` minutos respecto a la entrada al demo (negativo = pasado).
    func at(_ minutes: Int) -> Date {
        epoch.addingTimeInterval(TimeInterval(minutes) * 60)
    }

    func iso(_ minutes: Int) -> String {
        DemoClock.iso(at(minutes))
    }

    func isoOrNull(_ minutes: Int?) -> Any {
        if let minutes { return iso(minutes) }
        return NSNull()
    }

    func isoOrNull(_ date: Date?) -> Any {
        if let date { return DemoClock.iso(date) }
        return NSNull()
    }

    /// Minutos transcurridos desde la entrada al demo.
    func elapsedMinutes(now: Date) -> Int {
        DemoClock.minutes(from: epoch, to: now)
    }

    /// Hora de checada de un compañero HOY: nunca antes de las 00:01 ni después de «hace medio minuto».
    func todayTime(minutesAgo: Int) -> Date {
        let startOfDay = Calendar.current.startOfDay(for: epoch)
        let wanted = epoch.addingTimeInterval(-TimeInterval(minutesAgo) * 60)
        let earliest = startOfDay.addingTimeInterval(120)
        let latest = epoch.addingTimeInterval(-30)
        return min(max(wanted, earliest), max(latest, earliest))
    }
}
