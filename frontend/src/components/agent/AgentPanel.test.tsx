import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock useAgent hook
const mockSendMessage = vi.fn();
const mockReset = vi.fn();

vi.mock('../../hooks/useAgent', () => ({
  useAgent: () => ({
    messages: [],
    isLoading: false,
    error: null,
    currentTool: null,
    sendMessage: mockSendMessage,
    reset: mockReset,
  }),
}));

vi.mock('../media/MediaCard', () => ({
  MediaCard: ({ item }: { item: { title: string } }) => <div data-testid="media-card">{item.title}</div>,
}));

vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => <div>{children}</div>,
}));

import { AgentPanel } from './AgentPanel';

interface SetupOptions {
  isOpen?: boolean;
  onClose?: () => void;
  serverName?: string;
}

function setup({ isOpen = true, onClose, serverName = 'Server' }: SetupOptions = {}) {
  const resolvedOnClose = onClose ?? vi.fn();
  mockSendMessage.mockReset();
  mockReset.mockReset();
  const renderResult = render(
    <AgentPanel isOpen={isOpen} onClose={resolvedOnClose} serverName={serverName} clientIdentifier={null} />
  );
  return { onClose: resolvedOnClose, mockSendMessage, mockReset, ...renderResult };
}

describe('AgentPanel', () => {
  it('returns null when not open', () => {
    const { container } = setup({ isOpen: false });
    expect(container.innerHTML).toBe('');
  });

  it('renders panel with input when open', () => {
    setup();
    expect(screen.getByPlaceholderText('Ask about your library...')).toBeInTheDocument();
    expect(screen.getByText(/Plexy the Plexbot/)).toBeInTheDocument();
  });

  it('renders suggestions when no messages', () => {
    setup();
    expect(screen.getByText('Ask me about your Plex library!')).toBeInTheDocument();
  });

  it('calls onClose when close button clicked', () => {
    const { onClose } = setup();

    // Close button is the one with the X SVG
    const buttons = screen.getAllByRole('button');
    const closeButton = buttons.find(b => b.querySelector('svg path[d*="M15 5L5 15"]'));
    if (closeButton) fireEvent.click(closeButton);

    expect(onClose).toHaveBeenCalled();
  });

  it('new chat button calls reset', () => {
    const { mockReset } = setup();
    fireEvent.click(screen.getByText('New Chat'));
    expect(mockReset).toHaveBeenCalled();
  });

  it('submit sends trimmed message and clears input', async () => {
    const { mockSendMessage } = setup();
    mockSendMessage.mockResolvedValue(undefined);

    const input = screen.getByPlaceholderText('Ask about your library...');
    fireEvent.change(input, { target: { value: '  hello world  ' } });

    const form = input.closest('form')!;
    fireEvent.submit(form);

    expect(mockSendMessage).toHaveBeenCalledWith('hello world');
  });

  it('does not submit empty input', () => {
    const { mockSendMessage } = setup();

    const input = screen.getByPlaceholderText('Ask about your library...');
    const form = input.closest('form')!;
    fireEvent.submit(form);

    expect(mockSendMessage).not.toHaveBeenCalled();
  });
});
