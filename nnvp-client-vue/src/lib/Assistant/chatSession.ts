import { reactive } from 'vue';
import type { AnthropicMessage } from './anthropicClient';

/**
 * One entry as the chat panel renders it. Besides the two conversation roles,
 * ChatBubble pushes ⚙ 'tool' lines (tool_use activity) and centered 'notice'
 * rows (session events).
 */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'tool' | 'notice';
  text: string;
  isError: boolean;
}

// The conversation outlives the chat window: closing it unmounts ChatBubble,
// and the next mount binds back to this same reactive session, so nothing is
// lost. In-memory on purpose — a page reload starts a fresh conversation.
// (Backend-persisted history would be a separate, opt-in feature: the server
// currently never stores conversation content, only usage counters.)
export const chatSession = reactive({
  // What the panel renders ({ role, text, isError }).
  messages: [] as ChatMessage[],
  // What gets sent to the API ({ role, content }).
  history: [] as AnthropicMessage[],
});

export function resetChatSession(): void {
  chatSession.messages.splice(0);
  chatSession.history.splice(0);
}
