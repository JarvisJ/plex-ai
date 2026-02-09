"""Agent service for handling chat interactions with the Plex assistant."""

import uuid

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_openai import ChatOpenAI
from plexapi.myplex import MyPlexAccount
from plexapi.server import PlexServer
from pydantic import SecretStr

from app.agents.plex import create_plex_tools
from app.config import Settings
from app.models.agent import AgentMessage, ChatResponse
from app.models.media import MediaItem

SYSTEM_PROMPT = """You are a helpful Plex media assistant. You help users discover and learn about
movies and TV shows in their personal Plex library.

Your capabilities:
- Search the user's library by title, genre, or year
- Recommend content based on preferences, mood, or similar titles
- Show what's on the user's watchlist
- Find unwatched content
- Show recently added items
- Provide detailed information about specific titles
- Show library statistics

Guidelines:
- Always search the user's actual library - don't make up titles
- When recommending, explain why each item might appeal to the user
- If you can't find something, suggest alternatives from their library
- Keep responses concise but informative
- When you use tools that return media items, include those items in your response
- Format your responses nicely with the key information about each item"""


class PlexAgentService:
    """Service for managing the Plex chat agent."""

    # In-memory conversation storage (per server)
    _conversations: dict[str, list[HumanMessage | AIMessage | SystemMessage | ToolMessage]] = {}

    def __init__(self, plex_token: str, settings: Settings, server_name: str):
        self.plex_token = plex_token
        self.settings = settings
        self.server_name = server_name
        self._account: MyPlexAccount | None = None
        self._llm: ChatOpenAI | None = None

    @property
    def account(self) -> MyPlexAccount:
        """Lazy-load the MyPlexAccount instance."""
        if self._account is None:
            self._account = MyPlexAccount(token=self.plex_token, timeout=60)
        return self._account

    def _get_llm(self) -> ChatOpenAI:
        """Get the LLM instance."""
        if self._llm is None:
            self._llm = ChatOpenAI(
                model=self.settings.llm_model,
                api_key=SecretStr(self.settings.openai_api_key),
                temperature=0.7,
            )
        return self._llm

    def _connect_to_server(self) -> PlexServer:
        """Connect to a Plex server by name."""
        resource = self.account.resource(self.server_name)
        return resource.connect(ssl=False, timeout=60)  # type: ignore[no-any-return]

    def chat(self, message: str, conversation_id: str | None = None) -> ChatResponse:
        """Process a chat message and return a response."""
        # Generate or use existing conversation ID
        if conversation_id is None:
            conversation_id = str(uuid.uuid4())

        # Get or initialize conversation history
        if conversation_id not in self._conversations:
            self._conversations[conversation_id] = [SystemMessage(content=SYSTEM_PROMPT)]

        history = self._conversations[conversation_id]

        # Add user message to history
        history.append(HumanMessage(content=message))

        # Connect to Plex server and create tools
        server = self._connect_to_server()
        tools = create_plex_tools(server)

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

        return ChatResponse(
            conversation_id=conversation_id,
            message=AgentMessage(
                role="assistant",
                content=final_response,
                media_items=collected_media_items,
            ),
        )

    def clear_conversation(self, conversation_id: str) -> bool:
        """Clear a conversation from memory."""
        if conversation_id in self._conversations:
            del self._conversations[conversation_id]
            return True
        return False
