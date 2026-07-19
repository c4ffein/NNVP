import { reactive } from 'vue';

// The conversation outlives the chat window: closing it unmounts ChatBubble,
// and the next mount binds back to this same reactive session, so nothing is
// lost. In-memory on purpose — a page reload starts a fresh conversation.
// (Backend-persisted history would be a separate, opt-in feature: the server
// currently never stores conversation content, only usage counters.)
export const chatSession = reactive({
  // What the panel renders ({ role, text, isError }).
  messages: [],
  // What gets sent to the API ({ role, content }).
  history: [],
});

export function resetChatSession() {
  chatSession.messages.splice(0);
  chatSession.history.splice(0);
}
