import { describe, it, expect, vi } from 'vitest';
import { sendMessageStream, clearConversation, listConversations, getConversation } from './agent';
import type { StreamCallbacks } from './agent';

function makeCallbacks(): StreamCallbacks {
  return {
    onConversationId: vi.fn(),
    onToolCall: vi.fn(),
    onMediaItems: vi.fn(),
    onContent: vi.fn(),
    onDone: vi.fn(),
    onError: vi.fn(),
  };
}

function makeSSE(events: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const data = events.map((e) => `data: ${e}\n\n`).join('');
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(data));
      controller.close();
    },
  });
}

function setup({ token = 'test-token' }: { token?: string | null } = {}) {
  vi.mocked(fetch).mockReset();
  vi.mocked(localStorage.getItem).mockReturnValue(token);
  return { fetch: vi.mocked(fetch) };
}

describe('sendMessageStream', () => {
  it('calls onError when not authenticated', async () => {
    setup({ token: null });
    const callbacks = makeCallbacks();

    await sendMessageStream('hello', 'server', undefined, callbacks);

    expect(callbacks.onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Not authenticated' }));
  });

  it('calls onError on non-ok response', async () => {
    const { fetch } = setup();
    fetch.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ detail: 'Service unavailable' }),
    } as Response);

    const callbacks = makeCallbacks();
    await sendMessageStream('hello', 'server', undefined, callbacks);

    expect(callbacks.onError).toHaveBeenCalled();
  });

  it('calls onError when no response body', async () => {
    const { fetch } = setup();
    fetch.mockResolvedValue({
      ok: true,
      body: null,
    } as Response);

    const callbacks = makeCallbacks();
    await sendMessageStream('hello', 'server', undefined, callbacks);

    expect(callbacks.onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'No response body' }));
  });

  it('handles conversation_id event', async () => {
    const { fetch } = setup();
    const stream = makeSSE(['{"type":"conversation_id","conversation_id":"abc-123"}']);
    fetch.mockResolvedValue({ ok: true, body: stream } as Response);

    const callbacks = makeCallbacks();
    await sendMessageStream('hello', 'server', undefined, callbacks);

    expect(callbacks.onConversationId).toHaveBeenCalledWith('abc-123');
  });

  it('handles tool_call event', async () => {
    const { fetch } = setup();
    const stream = makeSSE(['{"type":"tool_call","tool":"search_library"}']);
    fetch.mockResolvedValue({ ok: true, body: stream } as Response);

    const callbacks = makeCallbacks();
    await sendMessageStream('hello', 'server', undefined, callbacks);

    expect(callbacks.onToolCall).toHaveBeenCalledWith('search_library');
  });

  it('handles content event', async () => {
    const { fetch } = setup();
    const stream = makeSSE(['{"type":"content","content":"Hello world"}']);
    fetch.mockResolvedValue({ ok: true, body: stream } as Response);

    const callbacks = makeCallbacks();
    await sendMessageStream('hello', 'server', undefined, callbacks);

    expect(callbacks.onContent).toHaveBeenCalledWith('Hello world');
  });

  it('handles media_items event', async () => {
    const { fetch } = setup();
    const items = [{ rating_key: '1', title: 'Movie', type: 'movie' }];
    const stream = makeSSE([JSON.stringify({ type: 'media_items', items })]);
    fetch.mockResolvedValue({ ok: true, body: stream } as Response);

    const callbacks = makeCallbacks();
    await sendMessageStream('hello', 'server', undefined, callbacks);

    expect(callbacks.onMediaItems).toHaveBeenCalledWith(items);
  });

  it('handles done event', async () => {
    const { fetch } = setup();
    const stream = makeSSE(['{"type":"done"}']);
    fetch.mockResolvedValue({ ok: true, body: stream } as Response);

    const callbacks = makeCallbacks();
    await sendMessageStream('hello', 'server', undefined, callbacks);

    expect(callbacks.onDone).toHaveBeenCalled();
  });

  it('skips invalid JSON lines', async () => {
    const { fetch } = setup();
    const stream = makeSSE(['not-json', '{"type":"done"}']);
    fetch.mockResolvedValue({ ok: true, body: stream } as Response);

    const callbacks = makeCallbacks();
    await sendMessageStream('hello', 'server', undefined, callbacks);

    expect(callbacks.onDone).toHaveBeenCalled();
  });
});

describe('clearConversation', () => {
  it('calls DELETE endpoint', async () => {
    const { fetch } = setup();
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'Cleared' }),
    } as Response);

    await clearConversation('conv-123');

    expect(fetch).toHaveBeenCalledWith(
      '/api/agent/conversation/conv-123',
      expect.objectContaining({ method: 'DELETE' })
    );
  });
});

describe('listConversations', () => {
  it('fetches conversations list', async () => {
    const { fetch } = setup();
    const mockData = [
      { conversation_id: 'c1', title: 'Chat 1', created_at: 1000, updated_at: 2000 },
    ];
    fetch.mockResolvedValue({
      ok: true,
      json: async () => mockData,
    } as Response);

    const result = await listConversations();

    expect(fetch).toHaveBeenCalledWith(
      '/api/agent/conversations',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      })
    );
    expect(result).toEqual(mockData);
  });
});

describe('getConversation', () => {
  it('fetches conversation by id', async () => {
    const { fetch } = setup();
    const mockData = {
      conversation_id: 'c1',
      title: 'Chat 1',
      messages: [{ role: 'user', content: 'Hi', media_items: [] }],
    };
    fetch.mockResolvedValue({
      ok: true,
      json: async () => mockData,
    } as Response);

    const result = await getConversation('c1');

    expect(fetch).toHaveBeenCalledWith(
      '/api/agent/conversation/c1',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      })
    );
    expect(result).toEqual(mockData);
  });
});
