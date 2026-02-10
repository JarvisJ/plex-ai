import { useState, useCallback, useRef } from "react";
import { sendMessageStream, clearConversation } from "../api/agent";
import type { MediaItem } from "../api/media";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  mediaItems: MediaItem[];
  isStreaming?: boolean;
}

export function useAgent(serverName: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentTool, setCurrentTool] = useState<string | null>(null);
  const streamingMessageIdRef = useRef<string | null>(null);
  const pendingMediaItemsRef = useRef<MediaItem[]>([]);

  const send = useCallback(
    async (content: string) => {
      if (!serverName) {
        setError("No server selected");
        return;
      }

      setError(null);
      setIsLoading(true);
      setCurrentTool(null);

      // Add user message immediately
      const userMessage: Message = {
        id: `user-${Date.now()}`,
        role: "user",
        content,
        mediaItems: [],
      };

      // Create placeholder for assistant message
      const assistantMessageId = `assistant-${Date.now()}`;
      streamingMessageIdRef.current = assistantMessageId;

      const assistantMessage: Message = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        mediaItems: [],
        isStreaming: true,
      };

      // Reset pending media items
      pendingMediaItemsRef.current = [];

      setMessages((prev) => [...prev, userMessage, assistantMessage]);

      try {
        await sendMessageStream(
          content,
          serverName,
          conversationId ?? undefined,
          {
            onConversationId: (id) => {
              setConversationId(id);
            },
            onToolCall: (tool) => {
              setCurrentTool(tool);
            },
            onMediaItems: (items) => {
              // Store media items but don't display until streaming is done
              pendingMediaItemsRef.current = items;
            },
            onContent: (chunk) => {
              setCurrentTool(null);
              setMessages((prev) =>
                prev.map((m) => {
                  return m.id === streamingMessageIdRef.current
                    ? { ...m, content: m.content + chunk }
                    : m;
                })
              );
            },
            onDone: () => {
              // Add media items and mark as done
              const mediaItems = pendingMediaItemsRef.current;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === streamingMessageIdRef.current
                    ? { ...m, isStreaming: false, mediaItems }
                    : m
                )
              );
              pendingMediaItemsRef.current = [];
              setIsLoading(false);
              setCurrentTool(null);
            },
            onError: (err) => {
              setError(err.message);
              // Remove the empty assistant message on error
              setMessages((prev) =>
                prev.filter((m) => m.id !== streamingMessageIdRef.current)
              );
              setIsLoading(false);
              setCurrentTool(null);
              streamingMessageIdRef.current = null;
            },
          }
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to send message");
        setMessages((prev) =>
          prev.filter((m) => m.id !== streamingMessageIdRef.current)
        );
        setIsLoading(false);
        setCurrentTool(null);
        console.log("ERROR: setting ref to null!!");
        streamingMessageIdRef.current = null;
      }
    },
    [serverName, conversationId]
  );

  const reset = useCallback(async () => {
    if (conversationId) {
      try {
        await clearConversation(conversationId);
      } catch {
        // Ignore errors when clearing
      }
    }
    setMessages([]);
    setConversationId(null);
    setError(null);
    setCurrentTool(null);
  }, [conversationId]);

  return {
    messages,
    isLoading,
    error,
    currentTool,
    sendMessage: send,
    reset,
  };
}
