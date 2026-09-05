export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type ProviderName = "ollama" | "gemini" | "glm" | "huggingface";
export type ChatMode = "default" | "ship30";

export interface SourceChunk {
  episode_title: string;
  guest_name: string;
  timestamp_ref?: string | null;
  chunk_text: string;
  similarity?: number;
}

export interface SessionResponse {
  id: string;
  title: string;
  created_at: string;
}

export interface SessionSummary {
  id: string;
  title: string;
  created_at: string;
  last_message_at: string;
  message_count: number;
}

export interface SessionMessage {
  id: string;
  role: string;
  content: string;
  sources?: SourceChunk[] | null;
  created_at: string;
  artifacts?: PersistedArtifact[] | null;
}

export interface PersistedArtifact {
  id: string;
  message_id: string;
  artifact_type: string;
  title: string;
  content: string;
  created_at: string;
}

export interface Artifact {
  type: string;
  title: string;
  html: string;
}

export interface ProviderInfo {
  value: ProviderName;
  label: string;
  model: string;
  local: boolean;
  available: boolean;
}

export interface ModelsResponse {
  providers: ProviderInfo[];
  default: ProviderName;
}

export async function getModels(): Promise<ModelsResponse> {
  const res = await fetch(`${API_URL}/api/models`);
  if (!res.ok) throw new Error(`Failed to fetch models (HTTP ${res.status}).`);
  return res.json();
}

export async function createSession(): Promise<SessionResponse> {
  const res = await fetch(`${API_URL}/api/sessions`, { method: "POST" });
  if (!res.ok) {
    throw new Error(`Failed to create session (HTTP ${res.status}).`);
  }
  return res.json();
}

export async function listSessions(): Promise<SessionSummary[]> {
  const res = await fetch(`${API_URL}/api/sessions`);
  if (!res.ok) {
    throw new Error(`Failed to list sessions (HTTP ${res.status}).`);
  }
  return res.json();
}

export async function getSessionMessages(sessionId: string): Promise<SessionMessage[]> {
  const res = await fetch(`${API_URL}/api/sessions/${sessionId}`);
  if (!res.ok) {
    throw new Error(`Failed to load session (HTTP ${res.status}).`);
  }
  const body = await res.json();
  return body.messages as SessionMessage[];
}

export async function deleteSession(sessionId: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/sessions/${sessionId}`, {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(`Failed to delete session (HTTP ${res.status}).`);
  }
}

export async function listArtifacts(): Promise<PersistedArtifact[]> {
  const res = await fetch(`${API_URL}/api/artifacts`);
  if (!res.ok) {
    throw new Error(`Failed to fetch artifacts (HTTP ${res.status}).`);
  }
  return res.json();
}

export async function getArtifact(artifactId: string): Promise<PersistedArtifact> {
  const res = await fetch(`${API_URL}/api/artifacts/${artifactId}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch artifact (HTTP ${res.status}).`);
  }
  return res.json();
}

export interface StreamChatOptions {
  sessionId: string;
  message: string;
  mode: ChatMode;
  provider: ProviderName;
  signal?: AbortSignal;
  onStatus?: (status: string) => void;
  onSources?: (sources: SourceChunk[]) => void;
  onToken?: (token: string) => void;
  onError?: (message: string) => void;
  onDone?: () => void;
}

/** POST a chat request and consume the Server-Sent Events response stream. */
export async function streamChat(opts: StreamChatOptions): Promise<void> {
  const res = await fetch(`${API_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: opts.sessionId,
      message: opts.message,
      mode: opts.mode,
      provider: opts.provider,
    }),
    signal: opts.signal,
  });

  if (!res.ok || !res.body) {
    throw new Error(`Chat request failed (HTTP ${res.status}).`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const event of events) {
      for (const line of event.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (raw === "[DONE]") {
          opts.onDone?.();
          return;
        }
        let payload: any;
        try {
          payload = JSON.parse(raw);
        } catch {
          continue;
        }
        if (payload.type === "status") opts.onStatus?.(payload.content ?? "");
        else if (payload.type === "sources") opts.onSources?.(payload.content ?? []);
        else if (payload.type === "token") opts.onToken?.(payload.content ?? "");
        else if (payload.type === "error") opts.onError?.(payload.content ?? "Unknown error");
      }
    }
  }
}

// ── Artifact detection ────────────────────────────────────────────────────────

// Matches a complete <artifact ...>...</artifact> block.
const ARTIFACT_RE = /<artifact\b([^>]*)>([\s\S]*?)<\/artifact>/i;
// Matches an opening tag that hasn't closed yet (mid-stream).
const ARTIFACT_OPEN_RE = /<artifact\b[^>]*>[\s\S]*/i;

export function extractArtifact(raw: string): {
  artifact: Artifact | null;
  clean: string;
} {
  // Complete artifact — extract and remove.
  const match = ARTIFACT_RE.exec(raw);
  if (match) {
    const attrs = match[1];
    const typeMatch = /\btype="([^"]*)"/.exec(attrs);
    const titleMatch = /\btitle="([^"]*)"/.exec(attrs);
    const artifact: Artifact = {
      type: typeMatch?.[1] ?? "html",
      title: titleMatch?.[1] ?? "Untitled Artifact",
      html: match[2].trim(),
    };
    const clean = (raw.slice(0, match.index) + raw.slice(match.index + match[0].length)).trim();
    return { artifact, clean };
  }

  // Partial/open tag mid-stream — strip it from visible content but don't
  // surface an artifact yet (wait for the closing tag).
  const openMatch = ARTIFACT_OPEN_RE.exec(raw);
  if (openMatch) {
    const clean = raw.slice(0, openMatch.index).trim();
    return { artifact: null, clean };
  }

  return { artifact: null, clean: raw };
}