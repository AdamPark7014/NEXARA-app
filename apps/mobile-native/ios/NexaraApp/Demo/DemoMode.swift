import Foundation

/// Modo demostración: la app entera funciona SIN cuenta y SIN red, con datos ficticios.
///
/// Por qué existe: Apple no puede iniciar sesión con la cuenta de revisión (o no debe
/// depender de ella) y su guía 2.1 acepta expresamente un «modo demostración». Todo lo
/// que se ve aquí —personas, clientes, actividades, chat, viáticos— es inventado y vive
/// solo en memoria. No toca el llavero, no abre el socket, no pide permisos de avisos ni
/// de ubicación y no manda una sola petición al API.
///
/// Se activa de dos formas:
///  - botón «Explorar NEXARA con datos de muestra» del login (`DemoMode.activate()`);
///  - al arrancar con `-NEXARA_DEMO 1` (argumento de lanzamiento) o con la variable de
///    entorno `NEXARA_DEMO=1`: la app salta directo a la sesión demo y marca la
///    bienvenida como vista (para UITests y capturas de tienda).
///
/// Se sale con `DemoMode.exit()` (o con «Cerrar sesión» del perfil: `SessionStore.clear()`
/// también sale del demo).
///
/// Cómo se intercepta: `ApiClient.performOnce` y `refreshSessionToken` preguntan por
/// `DemoMode.isActive` ANTES de `NetworkMonitor`, de la caché sin conexión y de la cola de
/// mutaciones, y contestan `DemoBackend.handle(...)`.
enum DemoMode {
    static let launchArgument = "-NEXARA_DEMO"
    static let environmentKey = "NEXARA_DEMO"

    /// Id de la persona en sesión: `Int(id) == 1` es «yo» en pizarra, chat y viáticos.
    static let meId = 1

    private static let lock = NSLock()
    private static var storedActive: Bool = DemoMode.launchRequested

    /// ¿La app está en modo demostración? Seguro de leer desde cualquier hilo.
    static var isActive: Bool {
        get {
            lock.lock()
            defer { lock.unlock() }
            return storedActive
        }
        set {
            lock.lock()
            storedActive = newValue
            lock.unlock()
        }
    }

    /// El proceso se lanzó pidiendo el demo (`-NEXARA_DEMO 1` o `NEXARA_DEMO=1`).
    static var launchRequested: Bool {
        let args = ProcessInfo.processInfo.arguments
        if let index = args.firstIndex(of: launchArgument) {
            let next = args.indices.contains(index + 1) ? args[index + 1].lowercased() : "1"
            return !["0", "false", "no", "off"].contains(next)
        }
        if let raw = ProcessInfo.processInfo.environment[environmentKey]?.lowercased() {
            return ["1", "true", "yes", "on"].contains(raw)
        }
        return false
    }

    // MARK: Entrar y salir

    /// Entra al demo desde el botón del login: sesión solo en memoria y datos frescos.
    static func activate() {
        isActive = true
        DemoStore.shared.reset()
        SessionStore.shared.enterDemo()
    }

    /// Lo que hace `SessionStore.init` cuando el proceso arrancó con el demo pedido:
    /// datos frescos y bienvenida marcada como vista (no se le enseña a quien solo
    /// quiere ver la app).
    static func prepareForLaunch() {
        isActive = true
        DemoStore.shared.reset()
        OnboardingStore.isCompleted = true
    }

    /// Sale del modo demostración y devuelve a la pantalla de acceso.
    static func exit() {
        guard isActive else { return }
        SessionStore.shared.clear()
    }

    /// Apaga la bandera y borra el estado en memoria. Lo llama `SessionStore.clear()`.
    static func deactivate() {
        isActive = false
        DemoStore.shared.reset()
    }

    // MARK: Sesión ficticia

    /// La persona en sesión: directora de una constructora ficticia, con permisos plenos.
    static func sessionUser() -> SessionUser {
        SessionUser(
            id: String(meId),
            nombre: DemoData.me.nombre,
            email: DemoData.me.email,
            role: DemoData.me.puesto,
            department: DemoData.me.departamento,
            token: "demo-token",
            permissions: DemoData.permissions,
            isSuperAdmin: true,
            isClient: false,
            isBranchUser: false,
            clientId: nil,
            branchId: nil,
            roleKey: "ceo",
            orgRoleKey: "ceo",
            navPanels: ["erp"],
            navModules: DemoData.navModules,
            companyId: 1,
            // Lejos en el futuro: `needsRefresh` nunca es verdadero y nadie intenta renovar.
            expiresAt: "2099-01-01T00:00:00Z"
        )
    }
}
