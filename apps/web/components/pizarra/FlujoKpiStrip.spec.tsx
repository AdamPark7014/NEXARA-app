import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkflowPipeline } from "@/lib/team-board-api";
import FlujoKpiStrip from "./FlujoKpiStrip";
import s from "./FlujoKpiStrip.module.css";

vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const workflow: WorkflowPipeline = {
  assigned: 24,
  started: 20,
  evidence: 16,
  closed: 21,
  peerRejected: 1,
  slaOnTime: 18,
  slaLate: 3,
  slaPct: 86,
};

describe("FlujoKpiStrip", () => {
  it("un dato por renglón: el texto viejo juntaba las cifras en una sola línea", () => {
    const viejo = "18 a tiempo · 3 tarde";
    const { container } = render(<FlujoKpiStrip workflow={workflow} />);
    const pista = container.querySelector(`.${s.pista}`);
    expect(pista).not.toBeNull();

    const cifras = [...pista!.querySelectorAll(`.${s.dato}`)].map((el) => el.textContent);
    expect(cifras).toEqual(viejo.split(" · "));
    expect(cifras.join(" · ")).toBe(viejo);
    expect(pista!.textContent?.includes(viejo)).toBe(true);
    expect(cifras.some((c) => c === viejo)).toBe(false);

    expect(screen.getByText("86 %")).toBeInTheDocument();
    expect(screen.getByText("24")).toBeInTheDocument();
  });
});
