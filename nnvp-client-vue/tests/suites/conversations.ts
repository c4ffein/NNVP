/**
 * Chat conversations as persistent records (PLAN Phase 5): the active session
 * persists through the RecordStore seam, reloads restore the newest
 * conversation, and the user can start a new one or resume any stored one.
 *
 * logicTests inject a MemoryRecordStore (the house injection style); appTests
 * drive the REAL ChatBubble through the chat world and swap the app-wide
 * store singleton for an isolated in-memory one around each body.
 */
import { isReactive } from 'vue';
import { appTest, logicTest } from '../harness/define';
import { consumePendingAsk } from '../../src/lib/Assistant/askAssistant';
import {
  chatSession,
  deriveConversationTitle,
  listConversations,
  persistActiveConversation,
  resetChatSession,
  restoreLatestConversation,
  resumeConversation,
  startNewConversation,
} from '../../src/lib/Assistant/chatSession';
import type { ChatMessage, ConversationRecord } from '../../src/lib/Assistant/chatSession';
import { MemoryRecordStore } from '../../src/lib/LocalStore/recordStore';
import type { RecordStoreName, StoredRecord } from '../../src/lib/LocalStore/recordStore';
import { setRecordStoreForTests } from '../../src/lib/LocalStore/db';

/** Captures the exact object handed to put() — MemoryRecordStore's own JSON
 *  copy would hide whether persist stripped reactivity before storing. */
class RecordingStore extends MemoryRecordStore {
  lastPut: StoredRecord | null = null;

  async put(store: RecordStoreName, record: StoredRecord): Promise<void> {
    this.lastPut = record;
    await super.put(store, record);
  }
}

const userMessage = (text: string): ChatMessage => ({ role: 'user', text, isError: false });

/** Push one visible user turn onto the ACTIVE session (no reset). */
function speakInSession(text: string): void {
  chatSession.messages.push(userMessage(text));
  chatSession.history.push({ role: 'user', content: text });
}

/** A minimal stored record, for seeding stores directly. */
function record(uuid: string, updatedAt: string, text: string): ConversationRecord {
  return {
    uuid,
    createdAt: updatedAt,
    updatedAt,
    title: text,
    messages: [userMessage(text)],
    history: [{ role: 'user', content: text }],
  };
}

// --- Persistence round-trip --------------------------------------------------

logicTest('conversations: persist round-trips plain JSON and stamps updatedAt', async ({ expect }) => {
  const store = new RecordingStore();
  resetChatSession();
  try {
    speakInSession('does my model overfit?');
    const before = Date.now();
    await persistActiveConversation(store);

    // What reached the store is a plain deep copy, never the reactive session.
    const put = store.lastPut as ConversationRecord;
    expect(isReactive(put)).toBe(false);
    expect(isReactive(put.messages)).toBe(false);
    expect(put.messages === chatSession.messages).toBe(false);

    const stored = await store.get<ConversationRecord>('conversations', chatSession.uuid);
    expect(stored === null).toBe(false);
    expect(stored!.messages).toEqual([userMessage('does my model overfit?')]);
    expect(stored!.history).toEqual([{ role: 'user', content: 'does my model overfit?' }]);
    expect(stored!.title).toBe('does my model overfit?');
    expect(stored!.createdAt).toBe(chatSession.createdAt);
    expect(Date.parse(stored!.updatedAt) >= before - 1).toBe(true);
  } finally {
    resetChatSession();
  }
});

// --- Title derivation ----------------------------------------------------------

logicTest('conversations: title is the first user line, truncated, (empty) fallback', ({ expect }) => {
  expect(deriveConversationTitle([])).toBe('(empty)');
  expect(deriveConversationTitle([
    { role: 'assistant', text: 'hello!', isError: false },
    { role: 'tool', text: '⚙ get_layers', isError: false },
  ])).toBe('(empty)');

  expect(deriveConversationTitle([
    { role: 'assistant', text: 'What do you want to know?', isError: false },
    userMessage('  add a Dense layer  '),
    userMessage('now another'),
  ])).toBe('add a Dense layer');

  const long = 'x'.repeat(100);
  const title = deriveConversationTitle([userMessage(long)]);
  expect(title.length <= 60).toBe(true);
  expect(title.startsWith('x'.repeat(59))).toBe(true);
  expect(title.endsWith('…')).toBe(true);

  // Help-modal handoffs have no VISIBLE user line — the hidden history user
  // turn names the conversation instead of collapsing it to '(empty)'.
  expect(deriveConversationTitle(
    [{ role: 'assistant', text: 'What about Dense?', isError: false }],
    [{ role: 'user', content: '(I opened the in-app help for "Dense".)' }],
  )).toBe('(I opened the in-app help for "Dense".)');
});

// --- New / resume ------------------------------------------------------------

logicTest('conversations: startNewConversation persists the old one and mints a fresh uuid', async ({ expect }) => {
  const store = new MemoryRecordStore();
  resetChatSession();
  try {
    speakInSession('first question');
    const oldUuid = chatSession.uuid;
    await startNewConversation(store);

    expect(chatSession.uuid === oldUuid).toBe(false);
    expect(chatSession.messages.length).toBe(0);
    expect(chatSession.history.length).toBe(0);

    const stored = await store.get<ConversationRecord>('conversations', oldUuid);
    expect(stored!.title).toBe('first question');
    expect(stored!.messages).toEqual([userMessage('first question')]);

    // A contentless session is NOT journaled as an '(empty)' record.
    const freshUuid = chatSession.uuid;
    await startNewConversation(store);
    expect(await store.get('conversations', freshUuid)).toBe(null);
  } finally {
    resetChatSession();
  }
});

logicTest('conversations: resumeConversation swaps messages+history and persists the previous one', async ({ expect }) => {
  const store = new MemoryRecordStore();
  resetChatSession();
  try {
    speakInSession('first question');
    const firstUuid = chatSession.uuid;
    await startNewConversation(store);
    speakInSession('second question');
    const secondUuid = chatSession.uuid;

    await resumeConversation(firstUuid, store);

    expect(chatSession.uuid).toBe(firstUuid);
    expect(chatSession.messages).toEqual([userMessage('first question')]);
    expect(chatSession.history).toEqual([{ role: 'user', content: 'first question' }]);
    expect(chatSession.title).toBe('first question');

    // The conversation we switched AWAY from was persisted, not lost.
    const previous = await store.get<ConversationRecord>('conversations', secondUuid);
    expect(previous!.title).toBe('second question');

    // Unknown uuid: the session is left alone.
    await resumeConversation('no-such-uuid', store);
    expect(chatSession.uuid).toBe(firstUuid);
  } finally {
    resetChatSession();
  }
});

// --- Listing / restoring -------------------------------------------------------

logicTest('conversations: listConversations orders newest-updated first', async ({ expect }) => {
  const store = new MemoryRecordStore();
  await store.put('conversations', record('a', '2026-01-01T00:00:00.000Z', 'oldest'));
  await store.put('conversations', record('b', '2026-03-01T00:00:00.000Z', 'newest'));
  await store.put('conversations', record('c', '2026-02-01T00:00:00.000Z', 'middle'));

  const list = await listConversations(store);
  expect(list.map(item => item.uuid)).toEqual(['b', 'c', 'a']);
  expect(list[0]).toEqual({ uuid: 'b', title: 'newest', updatedAt: '2026-03-01T00:00:00.000Z' });
});

logicTest('conversations: restoreLatestConversation loads the newest and no-ops on an empty store', async ({ expect }) => {
  resetChatSession();
  try {
    // Empty store: the fresh session stays exactly as it was.
    const empty = new MemoryRecordStore();
    const freshUuid = chatSession.uuid;
    await restoreLatestConversation(empty);
    expect(chatSession.uuid).toBe(freshUuid);
    expect(chatSession.messages.length).toBe(0);

    const store = new MemoryRecordStore();
    await store.put('conversations', record('older', '2026-01-01T00:00:00.000Z', 'older talk'));
    await store.put('conversations', record('newer', '2026-06-01T00:00:00.000Z', 'newer talk'));
    await restoreLatestConversation(store);
    expect(chatSession.uuid).toBe('newer');
    expect(chatSession.messages).toEqual([userMessage('newer talk')]);
    expect(chatSession.history).toEqual([{ role: 'user', content: 'newer talk' }]);
  } finally {
    resetChatSession();
  }
});

// --- Through the real ChatBubble ----------------------------------------------

appTest('chat: the new-conversation button empties the panel', async ({ chat, expect }) => {
  consumePendingAsk(); // an earlier askAbout leaves a pending slot the next mount would replay
  setRecordStoreForTests(new MemoryRecordStore()); // isolate from other suites' records
  try {
    await chat.setSignedIn(true);
    await chat.open();
    await chat.askAbout('Dense'); // seeds an exchange without any network
    expect(await chat.visibleMessageCount()).toBe(1);

    await chat.startNewConversation();
    expect(await chat.visibleMessageCount()).toBe(0);
  } finally {
    setRecordStoreForTests(null);
  }
});

appTest('chat: resuming a stored conversation re-renders its messages', async ({ chat, expect }) => {
  consumePendingAsk(); // see above: never let a leftover ask replay on mount
  setRecordStoreForTests(new MemoryRecordStore());
  try {
    await chat.setSignedIn(true);
    await chat.open();
    await chat.askAbout('Dense');
    await chat.startNewConversation();
    await chat.askAbout('Conv2D');

    const titles = await chat.conversationTitles();
    expect(titles.length).toBe(2);
    const denseIndex = titles.findIndex(title => title.includes('Dense'));
    expect(denseIndex === -1).toBe(false);

    await chat.resumeConversation(denseIndex);
    expect(await chat.visibleMessageCount()).toBe(1);
    expect(await chat.lastAssistantText()).toContain('Dense');
  } finally {
    setRecordStoreForTests(null);
  }
});

// --- Deleting (PLAN Phase 6) ---------------------------------------------------

appTest('chat: signed out, deleting a conversation offers the device copy only', async ({ chat, expect }) => {
  consumePendingAsk(); // never let a leftover ask replay on mount
  const store = new MemoryRecordStore();
  await store.put('conversations', record('stored-1', '2026-01-01T00:00:00.000Z', 'stored talk'));
  setRecordStoreForTests(store);
  try {
    await chat.setSignedIn(false);
    await chat.open();

    // Signed out there is no cloud location to offer (and nothing to ask).
    const offered = await chat.requestDeleteConversation(0);
    expect(offered).toEqual(['device']);

    // Cancel is a real exit: the row comes back untouched.
    await chat.confirmDeleteConversation('Cancel');
    expect((await chat.conversationTitles()).length).toBe(1);
    expect((await listConversations(store)).length).toBe(1);
  } finally {
    setRecordStoreForTests(null);
  }
});

appTest('chat: deleting a non-active conversation from the device removes its row', async ({ chat, expect }) => {
  consumePendingAsk();
  setRecordStoreForTests(new MemoryRecordStore());
  try {
    await chat.setSignedIn(true);
    await chat.open();
    await chat.askAbout('Dense');
    await chat.startNewConversation();
    await chat.askAbout('Conv2D'); // the ACTIVE conversation

    const titles = await chat.conversationTitles();
    expect(titles.length).toBe(2);
    const denseIndex = titles.findIndex(title => title.includes('Dense'));
    expect(denseIndex === -1).toBe(false);

    // Signed in but the API is unreachable in tests: the offer degrades to
    // the device copy instead of failing.
    const offered = await chat.requestDeleteConversation(denseIndex);
    expect(offered).toEqual(['device']);
    await chat.confirmDeleteConversation('device');

    const remaining = await chat.conversationTitles();
    expect(remaining.length).toBe(1);
    expect(remaining[0]).toContain('Conv2D');
    // The active conversation was not the one deleted: the panel kept it.
    expect(await chat.visibleMessageCount()).toBe(1);
  } finally {
    setRecordStoreForTests(null);
  }
});

appTest('chat: deleting the ACTIVE conversation empties the panel and does not resurrect it', async ({ chat, expect }) => {
  consumePendingAsk();
  const store = new MemoryRecordStore();
  setRecordStoreForTests(store);
  try {
    await chat.setSignedIn(true);
    await chat.open();
    await chat.askAbout('Dense');
    expect(await chat.visibleMessageCount()).toBe(1);
    expect((await chat.conversationTitles()).length).toBe(1);

    await chat.requestDeleteConversation(0);
    await chat.confirmDeleteConversation('device');

    // The live session reset to a fresh empty conversation…
    expect(await chat.visibleMessageCount()).toBe(0);
    expect((await chat.conversationTitles()).length).toBe(0);
    // …and the reset did NOT re-persist the record we just deleted
    // (startNewConversation would have; the delete path must not).
    expect(await listConversations(store)).toEqual([]);
  } finally {
    setRecordStoreForTests(null);
  }
});
