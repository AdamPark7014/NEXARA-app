import SwiftUI

/// Organigrama (`/erp/organigrama`) en iPhone.
///
/// **Por qué no es el árbol de la web.** La web dibuja un lienzo con zoom: cajas
/// unidas por líneas. Eso pide ancho. Para ver tres niveles de NEXARA en una
/// pantalla de 375 px hay que alejar hasta que los nombres quedan en seis puntos
/// y el dibujo deja de decir quién reporta a quién: solo dice que hay muchas
/// cajas. Con la letra grande del sistema es peor todavía, y un lienzo con
/// desplazamiento en dos ejes pelea con el gesto de volver.
///
/// **Lo que se hizo, y por qué así en iOS.** Un nivel por pantalla, empujado en
/// la pila de navegación: se entra a una persona y se ve su equipo directo en
/// renglones de ancho completo. Aquí no hay migas de pan como en Android —
/// sobran: la barra de navegación ya enseña de dónde vienes y el deslizar desde
/// el borde sube un nivel, que es el gesto que un usuario de iPhone ya tiene en
/// los dedos. Arriba, `.searchable` sobre TODO el organigrama, con la cadena de
/// mando de cada resultado y un toque para saltar ahí.
///
/// **Qué se pierde y qué se gana.** Se pierde la foto completa de un vistazo,
/// que en un palmo de pantalla no existía. Se gana que cada renglón se lee, que
/// hay dónde poner el dedo, y las dos cosas que el lienzo hace mal: buscar, y
/// saber cuánta gente cuelga de alguien sin contarla a ojo.
struct OrganigramaView: View {
    @State private var estado = CoreExtrasEstado<[OrgNode]>()
    @State private var busqueda = ""

    private var raices: [OrgNode] { estado.datos ?? [] }

    /// Todo el organigrama, plano, con la cadena de mando de cada quien.
    private var todos: [OrgBusquedaFila] {
        raices.flatMap { $0.aplanado() }
    }

    private var resultados: [OrgBusquedaFila] {
        let q = busqueda.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !q.isEmpty else { return [] }
        return todos
            .filter { fila in
                [fila.nodo.nombre, fila.nodo.puesto, fila.nodo.role?.nombre, fila.nodo.department?.nombre]
                    .compactMap { $0?.lowercased() }
                    .contains { $0.contains(q) }
            }
            .sorted { $0.nodo.nombre.localizedCaseInsensitiveCompare($1.nodo.nombre) == .orderedAscending }
    }

    private var buscando: Bool {
        !busqueda.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        List {
            if let aviso = estado.avisoDesactualizado {
                Section { CoreExtrasAvisoDesactualizado(mensaje: aviso) }
            }

            if estado.mostrandoEsqueleto {
                Section { CoreExtrasCargando() }
            }

            if buscando {
                Section {
                    if resultados.isEmpty {
                        Text("Nadie coincide con «\(busqueda)».").foregroundStyle(.secondary)
                    } else {
                        ForEach(resultados) { fila in
                            NavigationLink(value: fila.nodo) {
                                // Lo que sitúa a alguien en una búsqueda es su
                                // cadena de mando, no cuánta gente tiene.
                                OrgFila(nodo: fila.nodo, subtitulo: fila.cadenaTexto)
                            }
                        }
                    }
                } header: {
                    Text("Resultados")
                } footer: {
                    Text("En todo el organigrama, no solo en este nivel.")
                }
            } else if estado.hayDatos {
                if raices.isEmpty {
                    Section {
                        Text("Todavía nadie tiene jefe asignado en esta empresa.")
                            .foregroundStyle(.secondary)
                    }
                } else {
                    Section {
                        ForEach(raices) { nodo in
                            NavigationLink(value: nodo) {
                                OrgFila(nodo: nodo, subtitulo: nodo.equipoTexto)
                            }
                        }
                    } header: {
                        Text("Dirección")
                    } footer: {
                        Text("\(todos.count) personas en el organigrama.")
                    }
                }
            }

            Section {
                CoreExtrasNotaDeAlcance(
                    texto: "Consulta. Reasignar jefes y mover el organigrama se hace desde la computadora."
                )
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Organigrama")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $busqueda, prompt: "Buscar por nombre, puesto o área")
        .refreshable { await cargar() }
        // Registrado una vez en la raíz: sirve para los empujes de cualquier
        // nivel, por hondo que sea, y para los de la búsqueda.
        .navigationDestination(for: OrgNode.self) { nodo in
            OrgNivelView(nodo: nodo)
        }
        .overlay {
            if let error = estado.error, !estado.hayDatos {
                CoreExtrasError(mensaje: error) { Task { await cargar() } }
            }
        }
        .task { if !estado.hayDatos { await cargar() } }
    }

    private func cargar() async {
        estado.empezar()
        do {
            estado.exito(try await CoreExtrasRepository.shared.orgchart())
        } catch {
            estado.fallo(error.toUserMessage(fallback: "No se pudo cargar el organigrama"))
        }
    }
}

/// Un nivel: quién es esta persona y quién le reporta directo.
///
/// No vuelve a pedir nada al API — el árbol entero llegó en la primera carga,
/// así que bajar y subir es instantáneo aunque no haya señal.
struct OrgNivelView: View {
    let nodo: OrgNode

    var body: some View {
        List {
            Section {
                HStack(spacing: 14) {
                    CoreExtrasAvatar(nombre: nodo.nombre, url: nodo.avatarUrl, lado: 56)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(nodo.nombre).font(.headline)
                        if let puesto = nodo.puesto {
                            Text(puesto).font(.subheadline).foregroundStyle(.secondary)
                        }
                        Text(nodo.equipoTexto)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(NxBrand.adaptive)
                    }
                }
                .padding(.vertical, 4)
                if let rol = nodo.role?.nombre.nilSiVacio {
                    LabeledContent("Rol", value: rol)
                }
                if let area = nodo.department?.nombre.nilSiVacio {
                    LabeledContent("Área", value: area)
                }
            }

            Section {
                if nodo.esHoja {
                    Text("\(nodo.nombre) no tiene a nadie reportándole.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(nodo.children) { hijo in
                        if hijo.esHoja {
                            // Sin equipo no hay a dónde bajar: la fila no se
                            // empuja, y así la flecha no promete lo que no hay.
                            OrgFila(nodo: hijo, subtitulo: hijo.equipoTexto)
                        } else {
                            NavigationLink(value: hijo) {
                                OrgFila(nodo: hijo, subtitulo: hijo.equipoTexto)
                            }
                        }
                    }
                }
            } header: {
                Text("Le reportan directo")
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle(nodo.nombre)
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// Un renglón de persona del organigrama.
struct OrgFila: View {
    let nodo: OrgNode
    let subtitulo: String

    var body: some View {
        HStack(spacing: 12) {
            CoreExtrasAvatar(nombre: nodo.nombre, url: nodo.avatarUrl, lado: 40)
            VStack(alignment: .leading, spacing: 2) {
                Text(nodo.nombre).font(.body.weight(.medium))
                if let puesto = nodo.puesto {
                    Text(puesto).font(.caption).foregroundStyle(.secondary)
                }
                Text(subtitulo).font(.caption2).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
    }
}
