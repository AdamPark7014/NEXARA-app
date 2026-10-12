import { describe, expect, it } from "vitest";
import { bloqueos, payloadFinal, type PropuestaActividad } from "./asistente-ia-api";

const base: PropuestaActividad = {
  tipo: "servicio",
  tipoEtiqueta: "Servicio",
  razonTipo: "Revisión técnica",
  resumen: "Servicio para (sin responsable) en Tox hoy 15:00",
  titulo: "Revisar cámaras",
  textoResponsable: "Juan",
  responsable: null,
  responsableCandidatos: [
    { id: 9, nombre: "Juan González" },
    { id: 10, nombre: "Juan Sánchez" },
  ],
  textoCliente: "Tox",
  cliente: null,
  clienteCandidatos: [{ id: 1, nombre: "TOX Logística" }],
  sucursal: null,
  proyecto: null,
  proyectoCandidatos: [],
  fechaInicio: null,
  faltantes: ["responsable", "cliente"],
  avisos: [],
  payload: { titulo: "Revisar cámaras", coreKind: "servicio", creadoPorId: 1 },
};

describe("asistente IA en la pizarra", () => {
  it("aplica lo que se eligió en la tarjeta", () => {
    expect(payloadFinal(base, { responsableId: 9, clientId: 1 })).toMatchObject({ responsableId: 9, clientId: 1 });
    expect(payloadFinal({ ...base, payload: { ...base.payload, clientId: 4 } }, { clientId: null }).clientId).toBeUndefined();
  });

  it("no deja crear sin responsable ni un servicio sin cliente", () => {
    expect(bloqueos(base, base.payload, {})).toEqual([
      "Elige a quién se le asigna.",
      "Un servicio necesita un cliente registrado.",
    ]);
  });

  it("respeta los tipos que recibe cada persona", () => {
    const payload = payloadFinal(base, { responsableId: 9, clientId: 1 });
    // Juan (campo de David) recibe tarea/proyecto/obra, no servicio.
    expect(
      bloqueos(base, payload, { creadorEmail: "gerencia@nexara.com.mx", destinoEmail: "juan.gonzalez@nexara.com.mx" }),
    ).toEqual(["A esta persona no se le puede asignar servicio."]);
    expect(
      bloqueos(base, payload, { creadorEmail: "gerencia@nexara.com.mx", destinoEmail: "soporte@nexara.com.mx" }),
    ).toEqual([]);
  });
});
