import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock the agent API before importing hook
vi.mock('../api/agent', () => ({
  sendMessageStream: vi.fn(),
  getConversation: vi.fn(),
}));

import { useAgent } from './useAgent';
import { sendMessageStream, getConversation } from '../api/agent';

beforeEach(() => {
  vi.mocked(sendMessageStream).mockReset();
  vi.mocked(getConversation).mockReset();
});

describe('useAgent', () => {
  describe('send', () => {
    it('shows error when no serverName', async () => {
      const { result } = renderHook(() => useAgent(null));

      await act(async () => {
        await result.current.sendMessage('hello');
      });

      expect(result.current.error).toBe('No server selected');
    });

    it('sends message and handles all callbacks', async () => {
      vi.mocked(sendMessageStream).mockImplementation(
        async (_msg, _server, _convId, callbacks) => {
          callbacks.onConversationId('conv-123');
          callbacks.onToolCall('search_library');
          callbacks.onContent('Hello ');
          callbacks.onContent('World');
          callbacks.onMediaItems([]);
          callbacks.onDone();
        }
      );

      const { result } = renderHook(() => useAgent('TestServer'));

      await act(async () => {
        await result.current.sendMessage('hello');
      });

      expect(result.current.messages.length).toBe(2); // user + assistant
      expect(result.current.messages[0].role).toBe('user');
      expect(result.current.messages[0].content).toBe('hello');
      expect(result.current.messages[1].role).toBe('assistant');
      expect(result.current.messages[1].content).toBe('Hello World');
      expect(result.current.isLoading).toBe(false);
      expect(result.current.conversationId).toBe('conv-123');
    });

    it('handles error during streaming', async () => {
      vi.mocked(sendMessageStream).mockImplementation(
        async (_msg, _server, _convId, callbacks) => {
          callbacks.onError(new Error('Stream failed'));
        }
      );

      const { result } = renderHook(() => useAgent('TestServer'));

      await act(async () => {
        await result.current.sendMessage('hello');
      });

      expect(result.current.error).toBe('Stream failed');
      expect(result.current.isLoading).toBe(false);
      // User message remains; assistant may or may not be filtered depending on batch timing
      expect(result.current.messages.length).toBeGreaterThanOrEqual(1);
      expect(result.current.messages[0].role).toBe('user');
    });
  });

  describe('loadConversation', () => {
    it('loads conversation and sets messages', async () => {
      vi.mocked(getConversation).mockResolvedValue({
        conversation_id: 'conv-456',
        title: 'Test',
        messages: [
          { role: 'user', content: 'Hello', media_items: [] },
          { role: 'assistant', content: 'Hi there', media_items: [] },
        ],
      });

      const { result } = renderHook(() => useAgent('TestServer'));

      await act(async () => {
        await result.current.loadConversation('conv-456');
      });

      expect(getConversation).toHaveBeenCalledWith('conv-456');
      expect(result.current.messages.length).toBe(2);
      expect(result.current.messages[0].role).toBe('user');
      expect(result.current.messages[0].content).toBe('Hello');
      expect(result.current.messages[1].role).toBe('assistant');
      expect(result.current.messages[1].content).toBe('Hi there');
      expect(result.current.conversationId).toBe('conv-456');
    });

    it('sets error on load failure', async () => {
      vi.mocked(getConversation).mockRejectedValue(new Error('Not found'));

      const { result } = renderHook(() => useAgent('TestServer'));

      await act(async () => {
        await result.current.loadConversation('bad-id');
      });

      expect(result.current.error).toBe('Failed to load conversation');
    });
  });

  describe('reset', () => {
    it('clears state after conversation exists', async () => {
      vi.mocked(sendMessageStream).mockImplementation(
        async (_msg, _server, _convId, callbacks) => {
          callbacks.onConversationId('conv-123');
          callbacks.onDone();
        }
      );

      const { result } = renderHook(() => useAgent('TestServer'));

      // First send to establish conversation
      await act(async () => {
        await result.current.sendMessage('hello');
      });

      // Then reset
      act(() => {
        result.current.reset();
      });

      expect(result.current.messages).toEqual([]);
      expect(result.current.conversationId).toBeNull();
    });

    it('clears state without conversation', () => {
      const { result } = renderHook(() => useAgent('TestServer'));

      act(() => {
        result.current.reset();
      });

      expect(result.current.messages).toEqual([]);
      expect(result.current.error).toBeNull();
    });
  });
});
