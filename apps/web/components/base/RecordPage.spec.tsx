import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AsideCard, EvidenceGallery, EvidencePhoto, EvidenceSlot, KeyFacts, RecordPage, RecordSection, Stepper, Timeline, TimelineItem } from "./RecordPage";
import { Tabs } from "./PageHead";
import { Badge } from "./piezas";

describe("RecordPage · plantilla de ficha", () => {
  it("pinta cabecera de estado (folio, estado, título, persona, metadatos), pasos, pestañas, contenido y datos clave", () => {
    render(
      <RecordPage
        breadcrumbs={[{ label: "Hoy", href: "/erp" }, { label: "Actividades", href: "/erp/actividades" }, { label: "AN-0031" }]}
        code="AN-0031"
        status="EN_PROCESO"
        badges={<Badge tone="success" dot>En tiempo</Badge>}
        title="Mantenimiento preventivo de DVR"
        person={{ name: "José Antonio Ramírez", role: "Técnico CCTV", presence: "online" }}
        meta={[{ label: "Sucursal Centro" }, { label: "Hoy, 10:00 a 13:00" }]}
        secondaryActions={<button type="button">Reasignar</button>}
        primaryAction={<button type="button">Revisar evidencias</button>}
        steps={[
          { id: "asignada", label: "Asignada", hint: "Ayer 18:20", state: "done" },
          { id: "sitio", label: "En sitio", hint: "Desde 10:06", state: "current" },
          { id: "revision", label: "En revisión", state: "pending" },
        ]}
        tabs={<Tabs items={[{ id: "ev", label: "Evidencias", count: 4 }]} value="ev" onChange={() => {}} ariaLabel="Secciones" />}
        facts={[{ label: "Contacto", value: "Lic. Mariana Soto", hint: "222 318 4410" }, { label: "Proyecto", value: "Póliza anual 2026" }]}
        asideActions={<button type="button">Escribir a José</button>}
      >
        <RecordSection title="Evidencias" subtitle="4 de 6 pasos">
          <p>galería</p>
        </RecordSection>
      </RecordPage>,
    );

    expect(screen.getByRole("navigation", { name: "Ruta de la página" })).toHaveTextContent("AN-0031");
    expect(screen.getByRole("heading", { level: 1, name: "Mantenimiento preventivo de DVR" })).toBeInTheDocument();
    expect(screen.getByText("En proceso")).toBeInTheDocument();
    expect(screen.getByText("En tiempo")).toBeInTheDocument();
    expect(screen.getByText("José Antonio Ramírez")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "En línea" })).toBeInTheDocument();
    expect(screen.getByText("Sucursal Centro")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revisar evidencias" })).toBeInTheDocument();

    const pasos = screen.getByRole("list", { name: "Pasos" });
    const items = within(pasos).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveAttribute("data-state", "done");
    expect(items[1]).toHaveAttribute("aria-current", "step");
    expect(items[1]).toHaveTextContent("Desde 10:06");
    expect(items[2]).toHaveAttribute("data-state", "pending");

    expect(screen.getByRole("tab", { name: /Evidencias/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Evidencias" })).toBeInTheDocument();
    expect(screen.getByText("galería")).toBeInTheDocument();

    const panel = screen.getByRole("complementary", { name: "Datos clave" });
    expect(within(panel).getByText("Contacto")).toBeInTheDocument();
    expect(within(panel).getByText("Lic. Mariana Soto")).toBeInTheDocument();
    expect(within(panel).getByText("222 318 4410")).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Escribir a José" })).toBeInTheDocument();

    // El contenido principal va antes que el panel lateral (en móvil el panel baja por CSS).
    const principal = screen.getByText("galería");
    expect(principal.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("sin datos clave ni acciones no pinta el panel lateral; acepta cabecera propia", () => {
    render(
      <RecordPage title="Registro" head={<header>cabecera propia</header>}>
        <p>contenido</p>
      </RecordPage>,
    );
    expect(screen.getByText("cabecera propia")).toBeInTheDocument();
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });
});

describe("RecordPage · galería, línea de tiempo y piezas", () => {
  it("la galería mezcla fotos (con pie e insignia) y huecos obligatorios u opcionales", async () => {
    const abrir = vi.fn();
    const subir = vi.fn();
    render(
      <EvidenceGallery>
        <EvidencePhoto src="/fotos/a.jpg" caption="DVR antes · 10:12" flag={<Badge tone="success" size="sm">Validada</Badge>} onClick={abrir} />
        <EvidencePhoto src="/fotos/b.jpg" alt="Rack" href="/fotos/b.jpg" />
        <EvidenceSlot label="Cámaras después" required onClick={subir} />
        <EvidenceSlot label="Firma del cliente" />
      </EvidenceGallery>,
    );
    await userEvent.click(screen.getByRole("button", { name: "DVR antes · 10:12" }));
    expect(abrir).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Validada")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/fotos/b.jpg");
    await userEvent.click(screen.getByRole("button", { name: /Cámaras después/ }));
    expect(subir).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Obligatorio")).toBeInTheDocument();
    expect(screen.getByText("Opcional")).toBeInTheDocument();
  });

  it("la línea de tiempo lista sucesos con meta y nota", () => {
    render(
      <Timeline>
        <TimelineItem state="current" title={<><b>José Antonio</b> subió 2 fotos</>} meta="Hace 35 min" />
        <TimelineItem title={<><b>Christian</b> comentó</>} meta="11:20" note="Revisa el respaldo." />
      </Timeline>,
    );
    const lista = screen.getByRole("list", { name: "Línea de tiempo" });
    expect(within(lista).getAllByRole("listitem")).toHaveLength(2);
    expect(within(lista).getByText("Hace 35 min")).toBeInTheDocument();
    expect(within(lista).getByText("Revisa el respaldo.")).toBeInTheDocument();
  });

  it("Stepper, KeyFacts y AsideCard se usan sueltos", () => {
    render(
      <AsideCard title="Materiales usados" actions={<button type="button">Agregar</button>}>
        <KeyFacts items={[{ label: "Vehículo", value: "NX-04" }]} />
        <Stepper ariaLabel="Flujo" steps={[{ id: "a", label: "Uno", state: "done" }, { id: "b", label: "Dos", state: "current" }]} />
      </AsideCard>,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Materiales usados" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Agregar" })).toBeInTheDocument();
    expect(screen.getByText("Vehículo")).toBeInTheDocument();
    expect(screen.getByText("NX-04")).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Flujo" })).getAllByRole("listitem")).toHaveLength(2);
  });
});
