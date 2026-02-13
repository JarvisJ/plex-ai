import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock the agent API before importing hook
vi.mock('../../api/agent', () => ({
  sendMessageStream: vi.fn(),
  clearConversation: vi.fn(),
}));

import { useAgent } from '../useAgent';
import { sendMessageStream, clearConversation } from '../../api/agent';

beforeEach(() => {
  vi.mocked(sendMessageStream).mockReset();
  vi.mocked(clearConversation).mockReset();
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

  describe('reset', () => {
    it('clears conversation if exists', async () => {
      vi.mocked(sendMessageStream).mockImplementation(
        async (_msg, _server, _convId, callbacks) => {
          callbacks.onConversationId('conv-123');
          callbacks.onDone();
        }
      );
      vi.mocked(clearConversation).mockResolvedValue(undefined);

      const { result } = renderHook(() => useAgent('TestServer'));

      // First send to establish conversation
      await act(async () => {
        await result.current.sendMessage('hello');
      });

      // Then reset
      await act(async () => {
        await result.current.reset();
      });

      expect(clearConversation).toHaveBeenCalledWith('conv-123');
      expect(result.current.messages).toEqual([]);
    });

    it('clears state without conversation', async () => {
      const { result } = renderHook(() => useAgent('TestServer'));

      await act(async () => {
        await result.current.reset();
      });

      expect(clearConversation).not.toHaveBeenCalled();
      expect(result.current.messages).toEqual([]);
      expect(result.current.error).toBeNull();
    });
  });
});
