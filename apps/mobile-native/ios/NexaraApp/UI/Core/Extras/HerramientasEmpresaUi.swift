import SwiftUI

/// Las tarjetas de quien mira toda la empresa: lo que espera aprobación, los préstamos
/// de los demás y el inventario. Aquí no se decide nada: `HerramientasReglas` ya lo resolvió.

// MARK: - Por aprobar

/// Un préstamo pendiente: quién, qué, para qué y hasta cuándo, con aprobar y rechazar.
struct TarjetaPorAprobar: View {
    let prestamo: PrestamoHerramienta
    let enviando: Bool
    let onAprobar: () -> Void
    let onRechazar: () -> Void

    var body: some View {
        let titulo = HerramientasReglas.tituloPrestamo(prestamo)
        let renglones = HerramientasReglas.renglonesPrestamo(prestamo)
        let devolver = HerramientasReglas.fechaCorta(prestamo.expectedReturnDate)

        MoreTarjeta {
            VStack(alignment: .leading, spacing: 4) {
                Text(titulo)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(NxColors.fg)
                    .lineLimit(2)
                Text(HerramientasReglas.nombreDe(prestamo))
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(NxColors.fg)
                if !renglones.isEmpty {
                    Text(renglones.joined(separator: "\n"))
                        .font(NxType.labelMedium)
                        .foregroundStyle(NxColors.muted)
                        .lineLimit(2)
                }
                if !devolver.isEmpty {
                    Text("La regresa el \(devolver)")
                        .font(NxType.labelSmall)
                        .foregroundStyle(NxColors.muted)
                }
                if let motivo = prestamo.reason?.nilSiVacio {
                    Text(motivo)
                        .font(NxType.bodySmall)
                        .foregroundStyle(NxColors.muted)
                        .lineLimit(3)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)

            NxDecisionButtons(acting: enviando, onApprove: onAprobar, onReject: onRechazar)
        }
    }
}

/// Una prórroga pendiente: de cuándo a cuándo se corre la fecha.
struct TarjetaRenovacion: View {
    let renovacion: RenovacionHerramienta
    let enviando: Bool
    let onAprobar: () -> Void
    let onRechazar: () -> Void

    var body: some View {
        let antes = HerramientasReglas.fechaCorta(renovacion.previousReturnDate)
        let despues = HerramientasReglas.fechaCorta(renovacion.newReturnDate)

        MoreTarjeta {
            VStack(alignment: .leading, spacing: 4) {
                Text(HerramientasReglas.tituloRenovacion(renovacion))
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(NxColors.fg)
                    .lineLimit(2)
                Text(HerramientasReglas.nombreDe(renovacion))
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(NxColors.fg)
                if !despues.isEmpty {
                    Text(antes.isEmpty ? "Hasta el \(despues)" : "Del \(antes) al \(despues)")
                        .font(NxType.labelMedium)
                        .foregroundStyle(NxColors.muted)
                }
                if let motivo = renovacion.renewalReason?.nilSiVacio {
                    Text(motivo)
                        .font(NxType.bodySmall)
                        .foregroundStyle(NxColors.muted)
                        .lineLimit(3)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)

            NxDecisionButtons(acting: enviando, onApprove: onAprobar, onReject: onRechazar)
        }
    }
}

// MARK: - Préstamos de la empresa

/// Un préstamo de alguien: quién lo trae, su estado y su plazo. Con `accion`, el botón
/// de la ventanilla (entregar o recibir); sin ella, solo consulta.
struct TarjetaPrestamoEmpresa: View {
    let prestamo: PrestamoHerramienta
    let hoy: HerramientasReglas.Dia
    let accion: HerramientasReglas.AccionDePrestamo?
    let enviando: Bool
    let onAccion: (HerramientasReglas.AccionDePrestamo) -> Void

    var body: some View {
        let renglones = HerramientasReglas.renglonesPrestamo(prestamo)
        let abierto = HerramientasReglas.estaAbierto(prestamo)
        let plazo = abierto ? HerramientasReglas.textoPlazo(prestamo.expectedReturnDate, hoy: hoy) : nil
        let notas = [prestamo.damageDescription?.nilSiVacio, prestamo.adminNotes?.nilSiVacio].compactMap { $0 }

        MoreTarjeta {
            VStack(alignment: .leading, spacing: 6) {
                Text(HerramientasReglas.tituloPrestamo(prestamo))
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(NxColors.fg)
                    .lineLimit(2)
                Text(HerramientasReglas.nombreDe(prestamo))
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(NxColors.fg)
                if !renglones.isEmpty {
                    Text(renglones.joined(separator: "\n"))
                        .font(NxType.labelMedium)
                        .foregroundStyle(NxColors.muted)
                        .lineLimit(2)
                }
                HStack(alignment: .center, spacing: 6) {
                    NxStatusChip(
                        text: HerramientasReglas.etiquetaEstadoEmpresa(prestamo.status),
                        tone: HerramientasReglas.tonoEstado(prestamo.status).nx
                    )
                    if let plazo {
                        NxStatusChip(
                            text: plazo,
                            tone: HerramientasReglas.tonoPlazo(prestamo.expectedReturnDate, hoy: hoy).nx
                        )
                    }
                }
                ForEach(Array(notas.enumerated()), id: \.offset) { _, nota in
                    Text(nota)
                        .font(NxType.bodySmall)
                        .foregroundStyle(NxColors.fg)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 8)
                        .background(NxTone.neutral.bg, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)

            if let accion {
                Button(accion.etiqueta) { onAccion(accion) }
                    .buttonStyle(HerrBotonContornoStyle(alto: 48))
                    .disabled(enviando)
            }
        }
    }
}

// MARK: - Inventario

/// Una pieza del inventario: su identificación, su estado y quién la trae.
struct TarjetaInventario: View {
    let pieza: PiezaDeInventario
    let quien: String?

    var body: some View {
        let renglones = HerramientasReglas.renglonesPieza(pieza)

        MoreTarjeta {
            Text(HerramientasReglas.tituloPieza(pieza))
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(NxColors.fg)
                .lineLimit(2)
            if !renglones.isEmpty {
                Text(renglones.joined(separator: "\n"))
                    .font(NxType.labelMedium)
                    .foregroundStyle(NxColors.muted)
                    .lineLimit(3)
            }
            NxStatusChip(
                text: HerramientasReglas.etiquetaEstadoPieza(pieza.status),
                tone: HerramientasReglas.tonoEstadoPieza(pieza.status).nx
            )
            if let quien {
                Text(quien)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(NxColors.fg)
            }
        }
        .accessibilityElement(children: .combine)
    }
}
