import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MembersPanel, ThreadPanel } from "./ChatSidePanel";
import type { MessageListCtx } from "./MessageList";
import type { Channel, Message } from "./types";
import styles from "../WorkspaceChat.module.css";

const general: Channel = {
  id: 1,
  kind: "PUBLIC",
  slug: "general",
  name: "General",
  memberCount: 4,
  members: [{ id: 1, nombre: "Ana Ruiz", email: "ana@empresa.test", role: "owner" }],
};

function subtituloDe(titulo: string): HTMLElement {
  return screen.getByRole("heading", { name: titulo }).nextElementSibling as HTMLElement;
}

function panelMiembros(canal: Channel) {
  render(
    <MembersPanel
      detail={canal}
      currentUserId={1}
      presence={{}}
      onClose={vi.fn()}
      onInvite={vi.fn()}
      onOpenDm={vi.fn()}
    />,
  );
}

describe("ChatSidePanel", () => {
  it("el canal y los miembros son dos datos, y la cuenta dice «miembros»", () => {
    panelMiembros(general);

    expect(screen.getByRole("button", { name: "Volver al canal" })).toHaveTextContent("‹ Chat");
    expect(screen.getByRole("button", { name: "Invitar" })).toBeInTheDocument();

    const datos = [...subtituloDe("Miembros").querySelectorAll(`.${styles.panelSubDato}`)].map((n) =>
      n.textContent?.replace(/\s+/g, " ").trim(),
    );
    expect(datos).toEqual(["#General", "4 miembros"]);
    // El « · » de escritorio no se lee en voz alta; en teléfono se oculta y cada dato baja de renglón.
    expect(subtituloDe("Miembros").querySelector(`.${styles.panelSubSep}`)).toHaveAttribute("aria-hidden", "true");
  });

  it("con una persona dice «1 miembro»", () => {
    panelMiembros({ ...general, memberCount: 1 });
    const datos = [...subtituloDe("Miembros").querySelectorAll(`.${styles.panelSubDato}`)].map((n) =>
      n.textContent?.trim(),
    );
    expect(datos[1]).toBe("1 miembro");
  });

  it("el hilo nombra el canal y conserva la vuelta", () => {
    const root: Message = {
      id: 10,
      channelId: 1,
      authorId: 2,
      parentId: null,
      kind: "TEXT",
      body: "Hola",
      createdAt: new Date().toISOString(),
      author: { id: 2, nombre: "Luis Mora", email: "luis@empresa.test" },
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

    expect(screen.getByRole("button", { name: "Volver al canal" })).toHaveTextContent("‹ Chat");
    expect(subtituloDe("Hilo")).toHaveTextContent("#General");
  });
});
