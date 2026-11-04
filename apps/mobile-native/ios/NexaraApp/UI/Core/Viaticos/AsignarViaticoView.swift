import SwiftUI

/// Lo que decide «Asignar viático». Espejo de `AsignarViaticoRules.kt`.
enum AsignarViaticoRules {
    static func completo(personaId: Int?, actividadId: Int?, centavos: Int, motivo: String) -> Bool {
        personaId != nil && actividadId != nil && centavos > 0
            && !motivo.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// El servidor exige actividad o proyecto: sin actividades abiertas no hay a qué ligarlo.
    static func avisoSinActividades(_ nombre: String?) -> String {
        let n = (nombre ?? "").trimmingCharacters(in: .whitespaces)
        return "\(n.isEmpty ? "Esta persona" : n) no tiene actividades abiertas. Asígnale una primero."
    }

    static func filtrar(_ personas: [PersonaAsignable], consulta: String) -> [PersonaAsignable] {
        let q = consulta.trimmingCharacters(in: .whitespaces).lowercased()
        return q.isEmpty ? personas : personas.filter { $0.nombre.lowercased().contains(q) }
    }
}

/// Dirección le asigna un viático a alguien, ligado a una de sus actividades abiertas.
struct AsignarViaticoView: View {
    let onCreado: () -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var personas: [PersonaAsignable] = []
    @State private var consulta = ""
    @State private var persona: PersonaAsignable?
    @State private var actividades: [TeamBoardOpenActivity] = []
    @State private var cargandoActividades = false
    @State private var actividadId: Int?
    @State private var importe = ""
    @State private var categoria = Viatico.categorias.first?.clave ?? "COMBUSTIBLE"
    @State private var motivo = ""
    @State private var enviando = false
    @State private var error: String?

    private var centavos: Int { Dinero.parsearCentavos(importe) ?? 0 }

    private var completo: Bool {
        AsignarViaticoRules.completo(personaId: persona?.id, actividadId: actividadId, centavos: centavos, motivo: motivo)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                NxSectionHeader(title: "¿A quién?")
                if let persona {
                    ChipDeFiltroMaterial(
                        texto: persona.nombre,
                        seleccionado: true,
                        fondoActivo: NxColors.brandSoft2,
                        textoActivo: NxColors.brandDeep,
                        alto: viaticoAlturaToque,
                        llenaAncho: true,
                        habilitado: !enviando
                    ) {
                        self.persona = nil
                        actividadId = nil
                        actividades = []
                    }
                } else {
                    CampoDelineado(etiqueta: "Buscar persona", texto: $consulta, error: nil, multilinea: false, minLineas: 1, habilitado: true)
                    ForEach(AsignarViaticoRules.filtrar(personas, consulta: consulta)) { p in
                        Button {
                            persona = p
                            Task { await cargarActividades(p) }
                        } label: {
                            Text(p.nombre)
                                .font(.system(size: 15))
                                .foregroundStyle(NxColors.fg)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.vertical, 8)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }

                if let persona {
                    NxSectionHeader(title: "¿Para qué actividad?")
                    if cargandoActividades {
                        Text("Buscando sus actividades…")
                            .font(.system(size: 13))
                            .foregroundStyle(NxColors.muted)
                    } else if actividades.isEmpty {
                        Text(AsignarViaticoRules.avisoSinActividades(persona.nombre))
                            .font(.system(size: 13))
                            .foregroundStyle(NxColors.muted)
                    } else {
                        ForEach(actividades) { a in
                            ChipDeFiltroMaterial(
                                texto: (a.titulo ?? "").isEmpty ? "Actividad \(a.id)" : (a.titulo ?? ""),
                                seleccionado: actividadId == a.id,
                                fondoActivo: NxColors.brandSoft2,
                                textoActivo: NxColors.brandDeep,
                                alto: viaticoAlturaToque,
                                llenaAncho: true,
                                habilitado: !enviando
                            ) {
                                actividadId = a.id
                            }
                        }
                    }

                    CampoImporte(titulo: "¿Cuánto?", crudo: $importe, ayuda: nil, error: nil, habilitado: !enviando)

                    NxSectionHeader(title: "¿En qué?")
                    ForEach(Viatico.categorias, id: \.clave) { item in
                        ChipDeFiltroMaterial(
                            texto: item.etiqueta,
                            seleccionado: categoria == item.clave,
                            fondoActivo: NxColors.brandSoft2,
                            textoActivo: NxColors.brandDeep,
                            alto: viaticoAlturaToque,
                            llenaAncho: true,
                            habilitado: !enviando
                        ) {
                            categoria = item.clave
                        }
                    }

                    CampoDelineado(etiqueta: "Concepto", texto: $motivo, error: nil, multilinea: true, minLineas: 2, habilitado: !enviando)
                }

                if let error {
                    NxErrorBlock(message: error)
                }

                if persona != nil {
                    Button {
                        asignar()
                    } label: {
                        HStack(spacing: 10) {
                            if enviando {
                                SpinnerDeBoton()
                                Text("Enviando…")
                            } else {
                                Text("Asignar viático").fontWeight(.bold)
                            }
                        }
                    }
                    .buttonStyle(BotonMaterialStyle(tipo: .lleno(NxColors.brand), alto: 56))
                    .disabled(enviando || !completo)
                }
            }
            .padding(NxSpacing.l)
        }
        .scrollDismissesKeyboard(.interactively)
        .nxScreenBackground()
        .task {
            if personas.isEmpty {
                personas = await CoreRepository.shared.personasAsignables()
                    .sorted { $0.nombre.localizedCaseInsensitiveCompare($1.nombre) == .orderedAscending }
            }
        }
    }

    private func cargarActividades(_ p: PersonaAsignable) async {
        cargandoActividades = true
        actividadId = nil
        actividades = []
        do {
            actividades = try await CoreRepository.shared.teamBoardUser(userId: p.id).openActivities ?? []
        } catch {
            self.error = error.toUserMessage(fallback: "No se pudieron leer sus actividades")
        }
        cargandoActividades = false
    }

    private func asignar() {
        guard let persona, let actividadId else { return }
        enviando = true
        error = nil
        Task { @MainActor in
            do {
                try await ViaticosRepository.shared.asignar(
                    usuarioId: persona.id,
                    actividadId: actividadId,
                    centavos: centavos,
                    categoria: categoria,
                    motivo: motivo
                )
                enviando = false
                onCreado()
                dismiss()
            } catch {
                enviando = false
                self.error = error.toUserMessage(fallback: "No se pudo asignar el viático")
            }
        }
    }
}
