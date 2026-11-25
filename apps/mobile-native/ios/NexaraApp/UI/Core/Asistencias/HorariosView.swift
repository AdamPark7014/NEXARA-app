import SwiftUI

/// Pestaña «Horarios» de Asistencias — espejo de `HorariosPanel.kt`.
/// Un fallo al refrescar no borra lo que ya se veía: lo dice en una cinta.
struct HorariosView: View {
    let checa: Bool
    let gestiona: Bool

    @State private var enEquipo = true
    @State private var mio: MiHorario?
    @State private var equipo: HorariosEquipo?
    @State private var error: String?
    @State private var aviso: String?
    @State private var cambiando: PersonaHorario?

    private var verEquipo: Bool { gestiona && (enEquipo || !checa) }
    private var hayDatos: Bool { verEquipo ? equipo != nil : mio != nil }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 14) {
                if checa && gestiona {
                    NxSegmented(
                        options: ["Mi equipo hoy", "Mi horario"],
                        selectedIndex: verEquipo ? 0 : 1,
                        onSelect: { enEquipo = $0 == 0 }
                    )
                }
                if let aviso {
                    MoreAvisoDesactualizado(mensaje: aviso, onCerrar: { self.aviso = nil })
                }
                if let error, !hayDatos {
                    NxErrorBlock(message: error, onRetry: { Task { await cargar() } })
                } else if !hayDatos {
                    NxSkeletonList(itemCount: 5, itemHeight: 64)
                } else if verEquipo {
                    contenidoEquipo
                } else {
                    contenidoMio
                }
            }
            .padding(16)
        }
        .refreshable { await cargar() }
        .task(id: verEquipo) { await cargar() }
        .sheet(item: $cambiando) { persona in
            CambiarSalidaView(persona: persona, onListo: { Task { await cargar() } })
        }
    }

    @ViewBuilder
    private var contenidoEquipo: some View {
        let personas = equipo?.personas ?? []
        if personas.isEmpty {
            NxEmptyState(title: "No tienes personas a tu cargo", subtitle: "Aquí aparece el horario de tu equipo.")
        } else {
            NxSectionHeader(title: "Hoy, \(HorariosReglas.dia(equipo?.hoy))")
            VStack(spacing: 0) {
                ForEach(Array(personas.enumerated()), id: \.element.id) { i, p in
                    if i > 0 { Divider() }
                    filaPersona(p)
                }
            }
            .nxCard(padding: 0)
            Text("Toca a una persona para que salga más tarde o antes.")
                .font(NxType.bodySmall)
                .foregroundStyle(NxColors.muted)
        }
    }

    @ViewBuilder
    private func filaPersona(_ p: PersonaHorario) -> some View {
        let hoy = p.dias?.first
        if p.puedeProgramar == true && hoy?.trabaja == true {
            Button { cambiando = p } label: { renglonPersona(p, hoy) }
                .buttonStyle(.plain)
                .accessibilityHint("Cambiar su salida")
        } else {
            renglonPersona(p, hoy)
        }
    }

    private func renglonPersona(_ p: PersonaHorario, _ hoy: DiaHorario?) -> some View {
        let entrada = AttendanceClock.parse(p.entradaHoyAt) != nil ? "Entró \(AttendanceClock.shortTime(p.entradaHoyAt))" : nil
        let derecha = hoy.map { $0.trabaja == false ? "Descansa" : HorariosReglas.rango($0) } ?? ""
        return HorarioRenglon(
            titulo: p.nombre ?? "",
            detalle: entrada ?? hoy?.horario?.motivo ?? p.puesto ?? "Sin entrada",
            valor: derecha
        )
    }

    @ViewBuilder
    private var contenidoMio: some View {
        let dias = mio?.dias ?? []
        if let hoy = dias.first {
            VStack(alignment: .leading, spacing: 4) {
                Text("Hoy, \(HorariosReglas.dia(hoy.fecha))")
                    .font(NxType.bodySmall)
                    .foregroundStyle(NxColors.muted)
                Text(HorariosReglas.rango(hoy).replacingOccurrences(of: "–", with: " a "))
                    .font(.system(size: 30, weight: .bold))
                    .foregroundStyle(NxColors.fg)
                if let nota = HorariosReglas.quienYPorQue(hoy) {
                    Text(nota).font(NxType.bodyMedium).foregroundStyle(NxColors.fg2)
                }
                let pie = pieDeHoy(hoy)
                if !pie.isEmpty {
                    Text(pie).font(NxType.bodyMedium).foregroundStyle(NxColors.fg2)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .nxCard()
            NxSectionHeader(title: "Próximos días")
            VStack(spacing: 0) {
                ForEach(Array(dias.dropFirst().enumerated()), id: \.offset) { i, d in
                    if i > 0 { Divider() }
                    HorarioRenglon(
                        titulo: HorariosReglas.diaConMayuscula(d.fecha),
                        detalle: HorariosReglas.quienYPorQue(d),
                        valor: HorariosReglas.rango(d)
                    )
                }
            }
            .nxCard(padding: 0)
        } else {
            NxEmptyState(title: "Sin horario que mostrar", subtitle: "Desliza hacia abajo para volver a cargarlo.")
        }
    }

    private func pieDeHoy(_ d: DiaHorario) -> String {
        var partes: [String] = []
        if AttendanceClock.parse(mio?.entradaHoyAt) != nil { partes.append("Entraste \(AttendanceClock.shortTime(mio?.entradaHoyAt)).") }
        if let m = d.extraMin, m > 0 { partes.append("Extra prevista: \(HorariosReglas.horas(m)), por autorizar.") }
        return partes.joined(separator: " ")
    }

    private func cargar() async {
        let hoy = AttendanceClock.today()
        let deEquipo = verEquipo
        do {
            if deEquipo {
                equipo = try await HorariosRepository.shared.equipo(dia: hoy)
            } else {
                mio = try await HorariosRepository.shared.mio(desde: hoy, hasta: HorariosReglas.sumar(hoy, 7))
            }
            error = nil
            aviso = nil
        } catch is CancellationError {
            return
        } catch {
            let texto = error.toUserMessage(fallback: "No se pudieron cargar los horarios")
            if deEquipo ? equipo != nil : mio != nil { aviso = texto } else { self.error = texto }
        }
    }
}

/// Renglón denso: título y detalle a la izquierda, valor a la derecha.
struct HorarioRenglon: View {
    let titulo: String
    let detalle: String?
    let valor: String

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(titulo)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(NxColors.fg)
                if let detalle, !detalle.isEmpty {
                    Text(detalle).font(NxType.bodySmall).foregroundStyle(NxColors.muted)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Text(valor)
                .font(.system(size: 15, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(NxColors.fg)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .frame(minHeight: 52)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

/// El jefe hace que alguien salga más tarde o termine antes, hoy.
struct CambiarSalidaView: View {
    let persona: PersonaHorario
    let onListo: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var extender = true
    @State private var hora = ""
    @State private var motivo = ""
    @State private var enviando = false
    @State private var error: String?

    private var dia: DiaHorario? { persona.dias?.first }
    private var entrada: String? { dia?.horario?.horaEntrada }
    private var salida: String? { dia?.horario?.horaSalida }
    private var sugerencias: [String] { HorariosReglas.sugerencias(entrada: entrada, salida: salida, extender: extender) }
    private var falta: String? { HorariosReglas.falta(hora: hora, entrada: entrada, salida: salida, extender: extender) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text(persona.nombre ?? "")
                    .font(NxType.headlineSmall)
                    .foregroundStyle(NxColors.fg)
                    .accessibilityAddTraits(.isHeader)
                Text("Hoy sale a las \(salida ?? "")")
                    .font(NxType.bodySmall)
                    .foregroundStyle(NxColors.muted)
                NxSegmented(
                    options: ["Se queda más tarde", "Termina antes"],
                    selectedIndex: extender ? 0 : 1,
                    onSelect: { i in
                        extender = i == 0
                        hora = sugerencias.first ?? ""
                        error = nil
                    }
                )
                HStack(spacing: 8) {
                    ForEach(sugerencias, id: \.self) { s in
                        ChipDeFiltroMaterial(
                            texto: s,
                            seleccionado: hora == s,
                            fondoActivo: NxColors.brandSoft2,
                            textoActivo: NxColors.brandDeep,
                            alto: viaticoAlturaToque,
                            llenaAncho: false,
                            habilitado: !enviando
                        ) {
                            hora = s
                        }
                    }
                }
                CampoDelineado(etiqueta: "Hora de salida (24 h)", texto: $hora, habilitado: !enviando, maxLargo: 5)
                CampoDelineado(etiqueta: "Motivo (opcional)", texto: $motivo, habilitado: !enviando, maxLargo: 200)
                if let error {
                    Text(error)
                        .font(NxType.bodySmall)
                        .foregroundStyle(NxColors.danger)
                        .fixedSize(horizontal: false, vertical: true)
                }
                NxPrimaryButton(
                    extender ? "Extender hasta \(hora)" : "Terminar a las \(hora)",
                    loading: enviando,
                    enabled: falta == nil
                ) {
                    guardar()
                }
                Text(falta ?? "Le avisamos por chat. La hora extra se paga solo si la autorizas después.")
                    .font(NxType.bodySmall)
                    .foregroundStyle(NxColors.muted)
                    .fixedSize(horizontal: false, vertical: true)
                Button("Cancelar") { dismiss() }
                    .buttonStyle(BotonMaterialStyle(tipo: .texto(NxColors.brand), alto: viaticoAlturaToque, llenaAncho: true))
                    .disabled(enviando)
            }
            .padding(NxSpacing.xl)
        }
        .scrollDismissesKeyboard(.interactively)
        .interactiveDismissDisabled(enviando)
        .hojaMaterial()
        .onAppear { if hora.isEmpty { hora = sugerencias.first ?? "" } }
    }

    private func guardar() {
        guard falta == nil, !enviando, let fecha = dia?.fecha else { return }
        enviando = true
        error = nil
        let nueva = hora
        let texto = motivo
        let mas = extender
        Task { @MainActor in
            do {
                try await HorariosRepository.shared.cambiarSalida(
                    userId: persona.id,
                    fecha: fecha,
                    hasta: nueva,
                    motivo: texto,
                    extender: mas
                )
                enviando = false
                onListo()
                dismiss()
            } catch {
                enviando = false
                self.error = error.toUserMessage(fallback: "No se pudo cambiar el horario")
            }
        }
    }
}
