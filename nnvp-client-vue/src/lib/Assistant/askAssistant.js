// Bridge from the layer-help modals to the chat widget: "Ask the assistant
// about X". The modals and ChatBubble are unrelated components, so they talk
// over a window event (same pattern as nnvp:auth-changed / nnvp:start-tutorial).
//
// The pending slot covers the mount race: when the chat is hidden via the View
// menu, App.vue reacts to the event by mounting ChatBubble — which happens
// AFTER the event fired, so the freshly-mounted bubble picks the ask up from
// here instead.

export const ASK_EVENT = 'nnvp:ask-assistant';

let pending = null;

export function askAssistant(topic) {
  pending = { topic };
  window.dispatchEvent(new CustomEvent(ASK_EVENT, { detail: { topic } }));
}

export function consumePendingAsk() {
  const ask = pending;
  pending = null;
  return ask;
}
