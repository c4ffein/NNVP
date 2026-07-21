import { reactive } from 'vue';
import type { AnthropicMessage } from './anthropicClient';
import { getRecordStore } from '../LocalStore/db';
import type { RecordStore } from '../LocalStore/recordStore';

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

/**
 * A conversation as the record store (and the backend sync) sees it: the
 * rendered messages AND the API history travel together, so resuming restores
 * both what the user saw and what the model knows. `localOnly` is the one
 * mutable sync flag (a cloud-deleted record must not re-push itself).
 */
export interface ConversationRecord {
  uuid: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  messages: ChatMessage[];
  history: AnthropicMessage[];
  localOnly?: boolean;
}

/** What conversation lists render: no message payloads. */
export interface ConversationSummary {
  uuid: string;
  title: string;
  updatedAt: string;
}

export const EMPTY_TITLE = '(empty)';
const TITLE_MAX = 60;

function truncateTitle(text: string): string {
  return text.length <= TITLE_MAX ? text : `${text.slice(0, TITLE_MAX - 1).trimEnd()}…`;
}

/**
 * First user line, truncated. Help-modal handoffs (askAbout) open with a
 * HIDDEN user turn in the history and no visible user message, so the history
 * is the fallback before giving up with '(empty)' — otherwise every
 * "ask about X" conversation would be an indistinguishable '(empty)' row.
 */
export function deriveConversationTitle(
  messages: ChatMessage[],
  history: AnthropicMessage[] = [],
): string {
  const firstShown = messages.find(m => m.role === 'user' && m.text.trim() !== '');
  if (firstShown) return truncateTitle(firstShown.text.trim());
  const firstTurn = history.find(
    turn => turn.role === 'user' && typeof turn.content === 'string' && turn.content.trim() !== '',
  );
  if (firstTurn) return truncateTitle((firstTurn.content as string).trim());
  return EMPTY_TITLE;
}

// The ACTIVE conversation outlives the chat window: closing it unmounts
// ChatBubble, and the next mount binds back to this same reactive session, so
// nothing is lost. Every completed exchange persists the session as a
// ConversationRecord through the RecordStore (see persistActiveConversation),
// and app start restores the most recent record — so a page reload no longer
// loses the conversation either.
export const chatSession = reactive({
  uuid: crypto.randomUUID() as string,
  createdAt: new Date().toISOString(),
  title: EMPTY_TITLE,
  // What the panel renders ({ role, text, isError }).
  messages: [] as ChatMessage[],
  // What gets sent to the API ({ role, content }).
  history: [] as AnthropicMessage[],
});

/** Reset to a brand-new empty conversation (fresh identity). */
export function resetChatSession(): void {
  chatSession.uuid = crypto.randomUUID();
  chatSession.createdAt = new Date().toISOString();
  chatSession.title = EMPTY_TITLE;
  chatSession.messages.splice(0);
  chatSession.history.splice(0);
}

function sessionHasContent(): boolean {
  return chatSession.messages.length > 0 || chatSession.history.length > 0;
}

/** Load a stored record INTO the reactive session, keeping the array
 *  identities ChatBubble is bound to (splice, never reassign). */
function loadRecordIntoSession(record: ConversationRecord): void {
  chatSession.uuid = record.uuid;
  chatSession.createdAt = record.createdAt;
  chatSession.title = record.title;
  chatSession.messages.splice(0, chatSession.messages.length, ...record.messages);
  chatSession.history.splice(0, chatSession.history.length, ...record.history);
}

/**
 * Upsert the active conversation under its uuid, stamping updatedAt. The
 * record is deep-copied through JSON first: what reaches the store must be a
 * plain JSON-safe object, never Vue's reactive proxies.
 */
export async function persistActiveConversation(
  store: RecordStore = getRecordStore(),
): Promise<void> {
  chatSession.title = deriveConversationTitle(chatSession.messages, chatSession.history);
  const record: ConversationRecord = JSON.parse(JSON.stringify({
    uuid: chatSession.uuid,
    createdAt: chatSession.createdAt,
    updatedAt: new Date().toISOString(),
    title: chatSession.title,
    messages: chatSession.messages,
    history: chatSession.history,
  }));
  await store.put('conversations', record);
}

/** Persist the current conversation (if it says anything) and start fresh. */
export async function startNewConversation(store: RecordStore = getRecordStore()): Promise<void> {
  if (sessionHasContent()) await persistActiveConversation(store);
  resetChatSession();
}

/**
 * Switch the session to a stored conversation: the current one is persisted
 * first (when non-empty), so switching never loses an exchange. Unknown uuid
 * (or resuming the active conversation) is a no-op.
 */
export async function resumeConversation(
  uuid: string,
  store: RecordStore = getRecordStore(),
): Promise<void> {
  if (uuid === chatSession.uuid) return;
  if (sessionHasContent()) await persistActiveConversation(store);
  const record = await store.get<ConversationRecord>('conversations', uuid);
  if (record) loadRecordIntoSession(record);
}

/** All stored conversations, newest-updated first, as list projections. */
export async function listConversations(
  store: RecordStore = getRecordStore(),
): Promise<ConversationSummary[]> {
  const records = await store.list<ConversationRecord>('conversations');
  return records
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(({ uuid, title, updatedAt }) => ({ uuid, title, updatedAt }));
}

/**
 * App start: bind the session to the most recently updated stored
 * conversation, replacing the old lose-everything-on-reload behavior.
 * No stored conversations → keep the fresh empty session (no-op).
 */
export async function restoreLatestConversation(
  store: RecordStore = getRecordStore(),
): Promise<void> {
  const records = await store.list<ConversationRecord>('conversations');
  if (records.length === 0) return;
  const newest = records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]!;
  loadRecordIntoSession(newest);
}
