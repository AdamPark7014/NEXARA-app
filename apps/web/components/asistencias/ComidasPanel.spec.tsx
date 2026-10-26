import { describe, expect, it } from "vitest";
import { avisoRegistro } from "./ComidasPanel";

describe("Comidas · aviso al registrar", () => {
  it("el aviso de la comida cabe en una frase y el registro se queda", () => {
    expect(avisoRegistro("salida", true)).toBe("Registraste tu salida a comer: tu justificación quedó por aprobar.");
    expect(avisoRegistro("salida", false)).toBe("Registraste tu salida a comer: ¡buen provecho!");
    expect(avisoRegistro("regreso", true)).toBe("Registraste tu regreso: tu justificación quedó por aprobar.");
    expect(avisoRegistro("regreso", false)).toBe("Registraste tu regreso de comer.");
  });
});
