import Foundation

// Datos ficticios del modo demostración. Todo es inventado: personas, clientes, obras,
// conversaciones y montos. Las mismas diez personas y los mismos clientes salen en TODAS
// las pantallas (pizarra, asistencias, chat, viáticos, proyectos…), para que la app se
// vea como una operación real y coherente.
//
// Las horas NO viven aquí: se guardan como minutos relativos al instante en que se
// entró al demo (`startMin: -95` = «hace 95 minutos») y `DemoFixtures` las convierte.

struct DemoPerson {
    let id: Int
    let nombre: String
    let email: String
    let puesto: String
    let departamento: String
    let managerId: Int?

    var primerNombre: String { nombre.split(separator: " ").first.map(String.init) ?? nombre }
    /// «Mariana López»: nombre y primer apellido.
    var corto: String { nombre.split(separator: " ").prefix(2).joined(separator: " ") }
}

/// Cliente del padrón (`ventas/clientes`) y su cliente de servicio ligado.
struct DemoClient {
    let id: Int
    let serviceId: Int
    let name: String
    let legalName: String
    let taxId: String
    let sectors: [String]
    let ownerId: Int?
    let city: String
}

struct DemoProject {
    let id: Int
    let title: String
    let clientServiceId: Int
    let status: String
}

/// Actividad de la operación. Los minutos son relativos al instante de entrada al demo.
struct DemoActivity {
    let id: Int
    let folio: String
    let titulo: String
    let kind: String
    let clientServiceId: Int
    let projectId: Int?
    let ownerId: Int
    let creatorId: Int
    let prioridad: String
    /// `Asignada` · `En Proceso` · `Por Validar` · `Finalizada`
    let estatus: String
    let startMin: Int
    let maxMin: Int
    let finMin: Int?
    let avance: Int
    /// Paso de evidencia en que va: `ENTRY_PHOTO`, `EVIDENCE_PHOTOS`, `SERVICE_SHEET_DATA`,
    /// `EXIT_PHOTO`, `COMPLETED` o vacío si nadie ha empezado.
    let evidencia: String
    let indicaciones: String
    let estimadoMin: Int
    let descripcion: String
}

enum DemoData {
    // MARK: Personas

    static let people: [DemoPerson] = [
        DemoPerson(id: 1, nombre: "Valeria Montes Rivera", email: "valeria.montes@aurora.example",
                   puesto: "Directora de Operaciones", departamento: "Operaciones", managerId: nil),
        DemoPerson(id: 101, nombre: "Mariana López Herrera", email: "mariana.lopez@aurora.example",
                   puesto: "Coordinadora de Proyectos", departamento: "Proyectos", managerId: 1),
        DemoPerson(id: 102, nombre: "Diego Ramírez Soto", email: "diego.ramirez@aurora.example",
                   puesto: "Ingeniero de Campo", departamento: "Ingeniería", managerId: 101),
        DemoPerson(id: 103, nombre: "Fernanda Cruz Molina", email: "fernanda.cruz@aurora.example",
                   puesto: "Ingeniera de Soporte", departamento: "Ingeniería", managerId: 1),
        DemoPerson(id: 104, nombre: "Javier Morales Ortega", email: "javier.morales@aurora.example",
                   puesto: "Técnico Instalador", departamento: "Operaciones", managerId: 101),
        DemoPerson(id: 105, nombre: "Sofía Martínez Ruiz", email: "sofia.martinez@aurora.example",
                   puesto: "Diseñadora de Proyectos", departamento: "Diseño", managerId: 101),
        DemoPerson(id: 106, nombre: "Ricardo Hernández Vega", email: "ricardo.hernandez@aurora.example",
                   puesto: "Técnico de Servicio", departamento: "Operaciones", managerId: 103),
        DemoPerson(id: 107, nombre: "Paola Jiménez Castro", email: "paola.jimenez@aurora.example",
                   puesto: "Coordinadora Administrativa", departamento: "Administración", managerId: 1),
        DemoPerson(id: 108, nombre: "Luis Fernando Torres", email: "luis.torres@aurora.example",
                   puesto: "Ingeniero de Redes", departamento: "Ingeniería", managerId: 103),
        DemoPerson(id: 109, nombre: "Andrea Salgado Núñez", email: "andrea.salgado@aurora.example",
                   puesto: "Encargada de Almacén", departamento: "Administración", managerId: 107),
    ]

    static var me: DemoPerson { people[0] }
    /// El equipo: todos menos yo.
    static var team: [DemoPerson] { Array(people.dropFirst()) }

    static func person(_ id: Int) -> DemoPerson {
        people.first { $0.id == id } ?? people[0]
    }

    // MARK: Permisos y navegación de la sesión ficticia

    static let permissions: [String] = [
        "activities.view", "activities.manage", "activities.create",
        "evidences.view", "evidences.review",
        "attendance.view", "attendance.manage",
        "lunch_breaks.view", "lunch_breaks.review",
        "gps.manage", "chat.view", "clients.view", "clients.manage",
        "users.view", "documents.view", "viatics.manage",
    ]

    /// Claves de `GET me/navigation`: las cinco pestañas y todos los módulos de «Más».
    static var navModules: [String] {
        var keys = Set<String>()
        for module in CoreModule.allCases { keys.formUnion(module.navigationKeys) }
        for extra in CoreExtraModule.allCases { keys.formUnion(extra.claves) }
        return keys.sorted()
    }

    // MARK: Clientes y proyectos

    static let clients: [DemoClient] = [
        DemoClient(id: 3101, serviceId: 4101, name: "Corporativo Atlixco",
                   legalName: "Corporativo Atlixco S.A. de C.V.", taxId: "DEM010101AB1",
                   sectors: ["PROYECTO", "CORPORATIVO"], ownerId: 101, city: "Puebla, Pue."),
        DemoClient(id: 3102, serviceId: 4102, name: "Hotel Casa Azul",
                   legalName: "Operadora Hotelera Casa Azul S.A. de C.V.", taxId: "DEM020202CD2",
                   sectors: ["PROYECTO", "COMERCIAL"], ownerId: 102, city: "Cholula, Pue."),
        DemoClient(id: 3103, serviceId: 4103, name: "Colegio Montebello",
                   legalName: "Educación Montebello A.C.", taxId: "DEM030303EF3",
                   sectors: ["PROYECTO"], ownerId: 105, city: "Puebla, Pue."),
        DemoClient(id: 3104, serviceId: 4104, name: "Grupo Textil del Valle",
                   legalName: "Textiles del Valle de Puebla S.A. de C.V.", taxId: "DEM040404GH4",
                   sectors: ["PROYECTO", "CORPORATIVO"], ownerId: 108, city: "Tehuacán, Pue."),
        DemoClient(id: 3105, serviceId: 4105, name: "Parque Industrial San José",
                   legalName: "Desarrollos Industriales San José S.A.P.I.", taxId: "DEM050505IJ5",
                   sectors: ["CORPORATIVO"], ownerId: nil, city: "Huejotzingo, Pue."),
        DemoClient(id: 3106, serviceId: 4106, name: "Clínica Santa Elena",
                   legalName: "Servicios Médicos Santa Elena S.C.", taxId: "DEM060606KL6",
                   sectors: ["COMERCIAL"], ownerId: 107, city: "Puebla, Pue."),
    ]

    static func client(serviceId: Int) -> DemoClient? {
        clients.first { $0.serviceId == serviceId }
    }

    static let projects: [DemoProject] = [
        DemoProject(id: 7001, title: "Modernización eléctrica · Torre A", clientServiceId: 4101, status: "ACTIVE"),
        DemoProject(id: 7002, title: "Remodelación del lobby", clientServiceId: 4102, status: "ACTIVE"),
        DemoProject(id: 7003, title: "Ampliación de aulas · Fase 2", clientServiceId: 4103, status: "ACTIVE"),
        DemoProject(id: 7004, title: "Cableado de planta textil", clientServiceId: 4104, status: "COMPLETED"),
        DemoProject(id: 7005, title: "Nave de almacenaje · Etapa 1", clientServiceId: 4105, status: "ACTIVE"),
    ]

    // MARK: Actividades

    static let activities: [DemoActivity] = [
        DemoActivity(id: 5142, folio: "AN-0142", titulo: "Instalación de tablero eléctrico · Corporativo Atlixco",
                     kind: "obra", clientServiceId: 4101, projectId: 7001, ownerId: 101, creatorId: 1,
                     prioridad: "alta", estatus: "En Proceso", startMin: -140, maxMin: 180, finMin: nil,
                     avance: 65, evidencia: "EVIDENCE_PHOTOS",
                     indicaciones: "Tomar fotos de cada circuito conectado y del tablero terminado.",
                     estimadoMin: 300, descripcion: "Montaje y conexión del tablero principal de la Torre A."),
        DemoActivity(id: 5143, folio: "AN-0143", titulo: "Mantenimiento preventivo de clima · Hotel Casa Azul",
                     kind: "servicio", clientServiceId: 4102, projectId: nil, ownerId: 102, creatorId: 1,
                     prioridad: "media", estatus: "En Proceso", startMin: -95, maxMin: 120, finMin: nil,
                     avance: 40, evidencia: "EVIDENCE_PHOTOS",
                     indicaciones: "Revisar filtros y presión de gas en las 12 habitaciones del piso 3.",
                     estimadoMin: 210, descripcion: "Servicio mensual de aires acondicionados."),
        DemoActivity(id: 5144, folio: "AN-0144", titulo: "Soporte remoto de red · Parque Industrial San José",
                     kind: "servicio", clientServiceId: 4105, projectId: nil, ownerId: 103, creatorId: 1,
                     prioridad: "media", estatus: "Por Validar", startMin: -230, maxMin: -20, finMin: -40,
                     avance: 100, evidencia: "COMPLETED",
                     indicaciones: "Diagnosticar la intermitencia del enlace y dejar reporte.",
                     estimadoMin: 120, descripcion: "Falla intermitente en el enlace de la caseta de vigilancia."),
        DemoActivity(id: 5145, folio: "AN-0145", titulo: "Cableado estructurado · Bodega Norte",
                     kind: "obra", clientServiceId: 4104, projectId: 7004, ownerId: 104, creatorId: 101,
                     prioridad: "alta", estatus: "En Proceso", startMin: -230, maxMin: -45, finMin: nil,
                     avance: 80, evidencia: "SERVICE_SHEET_DATA",
                     indicaciones: "Etiquetar cada salida y probar continuidad de los 24 puntos.",
                     estimadoMin: 240, descripcion: "Tendido y certificación de 24 puntos de red."),
        DemoActivity(id: 5146, folio: "AN-0146", titulo: "Levantamiento de sitio · Colegio Montebello",
                     kind: "proyecto", clientServiceId: 4103, projectId: 7003, ownerId: 105, creatorId: 101,
                     prioridad: "media", estatus: "En Proceso", startMin: -55, maxMin: 240, finMin: nil,
                     avance: 25, evidencia: "EVIDENCE_PHOTOS",
                     indicaciones: "Medir aulas nuevas y fotografiar accesos y ductos.",
                     estimadoMin: 180, descripcion: "Levantamiento previo a la ampliación de aulas."),
        DemoActivity(id: 5147, folio: "AN-0147", titulo: "Alta de expediente · Colegio Montebello",
                     kind: "tarea", clientServiceId: 4103, projectId: nil, ownerId: 107, creatorId: 1,
                     prioridad: "baja", estatus: "Por Validar", startMin: -200, maxMin: 60, finMin: -75,
                     avance: 100, evidencia: "COMPLETED",
                     indicaciones: "Capturar contrato, garantías y contactos del cliente.",
                     estimadoMin: 90, descripcion: "Captura administrativa del nuevo cliente."),
        DemoActivity(id: 5148, folio: "AN-0148", titulo: "Configuración de red y NVR · Grupo Textil del Valle",
                     kind: "proyecto", clientServiceId: 4104, projectId: 7004, ownerId: 108, creatorId: 103,
                     prioridad: "media", estatus: "En Proceso", startMin: -65, maxMin: 300, finMin: nil,
                     avance: 50, evidencia: "SERVICE_SHEET_DATA",
                     indicaciones: "Configurar VLAN de cámaras y respaldar la configuración.",
                     estimadoMin: 200, descripcion: "Puesta en marcha del NVR de la planta."),
        DemoActivity(id: 5149, folio: "AN-0149", titulo: "Inventario mensual de almacén",
                     kind: "tarea", clientServiceId: 0, projectId: nil, ownerId: 109, creatorId: 107,
                     prioridad: "baja", estatus: "En Proceso", startMin: -40, maxMin: 200, finMin: nil,
                     avance: 60, evidencia: "EVIDENCE_PHOTOS",
                     indicaciones: "Contar existencias por pasillo y reportar diferencias.",
                     estimadoMin: 150, descripcion: "Conteo cíclico de materiales y herramienta."),
        // Comercial: trae «Archivos de evidencia» (`DemoFixtures+Adjuntos`).
        DemoActivity(id: 5155, folio: "AN-0155", titulo: "Presentación de propuesta · Hotel Casa Azul",
                     kind: "comercial", clientServiceId: 4102, projectId: nil, ownerId: 101, creatorId: 1,
                     prioridad: "alta", estatus: "Asignada", startMin: 90, maxMin: 210, finMin: nil,
                     avance: 0, evidencia: "",
                     indicaciones: "Presentar la póliza anual de climas y dejar firmada la minuta.",
                     estimadoMin: 90, descripcion: "Propuesta de mantenimiento anual para el hotel."),
        // Las mías (id 1): las que se ven en «Mis actividades».
        DemoActivity(id: 5150, folio: "AN-0150", titulo: "Visita de supervisión · Corporativo Atlixco",
                     kind: "proyecto", clientServiceId: 4101, projectId: 7001, ownerId: 1, creatorId: 1,
                     prioridad: "alta", estatus: "Asignada", startMin: 15, maxMin: 240, finMin: nil,
                     avance: 0, evidencia: "",
                     indicaciones: "Revisar el avance del tablero con Mariana y tomar fotos de cada punto.",
                     estimadoMin: 90, descripcion: "Recorrido de supervisión de la obra eléctrica."),
        DemoActivity(id: 5151, folio: "AN-0151", titulo: "Junta de seguimiento · Hotel Casa Azul",
                     kind: "tarea", clientServiceId: 4102, projectId: nil, ownerId: 1, creatorId: 1,
                     prioridad: "media", estatus: "Asignada", startMin: 200, maxMin: 320, finMin: nil,
                     avance: 0, evidencia: "",
                     indicaciones: "Presentar el avance del mantenimiento y acordar la siguiente visita.",
                     estimadoMin: 60, descripcion: "Reunión con la gerencia del hotel."),
        DemoActivity(id: 5152, folio: "AN-0152", titulo: "Revisión de presupuesto trimestral",
                     kind: "tarea", clientServiceId: 0, projectId: nil, ownerId: 1, creatorId: 1,
                     prioridad: "baja", estatus: "Asignada", startMin: 330, maxMin: 480, finMin: nil,
                     avance: 0, evidencia: "",
                     indicaciones: "Validar con Administración las partidas de obra del trimestre.",
                     estimadoMin: 75, descripcion: "Cierre presupuestal del trimestre."),
        DemoActivity(id: 5153, folio: "AN-0153", titulo: "Reporte semanal de indicadores",
                     kind: "tarea", clientServiceId: 0, projectId: nil, ownerId: 1, creatorId: 1,
                     prioridad: "media", estatus: "Finalizada", startMin: -300, maxMin: -150, finMin: -120,
                     avance: 100, evidencia: "COMPLETED",
                     indicaciones: "Consolidar asistencia, actividades y viáticos de la semana.",
                     estimadoMin: 60, descripcion: "Indicadores de la operación."),
        DemoActivity(id: 5154, folio: "AN-0154", titulo: "Instalación de luminarias · Bodega Norte",
                     kind: "obra", clientServiceId: 4104, projectId: 7004, ownerId: 1, creatorId: 1,
                     prioridad: "media", estatus: "En Proceso", startMin: -120, maxMin: 260, finMin: nil,
                     avance: 35, evidencia: "EVIDENCE_PHOTOS",
                     indicaciones: "Repartir al equipo de instalación y dar seguimiento.",
                     estimadoMin: 240, descripcion: "Cambio de luminarias por LED en la bodega."),
    ]

    static func activity(_ id: Int) -> DemoActivity? {
        activities.first { $0.id == id }
    }

    /// Actividades mías que aparecen abiertas en «Mis actividades», en el orden de la cola.
    static let myOpenIds: [Int] = [5150, 5151, 5152]

    /// Actividades más viejas (ya finalizadas) para el historial de cada persona.
    static let olderWork: [DemoOlderWork] = [
        DemoOlderWork(id: 5101, titulo: "Revisión mensual de equipos · Hotel Casa Azul", daysAgo: 2),
        DemoOlderWork(id: 5102, titulo: "Entrega de material · Colegio Montebello", daysAgo: 3),
        DemoOlderWork(id: 5103, titulo: "Reparación de acometida · Parque Industrial San José", daysAgo: 5),
        DemoOlderWork(id: 5104, titulo: "Capacitación de seguridad en obra", daysAgo: 6),
    ]

    // MARK: Chat

    static let chatChannels: [DemoChannelSeed] = [
        DemoChannelSeed(id: 201, kind: "PUBLIC", name: "operaciones", topic: "Coordinación del trabajo en campo",
                        peer: nil, members: 10, unread: 3),
        DemoChannelSeed(id: 202, kind: "DIRECT", name: "Diego Ramírez Soto", topic: "Mensaje directo",
                        peer: 102, members: 2, unread: 1),
        DemoChannelSeed(id: 203, kind: "PUBLIC", name: "general", topic: "Conversación del equipo",
                        peer: nil, members: 10, unread: 0),
        DemoChannelSeed(id: 204, kind: "DIRECT", name: "Fernanda Cruz Molina", topic: "Mensaje directo",
                        peer: 103, members: 2, unread: 0),
        DemoChannelSeed(id: 205, kind: "PUBLIC", name: "anuncios", topic: "Avisos importantes del equipo",
                        peer: nil, members: 10, unread: 0),
        DemoChannelSeed(id: 206, kind: "PRIVATE", name: "dirección", topic: "Solo coordinación",
                        peer: nil, members: 3, unread: 0),
    ]

    /// Mensajes iniciales de cada canal (minutos atrás respecto al instante de entrada).
    static func chatSeed(_ channelId: Int) -> [DemoMessageSeed] {
        switch channelId {
        case 201:
            return [
                DemoMessageSeed(id: 7001, author: 1, ago: 185,
                                body: "Buenos días equipo. Hoy la prioridad es el Corporativo Atlixco y la Bodega Norte."),
                DemoMessageSeed(id: 7002, author: 101, ago: 178,
                                body: "Enterada. Ya estoy en sitio con Diego, empezamos por el estacionamiento."),
                DemoMessageSeed(id: 7003, author: 104, ago: 80,
                                body: "Voy retrasado con el cableado de la bodega, falta material para el rack. ¿Alguien tiene 2 patch panel?"),
                DemoMessageSeed(id: 7004, author: 108, ago: 72,
                                body: "Yo llevo dos en la camioneta, te los paso a las 12."),
                DemoMessageSeed(id: 7005, author: 105, ago: 30,
                                body: "Terminé el levantamiento del Colegio Montebello, subo fotos en un momento."),
                DemoMessageSeed(id: 7006, author: 101, ago: 6,
                                body: "Listo, ya quedó el tablero del acceso principal. Van 5 de 8 circuitos."),
            ]
        case 202:
            return [
                DemoMessageSeed(id: 7101, author: 102, ago: 130,
                                body: "Buen día Valeria, ¿me confirmas la hora de la junta con el hotel?"),
                DemoMessageSeed(id: 7102, author: 1, ago: 122, body: "A las 4:30 p. m. en su sala de juntas."),
                DemoMessageSeed(id: 7103, author: 102, ago: 22,
                                body: "Perfecto. Te comparto la hoja de servicio del mantenimiento de clima."),
            ]
        case 203:
            return [
                DemoMessageSeed(id: 7201, author: 107, ago: 70,
                                body: "Recuerden subir sus comprobantes de viáticos antes del viernes."),
                DemoMessageSeed(id: 7202, author: 106, ago: 64, body: "Gracias por el aviso, ya subí los míos."),
                DemoMessageSeed(id: 7203, author: 109, ago: 42,
                                body: "El inventario mensual empieza hoy, avisen si necesitan material."),
            ]
        case 204:
            return [
                DemoMessageSeed(id: 7301, author: 1, ago: 95, body: "Fernanda, ¿cómo quedó el enlace del parque industrial?"),
                DemoMessageSeed(id: 7302, author: 103, ago: 48, body: "Quedó estable. Ya subí la evidencia para tu revisión."),
                DemoMessageSeed(id: 7303, author: 1, ago: 44, body: "Gracias, ya lo reviso."),
            ]
        case 205:
            return [
                DemoMessageSeed(id: 7401, author: 1, ago: 1200,
                                body: "Nueva política de evidencias a partir del lunes: mínimo 2 fotos por actividad."),
                DemoMessageSeed(id: 7402, author: 107, ago: 300, body: "Se actualizó el calendario de pagos de viáticos."),
            ]
        case 206:
            return [
                DemoMessageSeed(id: 7501, author: 101, ago: 210,
                                body: "Adelanté la propuesta de la Clínica Santa Elena, la comparto hoy."),
                DemoMessageSeed(id: 7502, author: 1, ago: 205, body: "Excelente, la reviso en cuanto llegue."),
            ]
        default:
            return []
        }
    }

    // MARK: Almacén

    static let warehouses: [DemoWarehouse] = [
        DemoWarehouse(id: 1, code: "ALM-01", name: "Bodega central"),
        DemoWarehouse(id: 2, code: "ALM-02", name: "Bodega de obra Atlixco"),
    ]

    static let stock: [DemoStockSeed] = [
        DemoStockSeed(id: 1, sku: "CAB-UTP6-305", name: "Cable UTP Cat6 (caja 305 m)", qty: 14, reserved: 4, reorder: 6, warehouseId: 1),
        DemoStockSeed(id: 2, sku: "CAJ-ELE-2X4", name: "Caja de registro eléctrica 2x4", qty: 220, reserved: 40, reorder: 100, warehouseId: 1),
        DemoStockSeed(id: 3, sku: "TAB-QO-12", name: "Tablero de distribución 12 circuitos", qty: 3, reserved: 1, reorder: 4, warehouseId: 1),
        DemoStockSeed(id: 4, sku: "INT-15A", name: "Interruptor termomagnético 15 A", qty: 48, reserved: 12, reorder: 60, warehouseId: 1),
        DemoStockSeed(id: 5, sku: "LUM-LED-60", name: "Luminaria LED panel 60x60", qty: 36, reserved: 24, reorder: 20, warehouseId: 2),
        DemoStockSeed(id: 6, sku: "CAN-PVC-34", name: "Canaleta PVC 3/4 in (tramo 3 m)", qty: 12, reserved: 0, reorder: 40, warehouseId: 1),
        DemoStockSeed(id: 7, sku: "PPL-24P", name: "Patch panel 24 puertos", qty: 8, reserved: 2, reorder: 4, warehouseId: 1),
        DemoStockSeed(id: 8, sku: "TAL-INA-18V", name: "Taladro inalámbrico 18 V", qty: 6, reserved: 3, reorder: 2, warehouseId: 2),
        DemoStockSeed(id: 9, sku: "CIN-AISL-19", name: "Cinta aislante 19 mm", qty: 90, reserved: 10, reorder: 50, warehouseId: 1),
        DemoStockSeed(id: 10, sku: "CAS-SEG-E", name: "Casco de seguridad clase E", qty: 25, reserved: 0, reorder: 10, warehouseId: 2),
    ]
}

struct DemoOlderWork {
    let id: Int
    let titulo: String
    let daysAgo: Int
}

struct DemoChannelSeed {
    let id: Int
    let kind: String
    let name: String
    let topic: String
    let peer: Int?
    let members: Int
    let unread: Int
}

struct DemoMessageSeed {
    let id: Int
    let author: Int
    /// Minutos atrás respecto al instante de entrada al demo.
    let ago: Int
    let body: String
}

struct DemoWarehouse {
    let id: Int
    let code: String
    let name: String
}

struct DemoStockSeed {
    let id: Int
    let sku: String
    let name: String
    let qty: Double
    let reserved: Double
    let reorder: Double
    let warehouseId: Int
}
