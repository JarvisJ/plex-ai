import { apiFetch } from "./client";
import type { MediaItem } from "./media";

export interface AgentMessage {
  role: "user" | "assistant";
  content: string;
  media_items: MediaItem[];
}

export interface StreamEvent {
  type: "conversation_id" | "tool_call" | "media_items" | "content" | "done";
  conversation_id?: string;
  tool?: string;
  items?: MediaItem[];
  content?: string;
}

export interface StreamCallbacks {
  onConversationId: (id: string) => void;
  onToolCall: (tool: string) => void;
  onMediaItems: (items: MediaItem[]) => void;
  onContent: (content: string) => void;
  onDone: () => void;
  onError: (error: Error) => void;
}

export async function sendMessageStream(
  message: string,
  serverName: string,
  conversationId: string | undefined,
  callbacks: StreamCallbacks
): Promise<void> {
  const token = localStorage.getItem("auth_token");
  if (!token) {
    callbacks.onError(new Error("Not authenticated"));
    return;
  }

  try {
    // Use raw fetch for streaming - apiFetch returns parsed JSON which doesn't work for SSE
    const response = await fetch("/api/agent/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        chat_request: {
          message,
          server_name: serverName,
          conversation_id: conversationId,
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.detail || `Request failed with status ${response.status}`
      );
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("No response body");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE events
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const jsonStr = line.slice(6);
          if (jsonStr.trim()) {
            try {
              const event: StreamEvent = JSON.parse(jsonStr);

              switch (event.type) {
                case "conversation_id":
                  if (event.conversation_id) {
                    callbacks.onConversationId(event.conversation_id);
                  }
                  break;
                case "tool_call":
                  if (event.tool) {
                    callbacks.onToolCall(event.tool);
                  }
                  break;
                case "media_items":
                  if (event.items) {
                    callbacks.onMediaItems(event.items);
                  }
                  break;
                case "content":
                  if (event.content) {
                    callbacks.onContent(event.content);
                  }
                  break;
                case "done":
                  callbacks.onDone();
                  break;
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
    }
  } catch (error) {
    callbacks.onError(
      error instanceof Error ? error : new Error("Stream failed")
    );
  }
}

export async function clearConversation(conversationId: string): Promise<void> {
  await apiFetch<{ message: string }>(
    `/api/agent/conversation/${conversationId}`,
    {
      method: "DELETE",
    }
  );
}
