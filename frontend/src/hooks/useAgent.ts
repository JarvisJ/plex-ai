import { useState, useCallback } from 'react';
import { sendMessage, clearConversation } from '../api/agent';
import type { MediaItem } from '../api/media';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  mediaItems: MediaItem[];
}

export function useAgent(serverName: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(
    async (content: string) => {
      if (!serverName) {
        setError('No server selected');
        return;
      }

      setError(null);
      setIsLoading(true);

      // Add user message immediately
      const userMessage: Message = {
        id: `user-${Date.now()}`,
        role: 'user',
        content,
        mediaItems: [],
      };
      setMessages((prev) => [...prev, userMessage]);

      try {
        const response = await sendMessage(content, serverName, conversationId ?? undefined);

        // Update conversation ID
        setConversationId(response.conversation_id);

        // Add assistant message
        const assistantMessage: Message = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: response.message.content,
          mediaItems: response.message.media_items,
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to send message');
        // Remove the user message on error
        setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
      } finally {
        setIsLoading(false);
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
  }, [conversationId]);

  return {
    messages,
    isLoading,
    error,
    sendMessage: send,
    reset,
  };
}
