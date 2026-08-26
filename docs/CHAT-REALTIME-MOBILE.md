# Chat realtime — mobile (Android)

## API transport

The backend exposes **Socket.IO** (not REST SSE) via `RealtimeGateway` at the same origin as the API (`apiAssetOrigin()` / `/socket.io`).

REST `GET /chat/channels/:id/messages` supports pagination with `beforeId` and `aroundId` only — there is **no `sinceId`** query param. Incremental polling on mobile filters the latest page client-side by message `id`.

Typing indicators are **socket-only**: emit `chat:typing`, listen for `chat:typing`. No HTTP typing endpoint exists.

## Web parity (`WorkspaceChat.tsx`)

| Event | Direction | Purpose |
|-------|-----------|---------|
| `chat:join` | client → server | Join room `chat:{channelId}` (membership verified server-side) |
| `chat:leave` | client → server | Leave channel room |
| `chat:typing` | bidirectional | Typing indicator |
| `chat:presence` | client → server | `online` / `away` (company-scoped broadcast) |
| `chat:message` | server → client | New message |
| `chat:message-updated` | server → client | Edit / pin / reactions |
| `chat:message-deleted` | server → client | Deleted message |
| `chat:channel-activity` | server → client | Unread bump for non-active channels |
| `chat:channel-updated` | server → client | Topic changes |
| `chat:members-changed` | server → client | Membership changes |

Auth: JWT in handshake `auth.token` (already used by `RealtimeClient`).

## Mobile implementation (this change)

- **`RealtimeClient` / `RealtimeBus`**: extended to subscribe to chat socket events (same connection as `entity:updated`).
- **`ChatViewModel`**: merges `chat:message` / `chat:message-updated`, handles `chat:channel-activity`, emits typing, joins/leaves channel rooms.
- **Polling fallback**: every **3s** while screen is **RESUMED** (`LifecycleEventObserver`), calls `pollNewMessages()` which merges only messages with `id > maxKnownId`.
- **Background**: polling stops on `ON_PAUSE`; presence set to `away`.

## Future mobile work (not in this PR)

- Handle `chat:message-deleted`, `chat:members-changed`, `chat:channel-updated` in UI.
- Optional: dedicated `ChatRealtimeRepository` with reconnect backoff and optimistic sends.
- Backend: add `sinceId` (or `afterId`) to `listMessages` to avoid re-fetching the latest page on poll.
