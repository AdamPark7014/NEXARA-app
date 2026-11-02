import SwiftUI
import UIKit

/// Cómo va la lectura de la foto del tablero.
enum LecturaTablero {
    case sinFoto, leyendo, leida, noSePudo
}

/// El último paso del regreso (Android `RegresoVehiculoContenido`, mockup `AppRegreso`): foto del
/// tablero, lo que se leyó de ella y cuánto se recorrió. Las otras seis fotos ya se tomaron en el
/// paso anterior: la API las exige, es la evidencia 360° que pidió la dirección.
struct RegresoVehiculoContenido: View {
    let encabezado: [String]
    let foto: UIImage?
    /// «18:12».
    let horaFoto: String?
    let lectura: LecturaTablero
    @Binding var odometro: String
    @Binding var nivel: NivelCombustible?
    let kmInicio: Int?
    let aviso: String?
    let error: String?
    let enviando: Bool
    let onFoto: () -> Void
    let onConfirmar: () -> Void

    private var rotulo: String {
        switch lectura {
        case .leyendo: return "Leyendo la foto…"
        case .leida: return "Esto leímos en la foto"
        case .noSePudo: return "No se pudo leer la foto: escríbelo aquí"
        case .sinFoto: return "Odómetro y gasolina"
        }
    }

    private var pieFoto: String {
        if let horaFoto { return "Tomada a las \(horaFoto) · toca para repetir" }
        return "Toca para tomarla"
    }

    /// Lo tecleado, sin las comas que solo se pintan.
    private var kmFinal: Int? { Int(GasolinaRules.soloDigitos(odometro)) }

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    EncabezadoVehiculo(titulo: "Regreso del vehículo", lineas: encabezado)
                    CasillaFotoVehiculo(
                        etiqueta: "Foto del tablero",
                        icono: "camera",
                        foto: foto,
                        leyendo: lectura == .leyendo,
                        alto: 210,
                        tamanoIcono: 30,
                        pie: pieFoto,
                        habilitada: !enviando,
                        onTomar: onFoto
                    )
                    TarjetaVehiculo {
                        RotuloLectura(texto: rotulo, leyendo: lectura == .leyendo)
                        CampoVehiculo(
                            etiqueta: "Odómetro",
                            texto: $odometro,
                            tamano: 20,
                            negrita: true,
                            habilitado: !enviando
                        )
                        CampoNivelGasolina(nivel: $nivel, habilitado: !enviando)
                        if let kmInicio { kmDelViaje(kmInicio) }
                    }
                    Text("Si la foto no se lee o el número no cuadra, lo corriges aquí y queda la foto de respaldo.")
                        .font(.system(size: 13))
                        .foregroundStyle(NxColors.fg2)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal, 2)
                    if let aviso { AvisoLectura(texto: aviso) }
                    if let error {
                        NxAlertBanner(alert: NxAlert(id: "regreso", title: error, tone: .danger))
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 6)
            }
            .scrollDismissesKeyboard(.interactively)
            BotonVehiculo(
                texto: enviando ? "Enviando…" : "Confirmar regreso",
                habilitado: !enviando && lectura != .leyendo,
                enviando: enviando,
                accion: onConfirmar
            )
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 20)
        }
        .nxScreenBackground()
    }

    private func kmDelViaje(_ inicio: Int) -> some View {
        let recorridos = GasolinaRules.kmDelViaje(inicio: inicio, final: kmFinal)
        return HStack(alignment: .lastTextBaseline) {
            Text("Salió con \(GasolinaRules.km(inicio))")
                .font(.system(size: 14))
                .foregroundStyle(NxColors.fg2)
            Spacer(minLength: 8)
            if let recorridos {
                Text(GasolinaRules.km(recorridos))
                    .font(NxFont.display(size: 20, weight: .semibold))
                    .foregroundStyle(NxColors.fg)
            } else if kmFinal != nil {
                Text("Revisa el número")
                    .font(NxFont.display(size: 15, weight: .semibold))
                    .foregroundStyle(NxColors.danger)
            } else {
                Text("—")
                    .font(NxFont.display(size: 15, weight: .semibold))
                    .foregroundStyle(NxColors.fg)
            }
        }
        .padding(.top, 2)
    }
}
