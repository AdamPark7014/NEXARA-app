import { describe, expect, it } from "vitest";
import {
  comoSeTrabaja,
  diasEntre,
  duracionHorario,
  enLaNomina,
  fechaCorta,
  fechaLarga,
  fichaDeFecha,
  quienTrabaja,
  sumaDias,
} from "./festivos-api";

const base = { fecha: "2026-11-16", modo: "NO_SE_LABORA" as const, horaEntrada: null, horaSalida: null, finDeSemana: false, personas: [], pagoDoble: true };

describe("festivos: textos de la pantalla", () => {
  it("cómo se trabaja, quién y cómo sale en la nómina", () => {
    expect(comoSeTrabaja(base)).toBe("No se labora");
    expect(comoSeTrabaja({ ...base, modo: "HORARIO", horaEntrada: "10:00", horaSalida: "14:00" })).toBe("Se labora 10:00 a 14:00");
    expect(comoSeTrabaja({ ...base, fecha: "2027-05-01", finDeSemana: true })).toBe("Cae en sábado");
    expect(quienTrabaja(base)).toBe("Todo el equipo descansa");
    expect(quienTrabaja({ ...base, modo: "COMPLETA" })).toBe("Todo el equipo");
    expect(quienTrabaja({ ...base, modo: "HORARIO", personas: [1, 2, 3] })).toBe("3 personas · el resto descansa");
    expect(enLaNomina(base)).toBe("Descanso pagado");
    expect(enLaNomina({ ...base, modo: "HORARIO" })).toBe("Festivo trabajado: pago doble");
    expect(enLaNomina({ ...base, finDeSemana: true, pagoDoble: false })).toBe("Guardia en festivo");
  });

  it("fechas y duraciones", () => {
    expect(fichaDeFecha("2026-11-16")).toEqual({ mes: "NOV", dia: "16", semana: "lun" });
    expect(fechaLarga("2026-11-02")).toBe("lunes 2 de noviembre");
    expect(fechaCorta("2026-12-25")).toBe("vie 25 dic");
    expect(sumaDias("2026-11-16", -3)).toBe("2026-11-13");
    expect(diasEntre("2026-10-29", "2026-11-02")).toBe(4);
    expect(duracionHorario("10:00", "14:30")).toBe("4 h 30 min");
    expect(duracionHorario("14:00", "10:00")).toBeNull();
  });
});
