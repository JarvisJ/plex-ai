import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockSendMessage = vi.fn();
const mockReset = vi.fn();
const mockLoadConversation = vi.fn();
const mockNavigate = vi.fn();

interface MockMessage {
  id: string;
  role: string;
  content: string;
  mediaItems: Array<{ rating_key: string; title: string }>;
  isStreaming?: boolean;
}

let mockMessages: MockMessage[] = [];
let mockIsLoading = false;
let mockError: string | null = null;
let mockCurrentTool: string | null = null;
let mockConversationId: string | null = null;

vi.mock('../hooks/useAgent', () => ({
  useAgent: () => ({
    messages: mockMessages,
    isLoading: mockIsLoading,
    error: mockError,
    currentTool: mockCurrentTool,
    conversationId: mockConversationId,
    sendMessage: mockSendMessage,
    loadConversation: mockLoadConversation,
    reset: mockReset,
  }),
}));

vi.mock('../components/media/MediaCard', () => ({
  MediaCard: ({ item }: { item: { title: string } }) => (
    <div data-testid="media-card">{item.title}</div>
  ),
}));

vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => <div>{children}</div>,
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import { AgentPage } from './AgentPage';

function renderAgentPage(route = '/agent?server=MyServer&machine=abc123') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/agent" element={<AgentPage />} />
          <Route path="/agent/:conversationId" element={<AgentPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

interface SetupOptions {
  messages?: MockMessage[];
  isLoading?: boolean;
  error?: string | null;
  currentTool?: string | null;
  conversationId?: string | null;
  initialRoute?: string;
}

function setup({
  messages = [],
  isLoading = false,
  error = null,
  currentTool = null,
  conversationId = null,
  initialRoute,
}: SetupOptions = {}) {
  mockSendMessage.mockReset();
  mockReset.mockReset();
  mockLoadConversation.mockReset();
  mockNavigate.mockReset();
  mockMessages = messages;
  mockIsLoading = isLoading;
  mockError = error;
  mockCurrentTool = currentTool;
  mockConversationId = conversationId;
  renderAgentPage(initialRoute);
  return { mockSendMessage, mockReset, mockLoadConversation, mockNavigate };
}

describe('AgentPage', () => {
  it('renders header with title and icon', () => {
    setup();
    expect(screen.getByText(/Plexy the Plexbot/)).toBeInTheDocument();
    expect(screen.getByAltText('Plexy')).toBeInTheDocument();
  });

  it('renders input and New Chat button', () => {
    setup();
    expect(screen.getByPlaceholderText('Ask about your library...')).toBeInTheDocument();
    expect(screen.getByText('New Chat')).toBeInTheDocument();
  });

  it('renders empty state suggestions when no messages', () => {
    setup();
    expect(screen.getByText('Ask me about your Plex library!')).toBeInTheDocument();
    expect(screen.getByText('"What movies do I have?"')).toBeInTheDocument();
    expect(screen.getByText('"Recommend something like The Matrix"')).toBeInTheDocument();
  });

  it('new chat button calls reset, clears input, and navigates', () => {
    const { mockReset, mockNavigate } = setup();

    const input = screen.getByPlaceholderText('Ask about your library...') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'some text' } });
    fireEvent.click(screen.getByText('New Chat'));

    expect(mockReset).toHaveBeenCalled();
    expect(input.value).toBe('');
    expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining('/agent?'));
  });

  it('submits trimmed message and clears input', () => {
    const { mockSendMessage } = setup();
    mockSendMessage.mockResolvedValue(undefined);

    const input = screen.getByPlaceholderText('Ask about your library...') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '  hello world  ' } });

    const form = input.closest('form')!;
    fireEvent.submit(form);

    expect(mockSendMessage).toHaveBeenCalledWith('hello world');
    expect(input.value).toBe('');
  });

  it('does not submit empty input', () => {
    const { mockSendMessage } = setup();

    const input = screen.getByPlaceholderText('Ask about your library...');
    const form = input.closest('form')!;
    fireEvent.submit(form);

    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('does not submit whitespace-only input', () => {
    const { mockSendMessage } = setup();

    const input = screen.getByPlaceholderText('Ask about your library...');
    fireEvent.change(input, { target: { value: '   ' } });
    const form = input.closest('form')!;
    fireEvent.submit(form);

    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('disables input when serverName is missing', () => {
    setup({ initialRoute: '/agent' });
    const input = screen.getByPlaceholderText('Ask about your library...');
    expect(input).toBeDisabled();
  });

  it('renders user messages', () => {
    setup({ messages: [{ id: 'u1', role: 'user', content: 'Hello!', mediaItems: [] }] });
    expect(screen.getByText('Hello!')).toBeInTheDocument();
  });

  it('renders assistant messages with markdown', () => {
    setup({ messages: [{ id: 'a1', role: 'assistant', content: 'Here are your movies', mediaItems: [] }] });
    expect(screen.getByText('Here are your movies')).toBeInTheDocument();
  });

  it('renders media items in assistant messages', () => {
    setup({
      messages: [
        {
          id: 'a1',
          role: 'assistant',
          content: 'Found these:',
          mediaItems: [
            { rating_key: 'r1', title: 'The Matrix' },
            { rating_key: 'r2', title: 'Inception' },
          ],
        },
      ],
    });
    expect(screen.getByText('The Matrix')).toBeInTheDocument();
    expect(screen.getByText('Inception')).toBeInTheDocument();
  });

  it('shows loading indicator with known tool name', () => {
    setup({ isLoading: true, currentTool: 'search_library' });
    expect(screen.getByText('Searching library...')).toBeInTheDocument();
  });

  it('shows loading indicator with unknown tool name as fallback', () => {
    setup({ isLoading: true, currentTool: 'custom_tool' });
    expect(screen.getByText('custom_tool...')).toBeInTheDocument();
  });

  it('does not show loading when isLoading but no currentTool', () => {
    setup({ isLoading: true, currentTool: null });
    expect(screen.queryByText(/Searching/)).not.toBeInTheDocument();
  });

  it('displays error message', () => {
    setup({ error: 'Something went wrong' });
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('does not show empty state when messages exist', () => {
    setup({ messages: [{ id: 'u1', role: 'user', content: 'Hi', mediaItems: [] }] });
    expect(screen.queryByText('Ask me about your Plex library!')).not.toBeInTheDocument();
  });

  it('shows streaming cursor for streaming assistant messages', () => {
    setup({
      messages: [{ id: 'a1', role: 'assistant', content: 'Thinking', mediaItems: [], isStreaming: true }],
    });
    const cursor = document.querySelector('[class*="cursor"]');
    expect(cursor).toBeInTheDocument();
    expect(cursor?.textContent).toBe('|');
  });

  it('does not show streaming cursor for completed messages', () => {
    setup({
      messages: [{ id: 'a1', role: 'assistant', content: 'Done', mediaItems: [], isStreaming: false }],
    });
    const cursor = document.querySelector('[class*="cursor"]');
    expect(cursor).not.toBeInTheDocument();
  });

  it('loads conversation when URL has conversationId param', () => {
    const { mockLoadConversation } = setup({ initialRoute: '/agent/conv-123?server=MyServer&machine=abc123' });
    expect(mockLoadConversation).toHaveBeenCalledWith('conv-123');
  });

  it('does not load conversation when no URL param', () => {
    const { mockLoadConversation } = setup();
    expect(mockLoadConversation).not.toHaveBeenCalled();
  });

  it('auto-sends message when prompt query param is present', () => {
    const prompt = 'Tell me about Inception (2010).';
    const { mockSendMessage } = setup({
      initialRoute: `/agent?server=MyServer&machine=abc123&prompt=${encodeURIComponent(prompt)}`,
    });
    expect(mockSendMessage).toHaveBeenCalledWith(prompt);
  });

  it('does not auto-send when no prompt param', () => {
    const { mockSendMessage } = setup();
    expect(mockSendMessage).not.toHaveBeenCalled();
  });
});
