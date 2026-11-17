# Micélio Companion — Universal AI Control Protocol (UACP) v0.1

## Purpose

The Companion is an independent visual body. Any explicitly connected AI or agent may request that it look toward, approach, or point at a screen element. The AI remains responsible for perception and reasoning; the Companion owns animation, placement, accessibility constraints, and user consent.

This protocol is provider-neutral. Gemini, ChatGPT, Claude, local models, and Micélio agents can implement the same adapter. No provider receives privileged control merely because it is named in the client.

## Architecture

```text
AI provider / agent
  -> provider adapter (MCP tool, function calling, SDK, or HTTP client)
  -> authenticated Companion Gateway
  -> schema + permission + freshness validation
  -> command arbitration (one active controller lease)
  -> Android Companion local motion engine
  -> on-screen mushroom / pointer

Existing authorized screen-share / vision pipeline
  -> screen observations + normalized targets
  -> Companion Gateway
  -> target selection / local motion engine
```

The gateway is a transport and policy boundary, not another vision model. Reuse an existing authorized screen stream when one is available. Never claim screen access merely because an AI has connected.

## Core principles

1. **Provider-neutral:** integrations use the same versioned JSON schema.
2. **Opt-in connection:** the user approves each AI/provider and can revoke it.
3. **One controller at a time:** a short-lived control lease prevents competing agents from pulling the Companion in different directions.
4. **Observe before directing:** a target must be grounded in a recent observation from the current screen session.
5. **No silent actions:** v0.1 supports movement, pointing, highlighting, and optional explanation. It does not click, type, submit forms, purchase, delete, install, or change settings.
6. **Local animation:** interpolate movement on-device; never call an AI for every animation frame.
7. **Fail closed:** stale observations, expired leases, invalid coordinates, low confidence, disconnected vision, or revoked permission cause the Companion to stop following targets.
8. **Privacy:** do not persist screenshots, audio, or raw screen text by default. Keep only minimal operational metadata needed for the active session.

## Connection and authentication

Each integration is registered by the user and receives a revocable, provider-scoped credential. Store credentials in the platform's secure secret store; never put them in a public web page, source repository, prompt, or URL.

A provider adapter must identify:
- `provider_id`: stable provider/agent identifier;
- `display_name`: user-visible name;
- `protocol_version`: for example `uacp/0.1`;
- requested capabilities: `observe_targets`, `move`, `point`, `explain`.

The user can see the connected provider, current controller, granted capabilities, and revoke access. A provider can request a lease but cannot silently grant itself one.

## Message envelope

All messages are JSON objects with:
- `protocol`: `uacp/0.1`;
- `type`: message type;
- `message_id`: unique identifier;
- `session_id`: active Companion session;
- `sent_at`: ISO-8601 timestamp;
- `provider_id`: authenticated provider identity.

Reject unknown protocol versions and messages whose authenticated identity does not match `provider_id`.

## Screen observation event

The trusted screen/vision adapter (not arbitrary text from an AI) publishes current targets:

```json
{
  "protocol": "uacp/0.1",
  "type": "screen.targets",
  "message_id": "msg_01",
  "session_id": "session_01",
  "sent_at": "2026-11-17T19:00:00Z",
  "captured_at": "2026-11-17T19:00:00Z",
  "screen": { "width": 1080, "height": 2400, "orientation": "portrait" },
  "targets": [
    {
      "target_id": "target_send",
      "label": "Enviar",
      "kind": "button",
      "x": 0.82,
      "y": 0.91,
      "width": 0.14,
      "height": 0.06,
      "confidence": 0.96
    }
  ]
}
```

Coordinates are normalized to the active screen (0..1), with x/y as the bounding-box top-left. The Companion converts them to device coordinates. Targets must come from a currently authorized screen session. Apply a configurable freshness limit (initial default: 2 seconds) and confidence threshold (initial default: 0.70); discard expired or out-of-range targets.

## Control lease

A connected provider requests control with `control.acquire`. The user must approve it unless they have explicitly enabled a remembered grant for that provider. The gateway grants one short lease at a time (initial default: 15 seconds, renewable while permitted). Other providers may observe only if separately authorized; they cannot issue movement commands while another provider owns the lease.

A lease contains an opaque `lease_id`, expiry timestamp, and granted capabilities. Revocation, expiry, app pause, screen-session end, or user drag immediately cancels it.

## Movement command

```json
{
  "protocol": "uacp/0.1",
  "type": "companion.move_to_target",
  "message_id": "msg_02",
  "session_id": "session_01",
  "sent_at": "2026-11-17T19:00:01Z",
  "provider_id": "gemini_adapter",
  "lease_id": "lease_opaque",
  "target_id": "target_send",
  "intent": "point",
  "duration_ms": 900,
  "explanation": "Este é o botão Enviar."
}
```

Allowed intents in v0.1: `approach`, `point`, `highlight`, `return_to_rest`. The gateway resolves `target_id` against a fresh target in the same session; do not accept arbitrary screen coordinates from a provider as a substitute for observed targets. Clamp duration and movement speed to safe local limits. The Companion may choose a nearby edge/offset so it does not cover the control.

## Acknowledgements and state

The Companion returns `command.accepted`, `command.rejected`, or `companion.state` with a reason such as `stale_target`, `no_active_vision`, `lease_required`, `permission_denied`, `provider_revoked`, `paused_by_user`, or `unsupported_action`.

Expose states: `disconnected`, `connected`, `observing`, `following`, `paused`, `vision_stale`, `revoked`.

## Multi-agent arbitration

- A single active controller lease owns movement at a time.
- The user can pin a preferred provider or choose manual control.
- If no lease exists, Companion may use local idle animation only.
- Priority never overrides user pause, revocation, or safety policy.
- On lease handoff, stop current motion, clear pending commands, then accept the new controller.
- Keep an auditable, privacy-minimal event log (provider, command type, outcome, timestamp); do not log screenshots or secrets.

## Provider adapter interface

An adapter for any AI platform needs only four operations:
1. register/connect using a user-approved credential;
2. receive the active session's permitted target summaries;
3. request/renew a control lease;
4. send a schema-valid movement intent and process its acknowledgement.

Expose the same schema through an HTTP/WebSocket gateway initially. Optional MCP tools and provider-specific function-calling wrappers should translate to this canonical protocol rather than inventing separate control APIs.

## Suggested gateway endpoints

These are interface definitions, not claims that the endpoints are deployed:
- `POST /companion/v1/providers/connect`
- `POST /companion/v1/control/lease`
- `POST /companion/v1/commands`
- `GET /companion/v1/state`
- `WS /companion/v1/stream`

All endpoints require authenticated, scoped credentials and session binding. Use TLS, rate limits, schema validation, replay protection, and revocation checks.

## Android implementation boundary

The Android service exposes a narrow local command interface:
- `setObservedTargets(sessionId, capturedAt, targets)`
- `moveToTarget(targetId, intent, durationMs)`
- `pause(reason)`
- `clearSession(sessionId)`

The motion engine remains local and smooth. Android overlay permission is required for the floating body. Screen capture, accessibility, and microphone permissions are separate capabilities and must be requested only when needed, with clear explanations. The web demo cannot overlay other Android apps.

## Acceptance tests

- Two providers cannot control the Companion simultaneously.
- A newly connected provider cannot move it until the user grants a lease.
- A valid target from the current vision session causes the Companion to approach and point.
- A target from an old page/session or older than the freshness limit is rejected.
- Revoking a provider or pressing pause stops motion immediately.
- No command can trigger clicks, typing, purchases, deletion, installation, or settings changes.
- Disconnecting the vision stream transitions to `vision_stale` and clears targets.
- Gemini's existing audio/vision flow is not duplicated; adapters consume only explicitly shared structured observations.

## Implementation status

This document defines the provider-neutral contract only. It does not mean that the gateway, provider registration, MCP adapter, WebSocket, or Android bridge has been implemented or deployed yet. The next code step is to implement the local Android target API and a gateway that validates this schema, then connect one existing vision provider end-to-end before adding more providers.


## Multi-mushroom presence and user-controlled interaction

The interface may display multiple small mushroom companions, one per connected AI/agent that has a legitimate reason to offer help. Each mushroom is a presence indicator for its provider, not an always-running independent animation or an unrestricted chat session.

### Interaction invitation lifecycle

1. A connected provider may submit a lightweight `interaction.offer` containing its identity, a short reason, urgency class, and expiry. It must not start speaking, capture extra screen data, or move onto the user's controls merely by submitting an offer.
2. The interface groups offers and deduplicates repeated requests from the same provider/topic. It may show a subtle mushroom/presence marker or a single compact invitation.
3. The user controls interaction with one clear master button: **Autorizar interação** / **Pausar interação**. The default on a fresh install/session is OFF.
4. When OFF, providers cannot initiate conversation, animate toward the user, or receive additional screen context. They may remain connected only for explicitly permitted low-cost status/health signals. The UI must show that interaction is paused.
5. When ON, only providers granted access by the user may offer or conduct interactions, within their scoped permissions. The user may pause everything immediately, or disable/revoke one provider independently.
6. An invitation is not consent. No audio, speech, overlay movement, or screen inspection begins until the relevant permission and interaction state allow it.

### Non-intrusive presentation

- Show only a small number of mushroom indicators at once; group the rest under a count/badge or an expandable roster.
- Never cover text fields, navigation, accessibility controls, system buttons, or the target being explained. Prefer screen edges and safe areas.
- Do not steal focus, open panels automatically, vibrate, or speak unsolicited by default.
- Use a quiet visual cue for ordinary offers. Reserve stronger attention cues for user-enabled high-priority alerts.
- Respect Do Not Disturb, app foreground/background state, user activity, and manual dragging.
- Apply per-provider cooldowns, deduplication, backoff, and a global interaction rate limit. If the user dismisses an offer, suppress similar offers for a configurable period.
- If CPU, memory, battery, network, or frame-time budgets are exceeded, reduce animation, pause background polling, and collapse idle mushrooms to static indicators. Never run one model inference or network request per animation frame.
- A mushroom is rendered only while its provider has a valid connection/session and an allowed presence state; disconnected agents are not shown as active.

### Interaction statistics (privacy-minimal)

An optional statistics view may show aggregate counts such as:
- connected providers and currently authorized providers;
- offers received, accepted, dismissed, and expired;
- interactions started and completed;
- average response delay and user pause/revoke counts;
- resource budget state (battery/CPU/network) in coarse categories.

Statistics are OFF unless the user enables them. Prefer on-device aggregation, short retention, and no content collection. Do not record screenshots, audio, message bodies, typed text, precise browsing history, or sensitive inferences. Provide a clear reset/delete control. Never share statistics with providers or third parties unless the user explicitly exports them.

### Additional event examples

An offer is a request, not a command:

```json
{
  "protocol": "uacp/0.1",
  "type": "interaction.offer",
  "message_id": "offer_01",
  "session_id": "session_01",
  "sent_at": "2026-11-17T19:00:00Z",
  "provider_id": "agent_helper",
  "display_name": "Assistente de navegação",
  "reason": "Posso explicar este aviso que apareceu.",
  "priority": "normal",
  "expires_at": "2026-11-17T19:00:30Z"
}
```

The client may respond with `interaction.accept`, `interaction.dismiss`, or `interaction.expire`. Accept is valid only while the master interaction switch is ON and the provider is authorized. Dismissal triggers cooldown/deduplication.

### Acceptance tests for multi-mushroom mode

- Fresh install/session starts with interaction OFF.
- Multiple providers can appear as quiet, grouped invitations without taking control.
- A single master switch pauses all interactive behavior immediately.
- Turning interaction ON does not authorize a provider that the user has not approved.
- Dismissing one offer does not cause repeated popups from that provider/topic during its cooldown.
- Excess providers are grouped; the interface never floods the screen with mushrooms.
- Idle agents do not continuously poll, animate at high frame rates, or invoke models.
- Statistics remain disabled until explicitly enabled and contain no conversation or screen content.
- User pause, provider revoke, or session end stops motion/speech and clears pending offers.
