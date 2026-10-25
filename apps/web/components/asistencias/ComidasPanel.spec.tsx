import { describe, expect, it } from "vitest";
import { avisoRegistro } from "./ComidasPanel";

const oraciones = (texto: string) =>
  texto
    .split(/(?<=[.!?])\s+/)
    .map((parte) => parte.trim())
    .filter(Boolean);

describe("Comidas · aviso al registrar", () => {
  it("el aviso de la comida cabe en una frase y el registro se queda", () => {
    const casos = [
      {
        aviso: avisoRegistro("salida", true),
        viejo: "Registraste tu salida a comer. Tu justificación quedó por aprobar.",
      },
      {
        aviso: avisoRegistro("salida", false),
        viejo: "Registraste tu salida a comer. ¡Buen provecho!",
      },
      {
        aviso: avisoRegistro("regreso", true),
        viejo: "Registraste tu regreso. Tu justificación quedó por aprobar.",
      },
    ];

    for (const { aviso, viejo } of casos) {
      expect(oraciones(viejo)).toHaveLength(2);
      expect(oraciones(aviso)).toEqual([aviso]);
      expect(aviso.startsWith("Registraste")).toBe(true);
      expect(aviso).not.toBe(viejo);
    }

    expect(avisoRegistro("salida", true)).toBe("Registraste tu salida a comer: tu justificación quedó por aprobar.");
    expect(avisoRegistro("salida", false)).toBe("Registraste tu salida a comer: ¡buen provecho!");
    expect(avisoRegistro("regreso", true)).toBe("Registraste tu regreso: tu justificación quedó por aprobar.");
    expect(avisoRegistro("regreso", false)).toBe("Registraste tu regreso de comer.");
  });
});
