// Bridge from the layer-help modals to the chat widget: "Ask the assistant
// about X". The modals and ChatBubble are unrelated components, so they talk
// over the app bus ('ui.ask-assistant' — same pattern as auth.changed /
// ui.start-tutorial).
//
// The pending slot covers the mount race: when the chat is hidden via the View
// menu, App.vue reacts to the event by mounting ChatBubble — which happens
// AFTER the event fired, so the freshly-mounted bubble picks the ask up from
// here instead.

import { bus } from '../Events/bus';

export interface PendingAsk { topic: string }

let pending: PendingAsk | null = null;

export function askAssistant(topic: string): void {
  pending = { topic };
  bus.emit('ui.ask-assistant', { topic });
}

export function consumePendingAsk(): PendingAsk | null {
  const ask = pending;
  pending = null;
  return ask;
}
