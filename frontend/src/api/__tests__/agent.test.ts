import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendMessageStream, clearConversation } from '../agent';
import type { StreamCallbacks } from '../agent';

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

describe('sendMessageStream', () => {
  beforeEach(() => {
    vi.mocked(fetch).mockReset();
    vi.mocked(localStorage.getItem).mockReturnValue('test-token');
  });

  it('calls onError when not authenticated', async () => {
    vi.mocked(localStorage.getItem).mockReturnValue(null);
    const callbacks = makeCallbacks();

    await sendMessageStream('hello', 'server', undefined, callbacks);

    expect(callbacks.onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Not authenticated' }));
  });

  it('calls onError on non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ detail: 'Service unavailable' }),
    } as Response);

    const callbacks = makeCallbacks();
    await sendMessageStream('hello', 'server', undefined, callbacks);

    expect(callbacks.onError).toHaveBeenCalled();
  });

  it('calls onError when no response body', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      body: null,
    } as Response);

    const callbacks = makeCallbacks();
    await sendMessageStream('hello', 'server', undefined, callbacks);

    expect(callbacks.onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'No response body' }));
  });

  it('handles conversation_id event', async () => {
    const stream = makeSSE(['{"type":"conversation_id","conversation_id":"abc-123"}']);
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      body: stream,
    } as Response);

    const callbacks = makeCallbacks();
    await sendMessageStream('hello', 'server', undefined, callbacks);

    expect(callbacks.onConversationId).toHaveBeenCalledWith('abc-123');
  });

  it('handles tool_call event', async () => {
    const stream = makeSSE(['{"type":"tool_call","tool":"search_library"}']);
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      body: stream,
    } as Response);

    const callbacks = makeCallbacks();
    await sendMessageStream('hello', 'server', undefined, callbacks);

    expect(callbacks.onToolCall).toHaveBeenCalledWith('search_library');
  });

  it('handles content event', async () => {
    const stream = makeSSE(['{"type":"content","content":"Hello world"}']);
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      body: stream,
    } as Response);

    const callbacks = makeCallbacks();
    await sendMessageStream('hello', 'server', undefined, callbacks);

    expect(callbacks.onContent).toHaveBeenCalledWith('Hello world');
  });

  it('handles media_items event', async () => {
    const items = [{ rating_key: '1', title: 'Movie', type: 'movie' }];
    const stream = makeSSE([JSON.stringify({ type: 'media_items', items })]);
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      body: stream,
    } as Response);

    const callbacks = makeCallbacks();
    await sendMessageStream('hello', 'server', undefined, callbacks);

    expect(callbacks.onMediaItems).toHaveBeenCalledWith(items);
  });

  it('handles done event', async () => {
    const stream = makeSSE(['{"type":"done"}']);
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      body: stream,
    } as Response);

    const callbacks = makeCallbacks();
    await sendMessageStream('hello', 'server', undefined, callbacks);

    expect(callbacks.onDone).toHaveBeenCalled();
  });

  it('skips invalid JSON lines', async () => {
    const stream = makeSSE(['not-json', '{"type":"done"}']);
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      body: stream,
    } as Response);

    const callbacks = makeCallbacks();
    await sendMessageStream('hello', 'server', undefined, callbacks);

    expect(callbacks.onDone).toHaveBeenCalled();
  });
});

describe('clearConversation', () => {
  beforeEach(() => {
    vi.mocked(fetch).mockReset();
    vi.mocked(localStorage.getItem).mockReturnValue('test-token');
  });

  it('calls DELETE endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue({
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
