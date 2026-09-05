"use client";

import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import type { SourceChunk } from "@/lib/api";

// Strip any artifact tags that haven't been extracted yet (e.g. mid-stream
// before the closing tag arrives, or if the model wraps content in them).
const ARTIFACT_TAG_RE = /<artifact\b[^>]*>[\s\S]*?<\/artifact>|<artifact\b[^>]*>/gi;
function stripArtifactTags(text: string): string {
  return text.replace(ARTIFACT_TAG_RE, "").trim();
}

const COPY_LABEL = "Copy";
const COPIED_LABEL = "Copied!";

function SourceChip({ source }: { source: SourceChunk }) {
  const similarity = source.similarity != null ? Math.round(source.similarity * 100) : null;
  return (
    <div className="inline-flex min-w-0 items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800/70 px-2 py-0.5 text-[11px] text-neutral-300">
      <span className="truncate font-semibold text-neutral-200 max-w-[140px] sm:max-w-none">{source.episode_title}</span>
      <span className="shrink-0 text-neutral-400">{source.guest_name}</span>
      {source.timestamp_ref ? <span className="shrink-0 text-neutral-500">{source.timestamp_ref}</span> : null}
      {similarity != null ? <span className="shrink-0 ml-1 text-neutral-500">({similarity}% match)</span> : null}
    </div>
  );
}

interface ChatBubbleProps {
  role: "user" | "assistant";
  content: string;
  sources?: SourceChunk[];
  isStreaming?: boolean;
  status?: string | null;
  onRegenerate?: () => void;
}

function RobotIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 8V4H8" />
      <rect width="16" height="12" x="4" y="8" rx="2" />
      <path d="M2 14h2" />
      <path d="M20 14h2" />
      <path d="M15 13v2" />
      <path d="M9 13v2" />
    </svg>
  );
}

function LoadingDots() {
  return (
    <span className="flex shrink-0 items-center gap-1" aria-hidden="true">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-500 [animation-delay:0ms]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-500 [animation-delay:150ms]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-500 [animation-delay:300ms]" />
    </span>
  );
}

function CopyIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
    </svg>
  );
}

function RegenerateIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
    </svg>
  );
}

export function ChatBubble({
  role,
  content,
  sources,
  isStreaming,
  status,
  onRegenerate,
}: ChatBubbleProps) {
  const [copied, setCopied] = useState(false);

  const isUser = role === "user";

  const handleCopy = () => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const avatar = (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white">
      <RobotIcon />
    </div>
  );

  const markdown = (
    <div className="markdown-body text-[15px] leading-relaxed text-neutral-200 [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-bold [&_h3]:mb-1.5 [&_h3]:mt-3 [&_h3]:text-sm [&_h3]:font-bold [&_p]:mb-2 [&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_strong]:font-bold [&_strong]:text-neutral-50 [&_a]:text-brand-500 [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-neutral-700 [&_blockquote]:pl-3 [&_blockquote]:text-neutral-400 [&_code]:rounded [&_code]:bg-neutral-800 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12.5px] [&_code]:text-neutral-200">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          code({ node, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || "");
            const isInline = !match && typeof children === "string" && children.length === 0;
            if (isInline) {
              return <code className="rounded bg-neutral-800 px-1 py-0.5 text-[12.5px] font-mono text-neutral-200" {...props}>{children}</code>;
            }
            if (match) {
              const [, lang] = match;
              return (
                <div className="relative group/md">
                  <SyntaxHighlighter
                    language={lang}
                    style={oneDark}
                    PreTag="div"
                    customStyle={{
                      margin: 0,
                      borderRadius: "0.5rem",
                      padding: "0.75rem 1rem",
                      fontSize: "0.8125rem",
                      lineHeight: "1.6",
                      background: "#141414",
                    }}
                  >
                    {String(children).trim()}
                  </SyntaxHighlighter>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className={`absolute right-2 top-2 rounded-md border bg-neutral-800/80 px-2 py-0.5 text-[11px] text-neutral-400 opacity-0 group-hover/md:opacity-100 transition-opacity hover:bg-neutral-700 ${
                      copied ? "border-emerald-600 text-emerald-300" : ""
                    }`}
                    aria-label={copied ? COPIED_LABEL : COPY_LABEL}
                  >
                    {copied ? COPIED_LABEL : COPY_LABEL}
                  </button>
                </div>
              );
            }
            return <code className="rounded bg-neutral-800 px-1 py-0.5 text-[12.5px] font-mono text-neutral-200" {...props}>{children}</code>;
          },
          pre({ children }) {
            return <div className="my-3 overflow-x-auto">{children}</div>;
          },
          a({ children }) {
            return <a target="_blank" rel="noopener noreferrer" className="text-brand-500 underline hover:text-brand-400">{children}</a>;
          },
        }}
      >
        {stripArtifactTags(content) || "\u200b"}
      </ReactMarkdown>
    </div>
  );

  const sourcesBlock = sources && sources.length > 0 ? (
    <div className="mt-2.5 flex flex-col gap-1.5 sm:flex-row sm:flex-wrap">
      {sources.map((source, idx) => (
        <SourceChip key={`${source.episode_title}-${idx}`} source={source} />
      ))}
    </div>
  ) : null;

  // User message: right-aligned bubble.
  if (isUser) {
    return (
      <div className="flex w-full justify-end">
        <div className="max-w-[90%] sm:max-w-[80%] rounded-2xl rounded-br-md bg-neutral-800 px-4 py-2.5 text-[15px] leading-relaxed text-neutral-100 break-words">
          {content}
        </div>
      </div>
    );
  }

  // Assistant message: avatar left, full-width content, hover actions.
  const streamingEmpty = isStreaming && content.length === 0;

  return (
    <div className="group flex w-full gap-2 sm:gap-3">
      {avatar}
      <div className="min-w-0 flex-1">
        {streamingEmpty ? (
          <div className="flex items-center gap-2 py-1" aria-live="polite">
            <LoadingDots />
            <span className="text-[13px] text-neutral-500">
              {status ?? "Thinking…"}
            </span>
          </div>
        ) : (
          <>
            {isStreaming && status && (
              <p className="mb-2 flex items-center gap-1.5 text-[11px] text-neutral-500" aria-live="polite">
                <span className="h-1 w-1 animate-pulse rounded-full bg-brand-500" />
                {status}
              </p>
            )}
            {markdown}
            {sourcesBlock}
          </>
        )}

        {!streamingEmpty && (
          <div className="mt-1 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] text-neutral-500 transition-colors hover:bg-neutral-900 hover:text-neutral-200"
            >
              <CopyIcon />
              {copied ? COPIED_LABEL : COPY_LABEL}
            </button>
            {onRegenerate && (
              <button
                type="button"
                onClick={onRegenerate}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] text-neutral-500 transition-colors hover:bg-neutral-900 hover:text-neutral-200"
              >
                <RegenerateIcon />
                Regenerate
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}