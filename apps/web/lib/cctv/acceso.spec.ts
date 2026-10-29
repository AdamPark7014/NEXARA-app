import { describe, expect, it } from "vitest";
import { ORG_EMAILS } from "@/lib/activity-kinds";
import { veDisenadorCctv } from "./acceso";

const quien = (roleKey: string, email?: string) => ({ roleKey, email });

describe("quién lleva el diseñador de videovigilancia en su menú", () => {
  it("encargados de área y arquitecto sí", () => {
    expect(veDisenadorCctv(quien("coord_operaciones", ORG_EMAILS.david))).toBe(true);
    expect(veDisenadorCctv(quien("arquitecto", ORG_EMAILS.josue))).toBe(true);
    expect(veDisenadorCctv(quien("administrativo", ORG_EMAILS.daniela))).toBe(true);
    expect(veDisenadorCctv(quien("ceo"))).toBe(true);
    expect(veDisenadorCctv(quien("enc_soporte"))).toBe(true);
  });

  it("soporte solo su encargado (José Antonio); instaladores nunca", () => {
    expect(veDisenadorCctv(quien("ing_soporte", ORG_EMAILS.antonio))).toBe(true);
    expect(veDisenadorCctv(quien("ing_soporte", "soporte@nexara.com.mx"))).toBe(false);
    expect(veDisenadorCctv(quien("ing_campo", "infraestructura@nexara.com.mx"))).toBe(false);
    expect(veDisenadorCctv(quien("vendedor"))).toBe(false);
    expect(veDisenadorCctv(null)).toBe(false);
  });
});
