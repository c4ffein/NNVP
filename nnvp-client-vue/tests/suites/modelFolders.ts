/**
 * Folders as a namespace over content-addressed models (Phase H5, c4ffein's
 * unix design): folders form a strict tree; models (workHash "inodes") are
 * hard-linked from any number of folders. No folder-links → cycles are
 * impossible BY CONSTRUCTION. Events fold to the current tree; link/unlink
 * resolve by causal order like hide/unhide.
 */
import { logicTest } from '../harness/define';
import {
  foldFolders, normalizePath, planDelete, planRenameFolder,
} from '../../src/lib/Training/modelFolders';
import type { DomainEvent } from '../../src/lib/Events/domainEvent';

let counter = 0;
function folderEvent(type: string, payload: unknown): DomainEvent {
  counter += 1;
  return {
    uuid: `fold-${counter}`,
    type,
    streamId: null,
    deviceId: 'device-a',
    instanceId: 'instance-1',
    seq: counter,
    dependsOn: [],
    wallTime: '2026-08-04T12:00:00.000Z',
    payload,
  };
}

logicTest('modelFolders: normalizePath cleans slashes and refuses escapes', ({ expect }) => {
  expect(normalizePath('experiments/conv')).toBe('/experiments/conv');
  expect(normalizePath('//experiments///conv/')).toBe('/experiments/conv');
  expect(normalizePath('/a/../b')).toBeNull(); // no traversal games
  expect(normalizePath('')).toBeNull();
  expect(normalizePath('/')).toBeNull();
});

logicTest('modelFolders: one model, many folders — unix hard links', ({ expect }) => {
  const tree = foldFolders([
    folderEvent('folder.linked', { path: '/favorites', workHash: 'model-A' }),
    folderEvent('folder.linked', { path: '/experiments/conv', workHash: 'model-A' }),
    folderEvent('folder.linked', { path: '/experiments/conv', workHash: 'model-B' }),
  ]);
  expect(tree.folders).toEqual(['/experiments/conv', '/favorites']);
  expect(tree.contents.get('/experiments/conv')).toEqual(['model-A', 'model-B']);
  // The reverse lookup: "where else is this saved?"
  expect(tree.byModel.get('model-A')).toEqual(['/experiments/conv', '/favorites']);
});

logicTest('modelFolders: unlink removes one link, not the model elsewhere', ({ expect }) => {
  const tree = foldFolders([
    folderEvent('folder.linked', { path: '/a', workHash: 'm' }),
    folderEvent('folder.linked', { path: '/b', workHash: 'm' }),
    folderEvent('folder.unlinked', { path: '/a', workHash: 'm' }),
  ]);
  expect(tree.contents.get('/b')).toEqual(['m']);
  expect(tree.byModel.get('m')).toEqual(['/b']);
  // '/a' had only that link and was never explicitly created: it is gone.
  expect(tree.folders).toEqual(['/b']);
});

logicTest('modelFolders: created folders exist while empty; removal needs them empty', ({ expect }) => {
  const tree = foldFolders([
    folderEvent('folder.created', { path: '/keep' }),
    folderEvent('folder.created', { path: '/gone' }),
    folderEvent('folder.removed', { path: '/gone' }),
    folderEvent('folder.removed', { path: '/still-linked' }),
    folderEvent('folder.linked', { path: '/still-linked', workHash: 'm' }),
  ]);
  expect(tree.folders).toContain('/keep');
  expect(tree.folders).not.toContain('/gone');
  // Links are the truth: a "removed" folder that still holds links survives.
  expect(tree.folders).toContain('/still-linked');
});

logicTest('modelFolders: duplicate delivery and garbage never poison the fold', ({ expect }) => {
  const link = folderEvent('folder.linked', { path: '/a', workHash: 'm' });
  const tree = foldFolders([
    link, link,
    folderEvent('folder.linked', { nonsense: true }),
    folderEvent('folder.linked', { path: 'no-slash-gets-normalized', workHash: 'x' }),
  ]);
  expect(tree.contents.get('/a')).toEqual(['m']);
  expect(tree.contents.get('/no-slash-gets-normalized')).toEqual(['x']);
});

logicTest('modelFolders: planDelete gathers a subtree — every link, every folder, deepest first', ({ expect }) => {
  const tree = foldFolders([
    folderEvent('folder.created', { path: '/a' }),
    folderEvent('folder.created', { path: '/a/b' }),
    folderEvent('folder.linked', { path: '/a', workHash: 'm1' }),
    folderEvent('folder.linked', { path: '/a/b', workHash: 'm2' }),
    folderEvent('folder.linked', { path: '/keep', workHash: 'm3' }),
  ]);
  const plan = planDelete(tree, ['/a'], [{ path: '/keep', workHash: 'm3' }]);
  expect(plan.unlinks).toContainEqual({ path: '/a', workHash: 'm1' });
  expect(plan.unlinks).toContainEqual({ path: '/a/b', workHash: 'm2' });
  expect(plan.unlinks).toContainEqual({ path: '/keep', workHash: 'm3' }); // selected link
  expect(plan.unlinks.length).toBe(3);
  expect(plan.removes).toEqual(['/a/b', '/a']); // children before parents
  // '/keep' the FOLDER survives — only its selected link goes.
  expect(plan.removes).not.toContain('/keep');
});

logicTest('modelFolders: planRenameFolder re-points every descendant path and link', ({ expect }) => {
  const tree = foldFolders([
    folderEvent('folder.created', { path: '/old' }),
    folderEvent('folder.created', { path: '/old/deep' }),
    folderEvent('folder.linked', { path: '/old/deep', workHash: 'm' }),
  ]);
  const plan = planRenameFolder(tree, '/old', 'new')!;
  expect([...plan.creates].sort()).toEqual(['/new', '/new/deep']);
  expect(plan.links).toEqual([{ path: '/new/deep', workHash: 'm' }]);
  expect(plan.unlinks).toEqual([{ path: '/old/deep', workHash: 'm' }]);
  expect([...plan.removes].sort()).toEqual(['/old', '/old/deep']);
});

logicTest('modelFolders: planRenameFolder refuses collisions and bad names', ({ expect }) => {
  const tree = foldFolders([
    folderEvent('folder.created', { path: '/a' }),
    folderEvent('folder.created', { path: '/b' }),
  ]);
  expect(planRenameFolder(tree, '/a', 'b')).toBeNull(); // '/b' already exists
  expect(planRenameFolder(tree, '/a', 'x/y')).toBeNull(); // one segment only
  expect(planRenameFolder(tree, '/a', '')).toBeNull();
  expect(planRenameFolder(tree, '/a', 'a')).toBeNull(); // no-op rename
});
