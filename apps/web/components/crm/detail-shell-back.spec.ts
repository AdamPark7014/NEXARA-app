import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * La vuelta de las tres fichas comerciales decía «← …».
 * El ángulo «‹» es el mismo que ya usa la ficha de actividad.
 * El título de la ficha y el href de regreso no se tocan.
 */
const fichas = [
  {
    archivo: "OpportunityDetailShell.tsx",
    viejo: "← Oportunidades",
    nuevo: "‹ Oportunidades",
    href: 'href="/crm/opportunities"',
  },
  {
    archivo: "ClientDetailShell.tsx",
    viejo: "← Clientes",
    nuevo: "‹ Clientes",
    href: 'href="/crm/clients"',
  },
  {
    archivo: "ProjectDetailShell.tsx",
    viejo: "← Proyectos comerciales",
    nuevo: "‹ Proyectos comerciales",
    href: 'href="/crm/projects"',
  },
] as const;

describe("vuelta de las fichas comerciales", () => {
  it("deja «‹» y ya no usa la flecha vieja «←»", () => {
    for (const ficha of fichas) {
      const src = readFileSync(join(__dirname, ficha.archivo), "utf8");
      expect(src, ficha.viejo).not.toContain(ficha.viejo);
      expect(src, ficha.nuevo).toContain(ficha.nuevo);
      expect(src, ficha.href).toContain(ficha.href);
    }
  });
});
