import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const usuario = vi.hoisted(() => ({ actual: { id: 1, permissions: ["evidences.review"] } as Record<string, unknown> }));
vi.mock("@/components/UserContext", () => ({ useUser: () => ({ token: "tok", user: usuario.actual }) }));
const erpFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/erp-api", async (original) => ({ ...(await original<typeof import("@/lib/erp-api")>()), erpFetch }));

import RevisionConIA from "./RevisionConIA";

describe("RevisionConIA", () => {
  it("quien no califica no la ve", () => {
    usuario.actual = { id: 2, permissions: [] };
    const { container } = render(<RevisionConIA activityId={5} />);
    expect(container).toBeEmptyDOMElement();
    usuario.actual = { id: 1, permissions: ["evidences.review"] };
  });

  it("muestra el veredicto, los hechos y qué hacer", async () => {
    erpFetch.mockResolvedValue({
      hechos: [
        { texto: "Se entregó 2 h después del límite.", tono: "mal" },
        { texto: "Calificación: aprobada, 5 de 5.", tono: "neutro" },
      ],
      ia: { veredicto: "incorrecta", calificacionSugerida: 3, porque: ["Se entregó tarde y tiene 5."], incidencias: ["Retraso de 2 h."], recomendacion: "Baja la calificación a 3." },
      avisoIa: null,
    });
    render(<RevisionConIA activityId={5} />);
    await userEvent.click(screen.getByRole("button", { name: /Revisar con IA/ }));
    expect(await screen.findByText("La calificación no corresponde")).toBeInTheDocument();
    expect(screen.getByText("Calificación sugerida: 3 de 5")).toBeInTheDocument();
    expect(screen.getByText("Se entregó 2 h después del límite.")).toBeInTheDocument();
    expect(screen.getByText("Baja la calificación a 3.")).toBeInTheDocument();
    expect(erpFetch).toHaveBeenCalledWith("ai/revision/actividad/5", "tok", { method: "POST" });
  });
});
