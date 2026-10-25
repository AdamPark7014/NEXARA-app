import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MembersPanel, ThreadPanel } from "./ChatSidePanel";
import type { MessageListCtx } from "./MessageList";
import type { Channel, Message } from "./types";

/** Lo que el panel decía antes: vuelta con flecha larga, y canal y miembros en un solo renglón. */
const TEXTO_VIEJO_VUELTA = "← Chat";
const TEXTO_VIEJO_RENGLON = "General · 4";

const general: Channel = {
  id: 1,
  kind: "PUBLIC",
  slug: "general",
  name: "General",
  memberCount: 4,
  members: [{ id: 1, nombre: "Adam Pozos", email: "adam@nexara.mx", role: "owner" }],
};

function renglones(sub: HTMLElement): string[] {
  return sub.innerHTML.split(/<br\s*\/?>/i).map((parte) => parte.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());
}

describe("ChatSidePanel", () => {
  it("pone un dato por renglón y la vuelta «‹ Chat», y cita el texto viejo", () => {
    render(
      <MembersPanel
        detail={general}
        currentUserId={1}
        presence={{}}
        onClose={vi.fn()}
        onInvite={vi.fn()}
        onOpenDm={vi.fn()}
      />,
    );

    const vuelta = screen.getByRole("button", { name: "Volver al canal" });
    expect(vuelta).toHaveTextContent("‹ Chat");
    expect(vuelta.textContent).not.toContain(TEXTO_VIEJO_VUELTA);

    expect(screen.getByRole("heading", { name: "Miembros" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Invitar" })).toBeInTheDocument();

    const sub = screen.getByRole("heading", { name: "Miembros" }).nextElementSibling as HTMLElement;
    const lineas = renglones(sub);
    expect(lineas).toHaveLength(2);
    expect(lineas[0]).toContain("General");
    expect(lineas[0]).not.toContain("4");
    expect(lineas[1]).toBe("4");
    expect(sub.textContent?.replace(/\s+/g, " ")).not.toContain(TEXTO_VIEJO_RENGLON);

    cleanup();

    const root: Message = {
      id: 10,
      channelId: 1,
      authorId: 2,
      parentId: null,
      kind: "TEXT",
      body: "Hola",
      createdAt: new Date().toISOString(),
      author: { id: 2, nombre: "Laura Méndez", email: "laura@nexara.mx" },
      replyCount: 0,
      reactions: [],
    };
    const ctx = {
      currentUserId: 1,
      token: "tkn",
      readOnly: false,
      canDeleteMessages: false,
      highlightId: null,
      editingId: null,
      editDraft: "",
      onEditDraft: vi.fn(),
      onStartEdit: vi.fn(),
      onSaveEdit: vi.fn(),
      onCancelEdit: vi.fn(),
      onReact: vi.fn(),
      onOpenReactions: vi.fn(),
      hoveredReaction: null,
      onHoverReaction: vi.fn(),
      emojiPickerFor: null,
      onEmojiPickerFor: vi.fn(),
      onOpenThread: vi.fn(),
      onTogglePin: vi.fn(),
      onOpenReadInfo: vi.fn(),
      onAskDelete: vi.fn(),
    } satisfies MessageListCtx;

    render(
      <ThreadPanel detail={general} root={root} replies={[]} ctx={ctx} onClose={vi.fn()} composer={<div>redactor</div>} />,
    );

    expect(screen.getByRole("heading", { name: "Hilo" })).toBeInTheDocument();
    const vueltaHilo = screen.getByRole("button", { name: "Volver al canal" });
    expect(vueltaHilo).toHaveTextContent("‹ Chat");
    expect(vueltaHilo.textContent).not.toContain(TEXTO_VIEJO_VUELTA);
    const subHilo = screen.getByRole("heading", { name: "Hilo" }).nextElementSibling as HTMLElement;
    expect(subHilo.textContent).toContain("General");
    expect(subHilo.textContent).not.toContain(TEXTO_VIEJO_RENGLON);
    expect(subHilo.querySelector("br")).toBeNull();
  });
});
