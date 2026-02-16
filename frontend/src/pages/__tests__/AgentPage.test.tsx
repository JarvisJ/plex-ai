import { describe, it, expect, vi, beforeEach } from 'vitest';
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

vi.mock('../../hooks/useAgent', () => ({
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

vi.mock('../../components/media/MediaCard', () => ({
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

import { AgentPage } from '../AgentPage';

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

beforeEach(() => {
  mockSendMessage.mockReset();
  mockReset.mockReset();
  mockLoadConversation.mockReset();
  mockNavigate.mockReset();
  mockMessages = [];
  mockIsLoading = false;
  mockError = null;
  mockCurrentTool = null;
  mockConversationId = null;
});

describe('AgentPage', () => {
  it('renders header with title and icon', () => {
    renderAgentPage();
    expect(screen.getByText(/Plexy the Plexbot/)).toBeInTheDocument();
    expect(screen.getByAltText('Plexy')).toBeInTheDocument();
  });

  it('renders input and New Chat button', () => {
    renderAgentPage();
    expect(screen.getByPlaceholderText('Ask about your library...')).toBeInTheDocument();
    expect(screen.getByText('New Chat')).toBeInTheDocument();
  });

  it('renders empty state suggestions when no messages', () => {
    renderAgentPage();
    expect(screen.getByText('Ask me about your Plex library!')).toBeInTheDocument();
    expect(screen.getByText('"What movies do I have?"')).toBeInTheDocument();
    expect(screen.getByText('"Recommend something like The Matrix"')).toBeInTheDocument();
  });

  it('new chat button calls reset, clears input, and navigates', () => {
    renderAgentPage();

    const input = screen.getByPlaceholderText('Ask about your library...') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'some text' } });
    fireEvent.click(screen.getByText('New Chat'));

    expect(mockReset).toHaveBeenCalled();
    expect(input.value).toBe('');
    expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining('/agent?'));
  });

  it('submits trimmed message and clears input', () => {
    mockSendMessage.mockResolvedValue(undefined);
    renderAgentPage();

    const input = screen.getByPlaceholderText('Ask about your library...') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '  hello world  ' } });

    const form = input.closest('form')!;
    fireEvent.submit(form);

    expect(mockSendMessage).toHaveBeenCalledWith('hello world');
    expect(input.value).toBe('');
  });

  it('does not submit empty input', () => {
    renderAgentPage();

    const input = screen.getByPlaceholderText('Ask about your library...');
    const form = input.closest('form')!;
    fireEvent.submit(form);

    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('does not submit whitespace-only input', () => {
    renderAgentPage();

    const input = screen.getByPlaceholderText('Ask about your library...');
    fireEvent.change(input, { target: { value: '   ' } });
    const form = input.closest('form')!;
    fireEvent.submit(form);

    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('disables input when serverName is missing', () => {
    renderAgentPage('/agent');
    const input = screen.getByPlaceholderText('Ask about your library...');
    expect(input).toBeDisabled();
  });

  it('renders user messages', () => {
    mockMessages = [
      { id: 'u1', role: 'user', content: 'Hello!', mediaItems: [] },
    ];
    renderAgentPage();
    expect(screen.getByText('Hello!')).toBeInTheDocument();
  });

  it('renders assistant messages with markdown', () => {
    mockMessages = [
      { id: 'a1', role: 'assistant', content: 'Here are your movies', mediaItems: [] },
    ];
    renderAgentPage();
    expect(screen.getByText('Here are your movies')).toBeInTheDocument();
  });

  it('renders media items in assistant messages', () => {
    mockMessages = [
      {
        id: 'a1',
        role: 'assistant',
        content: 'Found these:',
        mediaItems: [
          { rating_key: 'r1', title: 'The Matrix' },
          { rating_key: 'r2', title: 'Inception' },
        ],
      },
    ];
    renderAgentPage();
    expect(screen.getByText('The Matrix')).toBeInTheDocument();
    expect(screen.getByText('Inception')).toBeInTheDocument();
  });

  it('shows loading indicator with known tool name', () => {
    mockIsLoading = true;
    mockCurrentTool = 'search_library';
    renderAgentPage();
    expect(screen.getByText('Searching library...')).toBeInTheDocument();
  });

  it('shows loading indicator with unknown tool name as fallback', () => {
    mockIsLoading = true;
    mockCurrentTool = 'custom_tool';
    renderAgentPage();
    expect(screen.getByText('custom_tool...')).toBeInTheDocument();
  });

  it('does not show loading when isLoading but no currentTool', () => {
    mockIsLoading = true;
    mockCurrentTool = null;
    renderAgentPage();
    expect(screen.queryByText(/Searching/)).not.toBeInTheDocument();
  });

  it('displays error message', () => {
    mockError = 'Something went wrong';
    renderAgentPage();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('does not show empty state when messages exist', () => {
    mockMessages = [
      { id: 'u1', role: 'user', content: 'Hi', mediaItems: [] },
    ];
    renderAgentPage();
    expect(screen.queryByText('Ask me about your Plex library!')).not.toBeInTheDocument();
  });

  it('shows streaming cursor for streaming assistant messages', () => {
    mockMessages = [
      { id: 'a1', role: 'assistant', content: 'Thinking', mediaItems: [], isStreaming: true },
    ];
    renderAgentPage();
    const cursor = document.querySelector('[class*="cursor"]');
    expect(cursor).toBeInTheDocument();
    expect(cursor?.textContent).toBe('|');
  });

  it('does not show streaming cursor for completed messages', () => {
    mockMessages = [
      { id: 'a1', role: 'assistant', content: 'Done', mediaItems: [], isStreaming: false },
    ];
    renderAgentPage();
    const cursor = document.querySelector('[class*="cursor"]');
    expect(cursor).not.toBeInTheDocument();
  });

  it('loads conversation when URL has conversationId param', () => {
    renderAgentPage('/agent/conv-123?server=MyServer&machine=abc123');
    expect(mockLoadConversation).toHaveBeenCalledWith('conv-123');
  });

  it('does not load conversation when no URL param', () => {
    renderAgentPage('/agent?server=MyServer&machine=abc123');
    expect(mockLoadConversation).not.toHaveBeenCalled();
  });
});
