import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MessageList, { type MessageListCtx } from "./MessageList";
import type { Message } from "./types";

/** El pie del mensaje iba en un solo renglón: «3 respuestas · Ver hilo». En la web, «3 respuestas» junto a «Ver hilo». */
const TEXTO_VIEJO = "3 respuestas · Ver hilo";

function mensaje(parcial: Partial<Message> & Pick<Message, "id" | "replyCount">): Message {
  return {
    channelId: 1,
    authorId: 6,
    parentId: null,
    kind: "TEXT",
    body: "Revisar las cámaras del lobby",
    createdAt: "2026-10-25T15:04:00.000Z",
    author: { id: 6, nombre: "Laura Méndez", email: "laura@nexara.mx" },
    reactions: [],
    ...parcial,
  };
}

function ctx(onOpenThread: MessageListCtx["onOpenThread"]): MessageListCtx {
  return {
    currentUserId: 5,
    token: "tkn",
    readOnly: true,
    canDeleteMessages: false,
    highlightId: null,
    editingId: null,
    editDraft: "",
    onEditDraft: () => {},
    onStartEdit: () => {},
    onSaveEdit: () => {},
    onCancelEdit: () => {},
    onReact: () => {},
    onOpenReactions: () => {},
    hoveredReaction: null,
    onHoverReaction: () => {},
    emojiPickerFor: null,
    onEmojiPickerFor: () => {},
    onOpenThread,
    onTogglePin: () => {},
    onOpenReadInfo: () => {},
    onAskDelete: () => {},
  };
}

describe("MessageList · hilo", () => {
  it("separa la cuenta de «Ver hilo» y el botón sigue abriendo el hilo", () => {
    const onOpenThread = vi.fn();
    const raiz = mensaje({ id: 100, replyCount: 3 });
    const una = mensaje({ id: 101, replyCount: 1, body: "Listo el lobby" });
    render(<MessageList list={[raiz, una]} ctx={ctx(onOpenThread)} />);

    const boton = screen.getByRole("button", { name: /3 respuestas/ });
    expect(boton.textContent?.replace(/\s+/g, " ")).not.toContain(TEXTO_VIEJO);
    const cuenta = boton.querySelector("strong");
    const ver = boton.querySelector("span > span");
    expect(cuenta?.textContent?.replace(/\s+/g, " ").trim()).toBe("3 respuestas");
    expect(ver?.textContent).toBe("Ver hilo");
    expect(cuenta?.nextElementSibling?.tagName).toBe("BR");
    expect(cuenta?.nextElementSibling?.nextElementSibling).toBe(ver);

    fireEvent.click(boton);
    expect(onOpenThread).toHaveBeenCalledTimes(1);
    expect(onOpenThread).toHaveBeenCalledWith(raiz);

    const singular = screen.getByRole("button", { name: /1 respuesta/ });
    expect(singular.querySelector("strong")?.textContent?.replace(/\s+/g, " ").trim()).toBe("1 respuesta");
    expect(singular.textContent).not.toContain("1 respuestas");
  });
});
