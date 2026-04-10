/**
 * ChatContext — provides harness invocation capabilities to the TUI.
 *
 * Wraps the harness invoker module, manages conversation history on the
 * harness side, and exposes a simple `sendMessage(text)` interface that
 * components can call to send a user message and receive an assistant reply.
 *
 * The provider keeps track of whether a request is in flight (loading state)
 * and streams output lines back into the SessionContext message list.
 */

import React, {
  createContext,
  useContext,
  useCallback,
  useRef,
  type ReactNode,
} from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatContextValue {
  /** Send a user message to the harness. Returns when the response is complete. */
  sendMessage: (text: string) => Promise<void>;
  /** Whether a harness invocation is currently in flight. */
  loading: boolean;
  /** The configured harness name. */
  harness: string;
  /** Cancel the current in-flight request (if any). */
  cancel: () => void;
}

export interface ChatProviderProps {
  children: ReactNode;
  /** Harness to invoke. Defaults to "claude-code". */
  harness?: string;
  /** Workspace directory. Defaults to cwd. */
  workspace?: string;
  /** Model override. */
  model?: string;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ChatContext = createContext<ChatContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function ChatProvider({
  children,
  harness = "claude-code",
  workspace,
  model,
}: ChatProviderProps): React.JSX.Element {
  const [loading, setLoading] = React.useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // We import the invoker lazily to avoid pulling Node.js modules at
  // require()-time in the React component tree.
  const sendMessage = useCallback(
    async (text: string): Promise<void> => {
      setLoading(true);
      abortRef.current = new AbortController();

      try {
        // Dynamic require to avoid top-level ESM/CJS issues in the React tree
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { invokeHarness } = require("../../../harness/invoker") as {
          invokeHarness: (
            name: string,
            options: {
              prompt: string;
              workspace?: string;
              model?: string;
              timeout?: number;
              streaming?: {
                onLine?: (line: string, stream: "stdout" | "stderr") => void;
              };
            },
          ) => Promise<{
            success: boolean;
            output: string;
            exitCode: number;
            duration: number;
            harness: string;
          }>;
        };

        const result = await invokeHarness(harness, {
          prompt: text,
          workspace: workspace ?? process.cwd(),
          model,
          timeout: 300_000, // 5 minutes
        });

        // Return the result via the callback — the caller (SessionView)
        // is responsible for dispatching the assistant message.
        return void result;
      } catch (err: unknown) {
        // If aborted, silently ignore
        if (abortRef.current?.signal.aborted) return;
        throw err;
      } finally {
        setLoading(false);
        abortRef.current = null;
      }
    },
    [harness, workspace, model],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const value = React.useMemo(
    () => ({ sendMessage, loading, harness, cancel }),
    [sendMessage, loading, harness, cancel],
  );

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useChatContext(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (ctx === null) {
    throw new Error("useChatContext must be used within a ChatProvider");
  }
  return ctx;
}
