import { useState, useRef, useEffect } from "react";
import { useSearchParams, useParams, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import Markdown from "react-markdown";
import { useAgent, type Message } from "../hooks/useAgent";
import { MediaCard } from "../components/media/MediaCard";
import styles from "./AgentPage.module.css";

const TOOL_NAMES: Record<string, string> = {
  search_library: "Searching library",
  get_recommendations: "Finding recommendations",
  get_unwatched: "Finding unwatched items",
  get_recently_added: "Checking recent additions",
  get_media_details: "Getting details",
  get_library_stats: "Getting library stats",
};

export function AgentPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { conversationId: urlConversationId } = useParams<{
    conversationId: string;
  }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const serverName = searchParams.get("server");
  const clientIdentifier = searchParams.get("machine");

  const {
    messages,
    isLoading,
    error,
    currentTool,
    conversationId,
    sendMessage,
    loadConversation,
    reset,
  } = useAgent(serverName);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const loadedConversationRef = useRef<string | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Auto-send prompt from query param (e.g., from "Ask Plexy" button)
  const promptParam = searchParams.get("prompt");
  const promptSentRef = useRef(false);

  useEffect(() => {
    if (promptParam && serverName && !isLoading && !promptSentRef.current && messages.length === 0) {
      promptSentRef.current = true;
      sendMessage(promptParam);
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete("prompt");
        return next;
      }, { replace: true });
    }
  }, [promptParam, serverName, isLoading, messages.length, sendMessage, setSearchParams, queryClient]);

  // Load conversation from URL param
  useEffect(() => {
    if (
      urlConversationId &&
      urlConversationId !== loadedConversationRef.current
    ) {
      loadedConversationRef.current = urlConversationId;
      loadConversation(urlConversationId);
    }
  }, [urlConversationId, loadConversation]);

  // Update URL when conversation ID changes (new chat)
  useEffect(() => {
    if (conversationId && !urlConversationId && messages.length > 0) {
      // Mark as already loaded so the load effect doesn't re-fetch
      loadedConversationRef.current = conversationId;
      const params = new URLSearchParams(searchParams);
      navigate(`/agent/${conversationId}?${params.toString()}`, {
        replace: true,
      });
    }
  }, [conversationId, urlConversationId, messages.length, searchParams, navigate]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const message = input.trim();
    setInput("");
    await sendMessage(message);
    // Invalidate conversations list so sidebar refreshes
    queryClient.invalidateQueries({ queryKey: ["conversations"] });
  };

  const handleNewChat = () => {
    reset();
    setInput("");
    loadedConversationRef.current = null;
    const params = new URLSearchParams(searchParams);
    navigate(`/agent?${params.toString()}`);
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          <img
            src="/frowning-plexy.png"
            alt="Plexy"
            className={styles.titleIcon}
          />
          Plexy the Plexbot
        </h1>
        <button onClick={handleNewChat} className={styles.newChatButton}>
          New Chat
        </button>
      </header>

      <div className={styles.messages}>
        {messages.length === 0 ? (
          <div className={styles.emptyState}>
            <p>Ask me about your Plex library!</p>
            <p className={styles.suggestions}>Try:</p>
            <ul className={styles.suggestionList}>
              <li>"What movies do I have?"</li>
              <li>"Recommend something like The Matrix"</li>
              <li>"Show me recently added shows"</li>
              <li>"Find unwatched action movies"</li>
            </ul>
          </div>
        ) : (
          messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              serverName={serverName}
              clientIdentifier={clientIdentifier}
            />
          ))
        )}
        {isLoading && currentTool && (
          <div className={styles.loading}>
            <div className={styles.spinner} />
            <span>{TOOL_NAMES[currentTool] || currentTool}...</span>
          </div>
        )}
        {error && <div className={styles.error}>{error}</div>}
        <div ref={messagesEndRef} />
      </div>

      <div className={styles.inputWrapper}>
        <form className={styles.inputForm} onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your library..."
            className={styles.input}
            disabled={isLoading || !serverName}
          />
          <button
            type="submit"
            className={styles.sendButton}
            disabled={isLoading || !input.trim() || !serverName}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M18 10L2 2L5 10L2 18L18 10Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}

interface MessageBubbleProps {
  message: Message;
  serverName: string | null;
  clientIdentifier: string | null;
}

function MessageBubble({
  message,
  serverName,
  clientIdentifier,
}: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div
      className={`${styles.messageBubble} ${
        isUser ? styles.userMessage : styles.assistantMessage
      }`}
    >
      <div className={styles.messageContent}>
        {isUser ? (
          message.content
        ) : (
          <>
            <Markdown>{message.content}</Markdown>
            {message.isStreaming && <span className={styles.cursor}>|</span>}
          </>
        )}
      </div>
      {message.mediaItems.length > 0 && (
        <div className={styles.mediaGrid}>
          {message.mediaItems.map((item) => (
            <MediaCard
              key={item.rating_key}
              item={item}
              serverName={serverName}
              clientIdentifier={clientIdentifier}
            />
          ))}
        </div>
      )}
    </div>
  );
}
