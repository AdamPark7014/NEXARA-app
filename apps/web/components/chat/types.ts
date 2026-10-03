export type Attachment = { url: string; name: string; mime: string; size: number };

export type ChannelKind = "PUBLIC" | "PRIVATE" | "DIRECT";

export type ChatUser = { id: number; nombre: string; email: string; avatarUrl?: string | null };

export type ChannelMember = ChatUser & { role?: string; lastReadAt?: string | null };

export type Channel = {
  id: number;
  kind: ChannelKind;
  slug: string | null;
  name: string;
  topic?: string | null;
  description?: string | null;
  peer?: ChatUser | null;
  members?: ChannelMember[];
  memberCount: number;
  lastMessageAt?: string | null;
  lastMessagePreview?: string | null;
  unread?: boolean;
  unreadCount?: number;
  lastReadAt?: string | null;
  muted?: boolean;
  mutedUntil?: string | null;
  /** Vista por jerarquía (dueño / supervisor), no membresía propia */
  supervised?: boolean;
  readOnly?: boolean;
};

export type ReactionUser = { id: number; nombre: string; avatarUrl?: string | null; reactedAt?: string | null };

export type Reaction = { emoji: string; count: number; userIds: number[]; users?: ReactionUser[] };

export type MentionEntity = {
  kind: "USER" | "ACTIVITY" | "EVIDENCE";
  id: number;
  label: string;
  subtitle: string;
  href?: string;
};

export type ReceiptState = "sent" | "delivered" | "read";

export type MessageReceipt = {
  state: ReceiptState;
  readCount: number;
  recipientCount: number;
};

export type ReadPerson = {
  id: number;
  nombre: string;
  avatarUrl: string | null;
  readAt?: string;
  delivered?: boolean;
};

export type Message = {
  id: number;
  channelId: number;
  authorId: number;
  parentId: number | null;
  kind: string;
  body: string;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  pinnedAt?: string | null;
  editedAt?: string | null;
  createdAt: string;
  author: ChatUser;
  replyCount: number;
  reactions: Reaction[];
  channel?: { id: number; name: string; kind: ChannelKind; slug: string | null };
  receipt?: MessageReceipt | null;
  /** Cita del mensaje padre cuando ese mensaje ya se eliminó. */
  replyTo?: { id: number; deleted: true; body: string } | null;
  /** Marcador local del hilo abierto: el original ya no está en la lista. */
  deleted?: boolean;
  /** Optimistic client id until server ack */
  clientMsgId?: string;
  pending?: boolean;
  failed?: boolean;
};

export type DeletedPayload = {
  id: number;
  channelId: number;
  parentId?: number | null;
  authorId?: number;
  createdAt?: string;
  lastMessagePreview?: string | null;
  lastMessageAt?: string | null;
};

export type SearchScope = "channel" | "all";
