/**
 * Chat states: one definition, both modes. Under bun the REAL ChatBubble
 * component is mounted (tests/dual/worldComponents.js); in the browser the
 * real app is clicked. Both implementations control the same two boundaries:
 * localStorage auth + the nnvp:auth-changed event.
 */
import { appTest } from '../define';

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

appTest('chat settings never ask for an API key', async ({ chat, expect }) => {
  await chat.setSignedIn(false);
  await chat.open();
  expect(await chat.settingsAsksForApiKey()).toBe(false);
});

appTest('the chat connect prompt leads to the account flow', async ({ chat, expect }) => {
  await chat.setSignedIn(false);
  await chat.open();
  expect(await chat.signInFromPrompt()).toBe(true);
});
