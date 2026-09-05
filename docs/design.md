# The Lenny Growth Assistant — Frontend Design

## 1. Information Architecture

```
┌────────────────────────────────────────────────────────────────┐
│ App shell (full viewport, dark slate theme)                    │
│ ┌───────────────────────────────┬──────────────────────────────┐ │
│ │ LEFT PANE (chat, 50%)        │ RIGHT PANE (artifact, 50%)   │ │
│ │ ┌───────────────────────────┐ │ ┌──────────────────────────┐ │ │
│ │ │ Header                    │ │ │ Artifact Viewer header   │ │ │
│ │ │  · Title                  │ │ │  · title + Collapse btn  │ │ │
│ │ │  · Model selector:        │ │ └──────────────────────────┘ │ │
│ │ │    [Ollama|Claude|OpenAI] │ │ ┌──────────────────────────┐ │ │
│ │ │    [Standard|Ship 30]     │ │ │ SandboxedIframe          │ │ │
│ │ ├───────────────────────────┤ │ │  (DOMPurify + iframe     │ │ │
│ │ │ Message list (scrollable) │ │ │   sandbox="allow-scripts")│ │ │
│ │ │  · user/assistant bubbles │ │ └──────────────────────────┘ │ │
│ │ │  · source citation chips  │ └──────────────────────────────┘ │
│ │ ├───────────────────────────┤                                  │
│ │ │ Composer (textarea+Send)  │                                  │
│ │ └───────────────────────────┘                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 1.1 Layout Rules

- Default: left pane **50%**, right pane hidden (artifact absent).
- Right pane (artifact present): both panes **50%**; left shrinks with a 300ms
  width transition.
- Right pane is a **collapsible drawer**: `✕ Collapse` hides it; a *new*
  artifact re-opens it automatically.
- Left pane without artifact: **100% width**, full focus on conversation.

### 1.2 Model Switcher

- Two segmented groups in the chat header:
  - **Model:** Ollama Local · Claude Cloud · OpenAI Cloud (per-request routing).
  - **Skill:** Standard QA · Ship 30 for 30 Essay.
- Switching mid-stream is disabled (prevents provider/mode ambiguity); the
  switch applies to the next message.

## 2. Interactive UI States

| State | Trigger | Visual Behavior |
| --- | --- | --- |
| **Streaming (typing)** | `token` SSE events arriving | Empty assistant bubble shows three pulsing dots (`aria-live="polite"`); content streams in token-by-token; input shows **Stop** instead of **Send** |
| **Empty retrieval** | No chunk ≥ 0.65 similarity | Assistant bubble renders the exact fallback text; **no** source chips are shown |
| **Sources received** | `sources` SSE event | Green citation chips under the bubble: `Episode · Guest · timestamp (N% match)` |
| **Artifact loading** | `<artifact>` tag detected, iframe `onLoad` not fired | Artifact pane header + "Rendering artifact…" shimmer |
| **Artifact rendered** | iframe `onLoad` | Sandboxed document replaces shimmer; header badge `Sandboxed Container` |
| **No artifact yet** | Right pane open, none found | Empty state: 🧩 illustration + guidance text |
| **Provider error** | Ollama down / missing key | Inline error message in the bubble + error banner; user can switch provider and retry |
| **Backend unreachable** | `POST /api/sessions` fails on mount | Error banner above the message list with the API URL; app stays usable for retry |

## 3. Accessibility Guidelines

1. **Contrast:** Text uses slate-100 on slate-950 (well above 4.5:1).
   Interactive chips use minimum 3:1 contrast for borders/accents.
2. **Chat streaming region:** The live message list exposes `aria-live="polite"`
   and `aria-label="Chat history"`, so screen readers announce new assistant
   content without interruption.
3. **Roles:** Composer is a labeled `<textarea aria-label="Chat input">`;
   buttons use native `<button>` with `aria-pressed` for segmented toggles;
   error banner uses `role="alert"`.
4. **Keyboard:** Enter sends, Shift+Enter inserts a newline; all controls are
   tab-focusable with visible focus rings (`focus:ring-brand-500`).
5. **Reduced motion:** Pulsing/transition effects degrade gracefully; we use
   CSS-only animations that respect `prefers-reduced-motion`.
6. **Artifact iframe:** `<iframe title>` is set for screen reader identification;
   the artifact pane is a labeled `<aside>`.
7. **Target size:** Send/Stop buttons are ≥ 44px tall; toggle chips ≥ 32px.

## 4. Tech Notes

- **Next.js 14 App Router**, client components for all interactive surfaces,
  Tailwind CSS 3 for styling.
- **react-markdown** renders assistant responses (no `dangerouslySetInnerHTML`).
- **DOMPurify** sanitizes artifact HTML before it is injected via iframe
  `srcDoc`. This is immutable and unskippable (constant, not prop-configurable).
- **SSE parsing:** a manual `fetch` + `ReadableStream` reader splits on `\n\n`,
  handles `data: [DONE]`, and dispatches `sources` / `token` / `error` events.