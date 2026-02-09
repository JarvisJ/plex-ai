import { apiFetch } from './client';
import type { MediaItem } from './media';

export interface AgentMessage {
  role: 'user' | 'assistant';
  content: string;
  media_items: MediaItem[];
}

export interface ChatResponse {
  conversation_id: string;
  message: AgentMessage;
}

export async function sendMessage(
  message: string,
  serverName: string,
  conversationId?: string
): Promise<ChatResponse> {
  return apiFetch<ChatResponse>('/api/agent/chat', {
    method: 'POST',
    body: JSON.stringify({
      message,
      server_name: serverName,
      conversation_id: conversationId,
    }),
  });
}

export async function clearConversation(conversationId: string): Promise<void> {
  await apiFetch<{ message: string }>(`/api/agent/conversation/${conversationId}`, {
    method: 'DELETE',
  });
}
