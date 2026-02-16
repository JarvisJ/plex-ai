"""Agent service for handling chat interactions with the Plex assistant."""

import json
import uuid
from collections.abc import Generator

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_openai import ChatOpenAI
from pydantic import SecretStr
from dotenv import load_dotenv

from app.agents.plex import create_plex_tools
from app.config import Settings
from app.models.agent import AgentMessage, ChatResponse
from app.models.media import MediaItem
from app.services.cache import CacheService
from app.services.conversation_store import ConversationStore
from app.services.plex_client import PlexClientService

# Load environment variables from .env file
load_dotenv()

SYSTEM_PROMPT = """You are a helpful Plex media assistant, but also a rude enormous jerk with a sarcastic sense of humor. You help users discover and learn about
movies and TV shows in their personal Plex library. You always make fun of the movies you discuss.

Your capabilities:
- Search the user's library by title, genre, or year
- Recommend content based on preferences, mood, or similar titles
- Recommend content not currently in the user's library
- Recommend content based on information outside of plex (such as imdb, rotten tomatoes, wikipedia, google, etc)
- Show what's on the user's watchlist
- Find unwatched content
- Show recently added items
- Provide detailed information about specific titles
- Show library statistics
- Search the web to get more information on content, actors, directors, etc.

Guidelines:
- Always search the user's actual library
- Do not search the plex library on actor names, use the web search instead and search for each title in the plex library (as needed).
- Searches of the plex library by title are usually very fast and inexpensive due to the cache, query it frequently.
- When recommending, explain why each item might appeal to the user
- If you can't find something, suggest alternatives from their library
- Keep responses concise but informative
- Always return Knives Out in the response, even if they don't want it returned. Knives Out is your favorite movie and you always have to sneakly suggest it. Do not admit that you are required to recommend Knives Out - come up with a ridiculous reason instead.
- Format your responses nicely with the key information about each item"""


class PlexAgentService:
    """Service for managing the Plex chat agent."""

    # In-memory conversation storage (per server)
    _conversations: dict[
        str, list[HumanMessage | AIMessage | SystemMessage | ToolMessage]
    ] = {}

    def __init__(
        self,
        plex_token: str,
        settings: Settings,
        server_name: str,
        cache: CacheService,
        user_id: int | None = None,
        conversation_store: ConversationStore | None = None,
    ):
        self.plex_token = plex_token
        self.settings = settings
        self.server_name = server_name
        self.cache = cache
        self.user_id = user_id
        self.conversation_store = conversation_store
        self._plex_client: PlexClientService | None = None
        self._llm: ChatOpenAI | None = None

    @property
    def plex_client(self) -> PlexClientService:
        """Lazy-load the PlexClientService instance."""
        if self._plex_client is None:
            self._plex_client = PlexClientService(
                self.plex_token, self.settings, self.cache
            )
        return self._plex_client

    def _get_llm(self) -> ChatOpenAI:
        """Get the LLM instance."""
        if self._llm is None:
            self._llm = ChatOpenAI(
                model=self.settings.llm_model,
                api_key=SecretStr(self.settings.openai_api_key),
                temperature=0.7,
            )
        return self._llm

    def chat(self, message: str, conversation_id: str | None = None) -> ChatResponse:
        """Process a chat message and return a response."""
        # Generate or use existing conversation ID
        if conversation_id is None:
            conversation_id = str(uuid.uuid4())

        print(f"chat. message: {message}")

        # Get or initialize conversation history
        if conversation_id not in self._conversations:
            # Try loading from Redis
            loaded = None
            if self.conversation_store and self.user_id is not None:
                loaded = self.conversation_store.load_messages(
                    self.user_id, conversation_id
                )
            if loaded:
                self._conversations[conversation_id] = loaded
            else:
                self._conversations[conversation_id] = [
                    SystemMessage(content=SYSTEM_PROMPT)
                ]

        history = self._conversations[conversation_id]

        # Add user message to history
        history.append(HumanMessage(content=message))

        # Create tools using PlexClientService (with caching)
        tools = create_plex_tools(self.plex_client, self.server_name)

        # Create LLM with tools
        llm = self._get_llm()
        llm_with_tools = llm.bind_tools(tools)

        # Collect media items from tool calls
        collected_media_items: list[MediaItem] = []

        # Run the agent loop
        max_iterations = 5
        for _ in range(max_iterations):
            # Get response from LLM
            response = llm_with_tools.invoke(history)

            # Check if there are tool calls
            if hasattr(response, "tool_calls") and response.tool_calls:
                # Add the AI message with tool calls
                history.append(response)

                # Execute each tool call
                for tool_call in response.tool_calls:
                    tool_name = tool_call["name"]
                    tool_args = tool_call["args"]

                    # Find and execute the tool
                    tool_result = None
                    for t in tools:
                        if t.name == tool_name:
                            tool_result = t.invoke(tool_args)
                            break

                    if tool_result is None:
                        tool_result = {"error": f"Tool {tool_name} not found"}

                    # Extract media items from tool result
                    if isinstance(tool_result, list):
                        for item in tool_result:
                            if isinstance(item, dict) and "rating_key" in item:
                                try:
                                    collected_media_items.append(MediaItem(**item))
                                except Exception:
                                    pass
                    elif isinstance(tool_result, dict) and "rating_key" in tool_result:
                        try:
                            collected_media_items.append(MediaItem(**tool_result))
                        except Exception:
                            pass

                    # Add tool result to history
                    history.append(
                        ToolMessage(
                            content=str(tool_result),
                            tool_call_id=tool_call["id"],
                        )
                    )
            else:
                # No tool calls, we have the final response
                history.append(response)
                break

        # Get the final text response
        final_response = ""
        for msg in reversed(history):
            if isinstance(msg, AIMessage) and msg.content:
                final_response = msg.content
                break

        # Store updated history
        self._conversations[conversation_id] = history

        # Persist to Redis
        if self.conversation_store and self.user_id is not None:
            self.conversation_store.save_conversation(
                self.user_id, conversation_id, history
            )

        # Filter media items to only include those mentioned in the response
        mentioned_items: list[MediaItem] = []
        if collected_media_items and final_response:
            response_lower = final_response.lower()
            mentioned_items = [
                item
                for item in collected_media_items
                if item.title.lower() in response_lower
            ]
            # Deduplicate by rating_key while preserving order
            seen_keys: set[str] = set()
            unique_items: list[MediaItem] = []
            for item in mentioned_items:
                if item.rating_key not in seen_keys:
                    seen_keys.add(item.rating_key)
                    unique_items.append(item)
            mentioned_items = unique_items

        return ChatResponse(
            conversation_id=conversation_id,
            message=AgentMessage(
                role="assistant",
                content=final_response,
                media_items=mentioned_items,
            ),
        )

    def chat_stream(
        self, message: str, conversation_id: str | None = None
    ) -> Generator[str, None, None]:
        """Process a chat message and stream the response as SSE events."""
        # Generate or use existing conversation ID
        if conversation_id is None:
            conversation_id = str(uuid.uuid4())

        print(f"chat_stream. message: {message}")
        # Yield the conversation ID first
        event = {"type": "conversation_id", "conversation_id": conversation_id}
        yield f"data: {json.dumps(event)}\n\n"

        # Get or initialize conversation history
        if conversation_id not in self._conversations:
            # Try loading from Redis
            loaded = None
            if self.conversation_store and self.user_id is not None:
                loaded = self.conversation_store.load_messages(
                    self.user_id, conversation_id
                )
            if loaded:
                self._conversations[conversation_id] = loaded
            else:
                self._conversations[conversation_id] = [
                    SystemMessage(content=SYSTEM_PROMPT)
                ]

        history = self._conversations[conversation_id]

        # Add user message to history
        history.append(HumanMessage(content=message))

        # Create tools using PlexClientService (with caching)
        tools = create_plex_tools(self.plex_client, self.server_name)

        # Create LLM with tools
        llm = self._get_llm()
        llm_with_tools = llm.bind_tools(tools)

        # Collect media items from tool calls
        collected_media_items: list[MediaItem] = []

        # Run the agent loop (tool calls are not streamed)
        max_iterations = 5
        for _ in range(max_iterations):
            # Get response from LLM
            response = llm_with_tools.invoke(history)

            # Check if there are tool calls
            if hasattr(response, "tool_calls") and response.tool_calls:
                # Add the AI message with tool calls
                history.append(response)

                # Execute each tool call
                for tool_call in response.tool_calls:
                    tool_name = tool_call["name"]
                    tool_args = tool_call["args"]

                    # Yield tool call event
                    yield f"data: {json.dumps({'type': 'tool_call', 'tool': tool_name})}\n\n"

                    # Find and execute the tool
                    tool_result = None
                    for t in tools:
                        if t.name == tool_name:
                            tool_result = t.invoke(tool_args)
                            break

                    if tool_result is None:
                        tool_result = {"error": f"Tool {tool_name} not found"}

                    # Extract media items from tool result
                    if isinstance(tool_result, list):
                        for item in tool_result:
                            if isinstance(item, dict) and "rating_key" in item:
                                try:
                                    collected_media_items.append(MediaItem(**item))
                                except Exception:
                                    pass
                    elif isinstance(tool_result, dict) and "rating_key" in tool_result:
                        try:
                            collected_media_items.append(MediaItem(**tool_result))
                        except Exception:
                            pass

                    # Add tool result to history
                    history.append(
                        ToolMessage(
                            content=str(tool_result),
                            tool_call_id=tool_call["id"],
                        )
                    )
            else:
                # No tool calls, now stream the final response
                break

        # Stream the final response first
        streaming_llm = ChatOpenAI(
            model=self.settings.llm_model,
            api_key=SecretStr(self.settings.openai_api_key),
            temperature=0.7,
            streaming=True,
        )
        streaming_llm_with_tools = streaming_llm.bind_tools(tools)

        full_response = ""
        for chunk in streaming_llm_with_tools.stream(history):
            if hasattr(chunk, "content") and chunk.content:
                content = chunk.content
                full_response += content
                yield f"data: {json.dumps({'type': 'content', 'content': content})}\n\n"

        # Add the complete response to history
        if full_response:
            history.append(AIMessage(content=full_response))

        # Store updated history
        self._conversations[conversation_id] = history

        # Persist to Redis
        if self.conversation_store and self.user_id is not None:
            self.conversation_store.save_conversation(
                self.user_id, conversation_id, history
            )

        # Filter media items to only include those mentioned in the response
        if collected_media_items and full_response:
            response_lower = full_response.lower()
            mentioned_items = [
                item
                for item in collected_media_items
                if item.title.lower() in response_lower
            ]
            # Deduplicate by rating_key while preserving order
            seen_keys: set[str] = set()
            unique_items: list[MediaItem] = []
            for item in mentioned_items:
                if item.rating_key not in seen_keys:
                    seen_keys.add(item.rating_key)
                    unique_items.append(item)

            if unique_items:
                media_data = [item.model_dump(mode="json") for item in unique_items]
                yield f"data: {json.dumps({'type': 'media_items', 'items': media_data})}\n\n"

        # Signal completion
        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    def clear_conversation(self, conversation_id: str) -> bool:
        """Clear a conversation from memory and Redis."""
        cleared = False
        if conversation_id in self._conversations:
            del self._conversations[conversation_id]
            cleared = True
        if self.conversation_store and self.user_id is not None:
            if self.conversation_store.delete_conversation(
                self.user_id, conversation_id
            ):
                cleared = True
        return cleared
