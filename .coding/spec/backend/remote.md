# Remote Control Guidelines (`src/main/remote/`)

> Feishu/Slack/WebSocket/stdio channels feed a router that maps external conversations to
> `SessionManager` sessions and streams agent output back. The two-layer id translation is
> the load-bearing part — get it wrong and multi-turn continuation breaks (issue #291).

---

## Channel abstraction

When it applies: adding or modifying a remote channel.

`ChannelBase extends EventEmitter implements IChannel` (`channels/channel-base.ts:17`) is the
base class. Subclasses supply `type: ChannelType`, `start()`, `stop()`, `send(response)`.
The base provides `emitMessage(message)` (`:63`), `splitMessage(text, maxLength=4000)`
(`:135`), `generateMessageId()` (`:182`), plus a standalone `withRetry<T>` helper (`:190`).

`ChannelType` (`types.ts:80`): `feishu | wechat | telegram | dingtalk | websocket | slack |
stdio`. Only `feishu`, `slack`, `stdio` are implemented (`channels/feishu/*`,
`channels/slack/*`, `channels/stdio-channel.ts`); the rest are declared but unregistered
(`registerChannels` has a `TODO` for WeChat/Telegram/DingTalk).

---

## MessageRouter — sessions, queueing, cwd parsing

When it applies: routing an inbound message to an agent turn.

`MessageRouter` (`message-router.ts:43`) computes a session key:
`channelType:group:channelId` for groups, `channelType:dm:senderId` for DMs
(`:150-152`). It generates router-side ids `remote-${Date.now()}-${counter}` (`:208`),
keeps a **per-session FIFO queue** (`messageQueues`) guarded by a processing mutex
(`processingSession` Set, `:51`, `:234`), and parses `[cwd:path]` / `!cd path` directives
out of message text to set the working directory.

---

## RemoteManager — the four id maps (CRITICAL)

When it applies: any change to session lifecycle in remote mode.

`RemoteManager extends EventEmitter` (`remote-manager.ts:63`), singleton `remoteManager`.
It owns a `RemoteGateway` + `MessageRouter` and maintains a translation between the actual
`SessionManager` UUID and the router-side `remote-*` id via **four maps plus one Set**:

| Field                             | Direction                           | Purpose                               |
| --------------------------------- | ----------------------------------- | ------------------------------------- |
| `sessionIdMapping` (`:73`)        | actualId → remoteId                 | forward lookup                        |
| `reverseSessionIdMapping` (`:76`) | remoteId → actualId                 | resolve continuation target           |
| `sessionChannelMapping` (`:79`)   | remoteId → {channelType, channelId} | route responses back                  |
| `sessionOwnerMapping` (`:83`)     | remoteId → senderId                 | anti-hijack owner check               |
| `remoteSessionIds` (`:70`)        | Set of remoteIds                    | **add-only**; "have we started this?" |

`executeAgent` (`:1253`) picks `startSession` vs `continueSession` purely on
`!this.remoteSessionIds.has(sessionId)` (`:1272`). On new session it populates all four maps

- the Set in one place (`:1283-1293`).

### Per-turn cleanup vs teardown — DO NOT conflate

- `clearSessionBuffer(actualSessionId)` (`:1107`) is **PER-TURN**. It runs on every
  `session.status` idle/error and clears ONLY ephemeral buffers (`responseBuffers`,
  `sentMessageHashes`, `sendTimers`). It must **NOT** touch the id maps.
- `removeRemoteSession(actualSessionId)` (`:1138`) is **genuine TEARDOWN**. It deletes all
  four maps + `remoteSessionIds` in lockstep (`:1142-1149`).
- `clearRemoteSession(remoteSessionId)` (`:518`) takes the **router-side** id, resolves it
  via `reverseSessionIdMapping`, and delegates to `removeRemoteSession`.

**Regression history (issue #291)**: conflating these left `remoteSessionIds` (add-only)
pointing at a session whose `reverseSessionIdMapping` entry had been deleted, so the next
turn saw `isNewSession === false` but failed to resolve the actual id and threw
"No actual session ID found for remote session". The rationale is documented inline at
`:1113-1119`.

---

## Gateway — HTTP + WebSocket + auth

`RemoteGateway extends EventEmitter` (`gateway.ts:41`) serves HTTP endpoints `/health`
(and `/`), `/status`, and `/webhook/<channel>` (`handleHttpRequest`, `:579`), plus a
WebSocket control plane (`ws`). Authorization is checked **first**, before any interceptor
(`checkAuthorization`, `:338`), with modes:

- `token` — WebSocket clients only; **denies** channel messages.
- `allowlist` — empty allowlist means **deny all** (`:347`); matches `channelType:userId`
  or bare `userId`.
- `pairing` — must be in `pairedUsers`; unknown users trigger a pairing request.
- `open` — allow all.

Group messages require an `@mention` (`shouldProcessGroupMessage`).

---

## Owner verification (anti-hijack)

Interaction responses (e.g. permission replies from a channel) must pass owner
verification: `RemoteManager` rejects responses whose `senderId` differs from the stored
`ownerSenderId` (`:823-825`). Preserve this check when adding interactive flows.

---

## Adding a channel (checklist)

1. Subclass `ChannelBase`, implement `type`/`start`/`stop`/`send`.
2. Add the `ChannelType` literal in `types.ts:80`.
3. Register it in `RemoteManager.registerChannels` (`:1187`), **gated on config presence**
   (Feishu needs `appId`+`appSecret`; Slack needs `botToken`).
4. Wire the `webhook:<channel>` handler if the channel uses webhooks.
5. Groups need `@mention` handling.

Anti-patterns:

- Conflating `clearSessionBuffer` (per-turn) with `removeRemoteSession` (teardown) — issue #291.
- Exposing `remote-*` ids to `SessionManager`, or actual UUIDs to channels — always translate.
- Skipping owner verification on interaction responses (hijack risk).
