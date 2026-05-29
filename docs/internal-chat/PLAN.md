# Internal Chat System — Architecture Plan

> Goal: each operator logs in with **username + password** (no API
> key, no phone number), lands on a WhatsApp-clone UI, and chats in
> real time with every other operator on the same OpenWA instance.
> Imported WhatsApp group history also surfaces under their account.

---

## Status legend

✅ delivered in this skeleton · 🟡 stub (compiles, marked `TODO`) ·
⏳ deferred to a later phase.

---

## Phase split

| Phase | Scope | Status |
|---|---|---|
| **1** | Users + username/password auth + JWT + Login page rewrite | 🟡 skeleton |
| **2** | Internal chat tables + WebSocket + WhatsApp-style 3-column UI | 🟡 skeleton |
| **3** | Bind imported WhatsApp groups to internal users | ⏳ |

This document is the working contract for all three; everything below
is what the skeleton lays down so a future session (or a human) can
fill in the bodies without redesigning anything.

---

## Phase 1 — Users + auth (skeleton)

### Backend (`src/modules/users/`)

```
users.module.ts            ✅ registers UsersService, UsersController, JwtStrategy
users.service.ts           🟡 createUser / findByUsername / verifyPassword (bcrypt)
users.controller.ts        🟡 GET /me, POST /register (admin), GET /users (admin)
auth-login.controller.ts   🟡 POST /api/auth/login  → { token, user }
jwt.strategy.ts            🟡 Passport JWT strategy reading bearer or cookie
entities/user.entity.ts    ✅ id, username, passwordHash, displayName,
                              role (admin|operator|viewer), avatarUrl, createdAt
dto/                       ✅ Register, Login, UpdateProfile
```

### Auth changes

- **Existing API-key auth stays for the public REST API.** Internal
  chat endpoints accept JWT bearer (cookie or `Authorization: Bearer`).
- `JwtAuthGuard` is the new default for `/api/chat/**`.
- Session in browser: HttpOnly cookie `owa_jwt`, signed with
  `JWT_SECRET` (already in `.env`).

### Dashboard

```
pages/InternalLogin.tsx    🟡 username + password form, POSTs /api/auth/login
pages/Users.tsx            🟡 admin-only list / create / delete users
hooks/useCurrentUser.ts    🟡 reads /api/users/me with JWT cookie
```

The existing `Login.tsx` stays for API-key entry — admins still need
it during first bootstrap. We add a "Sign in with account" link.

---

## Phase 2 — internal chat (skeleton)

### Backend (`src/modules/chat/`)

```
chat.module.ts             ✅
chat.controller.ts         🟡 REST: list chats, list messages, mark read
chat.service.ts            🟡 createDirectChat, createGroupChat, sendMessage
chat.gateway.ts            🟡 WebSocket: rooms = chat:<chatId>; events:
                              - message:new
                              - message:read
                              - typing
                              - presence
entities/
  chat.entity.ts           ✅ id, type ('direct'|'group'), name?, avatarUrl?
  chat-participant.entity.ts ✅ chatId, userId, role, joinedAt, lastReadAt
  chat-message.entity.ts   ✅ id, chatId, senderId, body, type, mediaUrl?,
                              replyToId?, createdAt, editedAt?, deletedAt?
dto/                       ✅ SendMessage, CreateGroup, AddParticipants
```

### Real-time protocol

| Client emits | Server emits |
|---|---|
| `subscribe { chatId }` | `presence { userId, online: true/false }` |
| `unsubscribe { chatId }` | `message:new { message }` |
| `typing { chatId, isTyping }` | `typing { userId, chatId, isTyping }` |
| `read { chatId, upToMessageId }` | `message:read { userId, chatId, upToMessageId }` |

Authentication on the socket handshake: JWT cookie or
`auth.token` from socket.io options.

### Dashboard (`src/pages/Chat/`)

```
ChatPage.tsx               🟡 three-column shell, responsive (mobile = single column)
components/
  ChatSidebar.tsx          🟡 left column: list of chats, search, new-chat button
  ChatHeader.tsx           🟡 top of middle: title, member count, RTL-aware
  MessageList.tsx          🟡 virtualised (react-window), grouped by date,
                              right-aligned for own messages, left for others
  MessageBubble.tsx        🟡 reuses .iw-bubble (already RTL-aware) + status ticks
  MessageInput.tsx         🟡 textarea + emoji + attach + send (Enter / Shift+Enter)
  NewChatModal.tsx         🟡 pick users (fuse.js search) -> direct or group
hooks/useChatSocket.ts     🟡 wraps socket.io-client, exposes useChat(chatId)
```

Route: `/chat` (default landing after login) and `/chat/:chatId`.

### What "looks like WhatsApp" means in this build

- 3-column desktop layout (sidebar / messages / optional info panel),
  collapses to single column on `<768px`.
- Bubbles with tail, green for own, white for others (`#dcf8c6`).
- Grouped by day with sticky date dividers ("Today", "Yesterday", date).
- Read receipts (✓ sent, ✓✓ delivered, ✓✓ blue read).
- Typing indicator under chat name.
- Online dot in sidebar.
- Search messages within a chat (top-right magnifier).
- RTL detection per-message (already implemented in `ChatViewer`).

Things deliberately **not** in this phase:
- Voice/video calls.
- Stories / status.
- End-to-end encryption (this is an internal app — TLS is enough).
- Forwarding to real WhatsApp (would need engine plugin work).

---

## Phase 3 — bind imports (deferred)

When done: `ImportService.confirm()` resolves
`userMapping[senderName]` to a real `users.id` (today it creates a
viewer API key). The imported chat then shows up in the user's
sidebar like any other chat, but **read-only** (no Send button).

This phase is intentionally last so we don't churn the import code
twice.

---

## Files added in this skeleton commit

```
docs/internal-chat/PLAN.md                       (this file)

src/modules/users/
  users.module.ts
  users.service.ts
  users.controller.ts
  auth-login.controller.ts
  jwt.strategy.ts
  entities/user.entity.ts
  dto/{register.dto.ts,login.dto.ts,update-user.dto.ts}

src/modules/chat/
  chat.module.ts
  chat.controller.ts
  chat.service.ts
  chat.gateway.ts
  entities/{chat.entity.ts,chat-participant.entity.ts,chat-message.entity.ts}
  dto/{send-message.dto.ts,create-chat.dto.ts}

src/common/guards/jwt-auth.guard.ts

dashboard/src/pages/
  InternalLogin.tsx
  Users.tsx
  Chat/
    ChatPage.tsx + ChatPage.css
    components/{ChatSidebar.tsx, MessageList.tsx, MessageInput.tsx, NewChatModal.tsx}
    hooks/useChatSocket.ts

dashboard/src/App.tsx                            (+ routes)
dashboard/src/components/Layout.tsx              (+ nav entries)
src/app.module.ts                                (+ modules + entity glob)
package.json                                     (+ bcryptjs, @nestjs/jwt, @nestjs/passport, passport, passport-jwt)
```

Build must stay green throughout. All TODO bodies live behind real
endpoint URLs and routes so a follow-up session can fill them in
without re-architecting.
