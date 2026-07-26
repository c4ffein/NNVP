/**
 * Chat states: one definition, both modes. Under bun the REAL ChatBubble
 * component is mounted (tests/harness/worldComponents.js); in the browser the
 * real app is clicked. Both implementations control the same two boundaries:
 * localStorage auth + the 'auth.changed' bus event.
 */
import { appTest, logicTest } from '../harness/define';
import { askAssistant, consumePendingAsk } from '../../src/lib/Assistant/askAssistant';
import { bus } from '../../src/lib/Events/bus';

appTest('chat asks to sign in when signed out', async ({ chat, expect }) => {
  await chat.setSignedIn(false);
  await chat.open();
  expect(await chat.connectPromptVisible()).toBe(true);
  expect(await chat.inputEnabled()).toBe(false);
});

appTest('chat is ready once signed in, with no API key involved', async ({ chat, expect }) => {
  await chat.setSignedIn(true);
  await chat.open();
  expect(await chat.connectPromptVisible()).toBe(false);
  expect(await chat.inputEnabled()).toBe(true);
});

appTest('the chat settings gear opens the account panel (never an API key form)', async ({ chat, expect }) => {
  await chat.setSignedIn(false);
  await chat.open();
  expect(await chat.settingsOpensAccountUsage()).toBe(true);
});

appTest('the chat connect prompt leads to the account flow', async ({ chat, expect }) => {
  await chat.setSignedIn(false);
  await chat.open();
  expect(await chat.signInFromPrompt()).toBe(true);
});

// --- Help-modal handoff: "Ask the assistant about X" ------------------------

logicTest('askAssistant bridge: emits the bus event and stores one pending ask', ({ expect }) => {
  consumePendingAsk(); // drain whatever an earlier test left behind
  const received: unknown[] = [];
  const off = bus.on('ui.ask-assistant', payload => received.push(payload));
  try {
    askAssistant('Dense');
    expect(received).toEqual([{ topic: 'Dense' }]);
    expect(consumePendingAsk()).toEqual({ topic: 'Dense' });
    expect(consumePendingAsk()).toBe(null); // consumed exactly once
  } finally {
    off();
  }
});

appTest('help-modal ask seeds the assistant question when signed in', async ({ chat, expect }) => {
  await chat.setSignedIn(true);
  await chat.askAbout('Dense');
  const text = await chat.lastAssistantText();
  expect(text).toContain('What do you want to know about');
  expect(text).toContain('Dense');
});

appTest('help-modal ask blinks the sign-in button when signed out', async ({ chat, expect }) => {
  await chat.setSignedIn(false);
  await chat.askAbout('Dense');
  expect(await chat.signInBlinking()).toBe(true);
});

appTest('the chat window reopens where the user left it', async ({ chat, expect }) => {
  await chat.setSignedIn(true);
  await chat.open();
  const before = await chat.windowPosition();
  await chat.dragWindowBy(-80, -60);
  const moved = await chat.windowPosition();
  expect(Math.round(moved.x - before.x)).toBe(-80);
  expect(Math.round(moved.y - before.y)).toBe(-60);
  await chat.closeWindow();
  await chat.open();
  expect(await chat.windowPosition()).toEqual(moved);
});

appTest('the conversation survives closing and reopening the chat', async ({ chat, expect }) => {
  await chat.setSignedIn(true);
  await chat.open();
  await chat.askAbout('Dense'); // seeds an assistant message without any network
  const seeded = await chat.lastAssistantText();
  expect(seeded).toContain('Dense');
  await chat.closeWindow();
  await chat.open();
  expect(await chat.lastAssistantText()).toBe(seeded);
});
