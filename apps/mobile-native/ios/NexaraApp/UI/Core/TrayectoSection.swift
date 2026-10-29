import SwiftUI

/// Tarjeta «Trayecto» del detalle (Android `TrayectoCard`): «Iniciar trayecto» antes de iniciar
/// la actividad, «Llegué» mientras va en camino y «Regreso a la oficina» después de entregar
/// (`TrayectoRules`). Solo la ve quien hace la actividad. Si la API todavía no tiene el trayecto
/// (o falla), no se pinta nada.
///
/// Sin tarjeta queda un ancla de alto cero para que la carga corra igual (en un `EmptyView` no
/// correría). Por eso no lleva separación propia hacia arriba salvo cuando se pinta: quien la
/// pone la mete en una columna sin espaciado, junto a lo que va encima.
struct ActivityTrayectoCard: View {
    let activityId: Int
    let miId: Int?
    let iniciada: Bool
    let entregada: Bool
    let cancelada: Bool
    /// Trabajo de escritorio (`TrayectoRules.deOficina`): no se ofrece salir al sitio.
    var deOficina: Bool = false
    /// Cambia al recargar el detalle, al cambiar el estatus o la hora real de inicio y al capturar.
    var refreshToken: String = ""
    /// Separación hacia lo de arriba cuando sí se pinta (la de la columna del detalle).
    var separacionArriba: CGFloat = 10
    /// Aviso corto (el snackbar del detalle).
    let onAviso: (String) -> Void

    @State private var tramos: [ActivityTrayecto]?
    @State private var tick = 0
    @State private var enviando = false

    private var taskKey: String { "\(activityId)-\(refreshToken)-\(tick)" }

    private var estado: TrayectoRules.Estado? {
        guard let tramos else { return nil }
        let e = TrayectoRules.estado(
            tramos: tramos,
            iniciada: iniciada,
            entregada: entregada,
            cancelada: cancelada,
            deOficina: deOficina
        )
        return e.vacio ? nil : e
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Color.clear.frame(height: 0)
            if let estado, let tramos {
                tarjeta(estado, tramos: tramos)
                    .padding(.top, separacionArriba)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .task(id: taskKey) { await cargar() }
    }

    // MARK: Vista

    private func tarjeta(_ estado: TrayectoRules.Estado, tramos: [ActivityTrayecto]) -> some View {
        let deRegreso = TrayectoRules.abierto(tramos)?.tipo == TrayectoRules.regreso || estado.accion == .regreso
        return NxPanelShell(padding: 16, spacing: 10) {
            if let titulo = estado.titulo {
                HStack(alignment: .center, spacing: 12) {
                    Image(systemName: deRegreso ? "house" : "car")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(NxColors.brandText)
                        .frame(width: 36, height: 36)
                        .background(NxColors.brandSoft, in: Circle())
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(titulo)
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(NxColors.fg)
                            .fixedSize(horizontal: false, vertical: true)
                        if let detalle = estado.detalle {
                            Text(detalle)
                                .font(.system(size: 13))
                                .foregroundStyle(NxColors.muted)
                                .lineSpacing(2)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            switch estado.accion {
            case .iniciarIda:
                TrayectoBoton(texto: "Iniciar trayecto", icono: "car", primario: true, enviando: enviando) {
                    Task { await enviar(.iniciarIda) }
                }
            case .regreso:
                TrayectoBoton(texto: "Regreso a la oficina", icono: "house", primario: true, enviando: enviando) {
                    Task { await enviar(.regreso) }
                }
            case .llegue:
                TrayectoBoton(texto: "Llegué", icono: "flag", primario: false, enviando: enviando) {
                    Task { await enviar(.llegue) }
                }
            case .ninguna:
                EmptyView()
            }
            if !estado.resumen.isEmpty {
                VStack(alignment: .leading, spacing: 2) {
                    if estado.titulo == nil {
                        Text("Trayecto")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(NxColors.fg)
                    }
                    ForEach(Array(estado.resumen.enumerated()), id: \.offset) { _, linea in
                        Text(linea)
                            .font(.system(size: 13))
                            .foregroundStyle(NxColors.muted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
        }
    }

    // MARK: Datos

    @MainActor
    private func cargar() async {
        do {
            let lista = try await CoreRepository.shared.trayectos(activityId: activityId, miId: miId)
            if !Task.isCancelled { tramos = lista }
        } catch {
            // Cancelada (otra carga la reemplaza): se queda lo que había.
            if Task.isCancelled { return }
            // La API aún sin trayectos (404), sin permiso o sin red: la tarjeta no se pinta.
            tramos = nil
        }
    }

    @MainActor
    private func enviar(_ accion: TrayectoRules.Accion) async {
        guard !enviando, accion != .ninguna else { return }
        enviando = true
        defer {
            enviando = false
            tick += 1
        }
        let punto = await TrayectoUbicacion.punto()
        do {
            let repo = CoreRepository.shared
            switch accion {
            case .iniciarIda:
                _ = try await repo.iniciarTrayecto(
                    activityId: activityId, tipo: TrayectoRules.ida, lat: punto?.latitude, lng: punto?.longitude
                )
                onAviso("Trayecto iniciado")
            case .regreso:
                _ = try await repo.iniciarTrayecto(
                    activityId: activityId, tipo: TrayectoRules.regreso, lat: punto?.latitude, lng: punto?.longitude
                )
                onAviso("Regreso iniciado")
            case .llegue:
                _ = try await repo.terminarTrayecto(activityId: activityId, lat: punto?.latitude, lng: punto?.longitude)
                onAviso("Llegada registrada")
            case .ninguna:
                break
            }
        } catch {
            onAviso(error.toUserMessage(fallback: "No se pudo registrar el trayecto"))
        }
    }
}

// MARK: - Botón

/// `Button` de Android con `heightIn(min = 48.dp)` y radio 14: verde lleno para iniciar o
/// regresar, contorno #D5DAE2 para «Llegué». Mientras se envía, un indicador en lugar del ícono.
private struct TrayectoBoton: View {
    let texto: String
    let icono: String
    let primario: Bool
    let enviando: Bool
    let accion: () -> Void

    private var forma: RoundedRectangle { RoundedRectangle(cornerRadius: 14, style: .continuous) }

    var body: some View {
        Button(action: accion) {
            HStack(spacing: 8) {
                if enviando {
                    ProgressView()
                        .controlSize(.small)
                        .tint(primario ? Color.white : NxColors.brand)
                        .frame(width: 19, height: 19)
                } else {
                    Image(systemName: icono)
                        .font(.system(size: 16, weight: .semibold))
                        .frame(width: 19, height: 19)
                }
                Text(texto)
                    .font(.system(size: 15, weight: .semibold))
                    .lineLimit(1)
            }
            .foregroundStyle(primario ? Color.white : NxColors.fg)
            .padding(.horizontal, 16)
            .frame(maxWidth: .infinity, minHeight: 48)
            .background(primario ? NxColors.brand : NxColors.card, in: forma)
            .overlay {
                if !primario {
                    forma.strokeBorder(NxColors.rgb(0xD5DAE2), lineWidth: 1)
                }
            }
            .contentShape(forma)
        }
        .buttonStyle(.plain)
        .disabled(enviando)
        .opacity(enviando ? 0.85 : 1)
        .accessibilityLabel(texto)
    }
}

// MARK: - Ubicación

/// El punto de salida o de llegada, si YA hay permiso (no lo pide) y en unos 5 s; sin él, el
/// tramo se mide igual. Espejo del `withTimeoutOrNull(5_000) { DeviceLocation.current }` de
/// Android: `DeviceLocation.current()` espera hasta 8 s por su cuenta.
@MainActor
enum TrayectoUbicacion {
    static func punto(segundos: UInt64 = 5) async -> DeviceCoords? {
        let ubicacion = DeviceLocation.shared
        guard DemoMode.isActive || ubicacion.hasPermission else { return nil }
        return await withCheckedContinuation { (continuacion: CheckedContinuation<DeviceCoords?, Never>) in
            let espera = TrayectoEsperaUbicacion(continuacion)
            Task { @MainActor in
                let coords = await ubicacion.current()
                espera.resolver(coords)
            }
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: segundos * 1_000_000_000)
                espera.resolver(nil)
            }
        }
    }
}

/// Contesta una sola vez: lo que llegue primero, la lectura o el plazo.
@MainActor
private final class TrayectoEsperaUbicacion {
    private var continuacion: CheckedContinuation<DeviceCoords?, Never>?

    init(_ continuacion: CheckedContinuation<DeviceCoords?, Never>) {
        self.continuacion = continuacion
    }

    func resolver(_ coords: DeviceCoords?) {
        continuacion?.resume(returning: coords)
        continuacion = nil
    }
}
