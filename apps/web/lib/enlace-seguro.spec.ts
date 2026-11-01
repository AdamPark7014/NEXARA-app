import { describe, expect, it } from "vitest";
import { enlaceSeguro } from "./enlace-seguro";

describe("enlaceSeguro", () => {
  it("deja pasar http(s) y rutas del sitio", () => {
    expect(enlaceSeguro("https://core.nexara.com.mx/uploads/a.pdf")).toBe("https://core.nexara.com.mx/uploads/a.pdf");
    expect(enlaceSeguro("/uploads/viaticos/123.jpg")).toBe("/uploads/viaticos/123.jpg");
    expect(enlaceSeguro("mailto:hola@nexara.com.mx")).toBe("mailto:hola@nexara.com.mx");
  });

  it("nunca vuelve enlace un javascript: ni sus variantes", () => {
    expect(enlaceSeguro("javascript:alert(1)")).toBeUndefined();
    expect(enlaceSeguro("  JavaScript:alert(1)")).toBeUndefined();
    expect(enlaceSeguro("java\tscript:alert(1)")).toBeUndefined();
    expect(enlaceSeguro("data:text/html,<script>alert(1)</script>")).toBeUndefined();
    expect(enlaceSeguro("//evil.com/x")).toBeUndefined();
    expect(enlaceSeguro("")).toBeUndefined();
    expect(enlaceSeguro(null)).toBeUndefined();
  });
});
