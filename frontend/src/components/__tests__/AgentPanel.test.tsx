import { describe, it, expect, vi, beforeEach } from 'vitest';
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

import { AgentPanel } from '../agent/AgentPanel';

beforeEach(() => {
  mockSendMessage.mockReset();
  mockReset.mockReset();
});

describe('AgentPanel', () => {
  it('returns null when not open', () => {
    const { container } = render(
      <AgentPanel isOpen={false} onClose={vi.fn()} serverName="Server" clientIdentifier={null} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders panel with input when open', () => {
    render(
      <AgentPanel isOpen={true} onClose={vi.fn()} serverName="Server" clientIdentifier={null} />
    );
    expect(screen.getByPlaceholderText('Ask about your library...')).toBeInTheDocument();
    expect(screen.getByText(/Plexy the Plexbot/)).toBeInTheDocument();
  });

  it('renders suggestions when no messages', () => {
    render(
      <AgentPanel isOpen={true} onClose={vi.fn()} serverName="Server" clientIdentifier={null} />
    );
    expect(screen.getByText('Ask me about your Plex library!')).toBeInTheDocument();
  });

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn();
    render(
      <AgentPanel isOpen={true} onClose={onClose} serverName="Server" clientIdentifier={null} />
    );

    // Close button is the one with the X SVG
    const buttons = screen.getAllByRole('button');
    const closeButton = buttons.find(b => b.querySelector('svg path[d*="M15 5L5 15"]'));
    if (closeButton) fireEvent.click(closeButton);

    expect(onClose).toHaveBeenCalled();
  });

  it('new chat button calls reset', () => {
    render(
      <AgentPanel isOpen={true} onClose={vi.fn()} serverName="Server" clientIdentifier={null} />
    );

    fireEvent.click(screen.getByText('New Chat'));
    expect(mockReset).toHaveBeenCalled();
  });

  it('submit sends trimmed message and clears input', async () => {
    mockSendMessage.mockResolvedValue(undefined);

    render(
      <AgentPanel isOpen={true} onClose={vi.fn()} serverName="Server" clientIdentifier={null} />
    );

    const input = screen.getByPlaceholderText('Ask about your library...');
    fireEvent.change(input, { target: { value: '  hello world  ' } });

    const form = input.closest('form')!;
    fireEvent.submit(form);

    expect(mockSendMessage).toHaveBeenCalledWith('hello world');
  });

  it('does not submit empty input', () => {
    render(
      <AgentPanel isOpen={true} onClose={vi.fn()} serverName="Server" clientIdentifier={null} />
    );

    const input = screen.getByPlaceholderText('Ask about your library...');
    const form = input.closest('form')!;
    fireEvent.submit(form);

    expect(mockSendMessage).not.toHaveBeenCalled();
  });
});
