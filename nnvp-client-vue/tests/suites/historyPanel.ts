/**
 * The Training window's History tab (HistoryPanel.vue), mounted directly with
 * fake data props — the panel receives listRuns/deleteRun/deleteChoices/
 * restoreRun through
 * TrainingZone's dynamic <component> prop set (the BenchPanel pattern), so a
 * suite can stand in for the parent with plain fakes and no journal module.
 *
 * The SFC and @vue/test-utils are imported DYNAMICALLY inside the bodies:
 * a module-level .vue import would break the Playwright runner's registry
 * load (it cannot parse SFCs — tests/README.md rule 3). Under bun the
 * vue-loader preload compiles the real component. The browser halves of
 * these appTests need the History tab wired into TrainingZone first (the
 * Phase 4 integration step) and stay unverified this session.
 */
import { appTest } from '../harness/define';
import type { RunRecord } from '../../src/lib/Training/runJournal';

// The mounted-wrapper seam, exactly as worldComponents.ts types it: one suite
// hosts one arbitrary component, so the wrapper generic carries nothing.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Wrapper = any;

function makeRun(overrides: Partial<RunRecord>): RunRecord {
  return {
    uuid: 'run-0000',
    startedAt: '2026-07-20T10:00:00.000Z',
    finishedAt: '2026-07-20T10:01:00.000Z',
    outcome: 'completed',
    engineId: 'tfjs',
    config: {
      dataset: 'MNIST',
      optimizer: 'rmsprop',
      optimizerParams: {},
      epochs: 5,
      loss: 'categoricalCrossentropy',
    },
    graphJson: '{"layers":[]}',
    epochMetrics: [],
    durationMs: 60000,
    ...overrides,
  };
}

/** The newer, completed run — 3 of 5 epochs journaled, full metrics. */
function newerRun(): RunRecord {
  return makeRun({
    uuid: 'run-newer',
    startedAt: '2026-07-20T10:00:00.000Z',
    epochMetrics: [
      { epoch: 1, acc: 0.52, loss: 1.31, valAcc: 0.5, valLoss: 1.4 },
      { epoch: 2, acc: 0.78, loss: 0.61, valAcc: 0.74, valLoss: 0.7 },
      { epoch: 3, acc: 0.91, loss: 0.235, valAcc: 0.88, valLoss: 0.31 },
    ],
  });
}

/** The older, errored run — no epochs made it into the journal. */
function olderRun(): RunRecord {
  return makeRun({
    uuid: 'run-older',
    startedAt: '2026-07-19T09:00:00.000Z',
    outcome: 'error',
    error: 'boom',
    engineId: 'tinygrad',
    config: {
      dataset: 'Fashion MNIST',
      optimizer: 'sgd',
      optimizerParams: { learningRate: 0.01 },
      epochs: 10,
      loss: 'categoricalCrossentropy',
    },
    epochMetrics: [],
  });
}

/** Where a delete may act — mirrors the panel's (and sync.ts's) union. */
type DeleteWhere = 'local' | 'cloud' | 'both';

interface MountOptions {
  runs?: RunRecord[];
  deleteRun?: (uuid: string, where: DeleteWhere) => Promise<void>;
  /** Omitted → the prop defaults to null and the panel degrades to ['local']. */
  deleteChoices?: (run: RunRecord) => Promise<DeleteWhere[]>;
  restoreRun?: (run: RunRecord) => void;
}

/** Mount the REAL SFC over fake props; resolves after the mounted() fetch. */
async function mountHistoryPanel(options: MountOptions = {}): Promise<Wrapper> {
  const { mount } = await import('@vue/test-utils');
  const { default: HistoryPanel } = await import('../../src/components/TrainingZone/HistoryPanel.vue');
  const wrapper = mount(HistoryPanel, {
    props: {
      listRuns: async () => options.runs || [],
      deleteRun: options.deleteRun || (async () => {}),
      // undefined → Vue applies the prop default (null) → device-only prompt.
      deleteChoices: options.deleteChoices,
      restoreRun: options.restoreRun || (() => {}),
    },
    attachTo: document.body,
  });
  await flush(wrapper);
  return wrapper;
}

/** Let the panel's pending promises (listRuns/deleteRun) land, then re-render. */
async function flush(wrapper: Wrapper): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0));
  await wrapper.vm.$nextTick();
}

appTest('historyPanel: lists runs newest-first with formatted metrics', async ({ expect }) => {
  // Deliberately oldest-first: the panel must impose newest-first itself.
  const wrapper = await mountHistoryPanel({ runs: [olderRun(), newerRun()] });
  try {
    const rows = wrapper.findAll('.history-row');
    expect(rows.length).toBe(2);
    const first = rows[0].text();
    expect(first).toContain('MNIST');
    expect(first).toContain('tfjs');
    expect(first).toContain('completed');
    expect(first).toContain('3 / 5'); // epochs done / planned
    expect(first).toContain('0.91'); // final acc, 2 digits
    expect(first).toContain('0.235'); // final loss, 3 digits
    const second = rows[1].text();
    expect(second).toContain('Fashion MNIST');
    expect(second).toContain('tinygrad');
    expect(second).toContain('error');
    expect(second).toContain('0 / 10');
    expect(second).toContain('—'); // no epoch metrics → both cells em-dashed
  } finally {
    wrapper.unmount();
  }
});

appTest('historyPanel: View expands the row and shows the training curves', async ({ expect }) => {
  const wrapper = await mountHistoryPanel({ runs: [olderRun(), newerRun()] });
  try {
    expect(wrapper.find('.history-curves').exists()).toBe(false);
    await wrapper.findAll('.history-view')[0].trigger('click');
    const curves = wrapper.find('.history-curves');
    expect(curves.exists()).toBe(true);
    // The record's epochMetrics rendered as the epoch chart: real SVG lines,
    // one per journaled series (acc, val-acc, loss, val-loss).
    expect(curves.find('.line-chart-svg').exists()).toBe(true);
    expect(curves.findAll('.lines path').length).toBe(4);
    expect(curves.text()).toContain('Epoch Results');
    // View toggles back off.
    await wrapper.findAll('.history-view')[0].trigger('click');
    expect(wrapper.find('.history-curves').exists()).toBe(false);
  } finally {
    wrapper.unmount();
  }
});

appTest('historyPanel: Restore hands the full record to the prop', async ({ expect }) => {
  const restored: RunRecord[] = [];
  const wrapper = await mountHistoryPanel({
    runs: [olderRun(), newerRun()],
    restoreRun: (run: RunRecord) => { restored.push(run); },
  });
  try {
    await wrapper.findAll('.history-restore')[0].trigger('click');
    expect(restored.length).toBe(1);
    expect(restored[0]!.uuid).toBe('run-newer'); // newest-first: row 0 is the newer run
    expect(restored[0]!.graphJson).toBe('{"layers":[]}');
    expect(restored[0]!.config.optimizer).toBe('rmsprop');
  } finally {
    wrapper.unmount();
  }
});

appTest('historyPanel: Delete asks inline; local-only choices offer device+Cancel and the row goes', async ({ expect }) => {
  const deleted: Array<[string, DeleteWhere]> = [];
  const wrapper = await mountHistoryPanel({
    runs: [olderRun(), newerRun()],
    deleteRun: async (uuid: string, where: DeleteWhere) => { deleted.push([uuid, where]); },
    deleteChoices: async () => ['local'],
  });
  try {
    await wrapper.findAll('.history-delete')[0].trigger('click');
    await flush(wrapper); // let the choices promise land — buttons appear then
    // Inline confirmation, not window.confirm: nothing deleted yet.
    expect(deleted.length).toBe(0);
    expect(wrapper.text()).toContain('Delete this run?');
    // Only the locations that hold the record: device (local) + Cancel.
    const buttons = wrapper.findAll('.history-confirm-delete');
    expect(buttons.length).toBe(1);
    expect(buttons[0].text()).toBe('device');
    expect(wrapper.find('.history-delete-local').exists()).toBe(true);
    expect(wrapper.find('.history-delete-cloud').exists()).toBe(false);
    expect(wrapper.find('.history-delete-both').exists()).toBe(false);
    // Cancel keeps the row and drops the prompt.
    await wrapper.find('.history-cancel-delete').trigger('click');
    expect(wrapper.find('.history-confirm-delete').exists()).toBe(false);
    expect(wrapper.findAll('.history-row').length).toBe(2);
    // Picking device calls the prop with 'local'; the row disappears.
    await wrapper.findAll('.history-delete')[0].trigger('click');
    await flush(wrapper);
    await wrapper.find('.history-delete-local').trigger('click');
    await flush(wrapper);
    expect(deleted).toEqual([['run-newer', 'local']]);
    const remaining = wrapper.findAll('.history-row');
    expect(remaining.length).toBe(1);
    expect(remaining[0].text()).toContain('Fashion MNIST');
  } finally {
    wrapper.unmount();
  }
});

appTest('historyPanel: null deleteChoices degrades to the device-only prompt', async ({ expect }) => {
  // No deleteChoices prop at all (older parents / standalone mounts): the
  // panel must behave exactly like a local-only record.
  const deleted: Array<[string, DeleteWhere]> = [];
  const wrapper = await mountHistoryPanel({
    runs: [olderRun(), newerRun()],
    deleteRun: async (uuid: string, where: DeleteWhere) => { deleted.push([uuid, where]); },
  });
  try {
    await wrapper.findAll('.history-delete')[0].trigger('click');
    const buttons = wrapper.findAll('.history-confirm-delete');
    expect(buttons.length).toBe(1);
    expect(buttons[0].text()).toBe('device');
    await wrapper.find('.history-delete-local').trigger('click');
    await flush(wrapper);
    expect(deleted).toEqual([['run-newer', 'local']]);
    expect(wrapper.findAll('.history-row').length).toBe(1);
  } finally {
    wrapper.unmount();
  }
});

appTest('historyPanel: cloud-held record offers all three; cloud keeps the row, both removes it', async ({ expect }) => {
  const deleted: Array<[string, DeleteWhere]> = [];
  const wrapper = await mountHistoryPanel({
    runs: [olderRun(), newerRun()],
    deleteRun: async (uuid: string, where: DeleteWhere) => { deleted.push([uuid, where]); },
    deleteChoices: async () => ['local', 'cloud', 'both'],
  });
  try {
    await wrapper.findAll('.history-delete')[0].trigger('click');
    await flush(wrapper);
    // All three locations hold it → all three buttons, in the offered order.
    const buttons = wrapper.findAll('.history-confirm-delete');
    expect(buttons.length).toBe(3);
    expect(buttons.map((b: Wrapper) => b.text())).toEqual(['device', 'cloud', 'both']);
    // A cloud-only delete detaches the local copy but keeps it: the row STAYS.
    await wrapper.find('.history-delete-cloud').trigger('click');
    await flush(wrapper);
    expect(deleted).toEqual([['run-newer', 'cloud']]);
    expect(wrapper.findAll('.history-row').length).toBe(2);
    expect(wrapper.find('.history-confirm-delete').exists()).toBe(false); // prompt closed
    // 'both' removes every copy — the row disappears.
    await wrapper.findAll('.history-delete')[0].trigger('click');
    await flush(wrapper);
    await wrapper.find('.history-delete-both').trigger('click');
    await flush(wrapper);
    expect(deleted).toEqual([['run-newer', 'cloud'], ['run-newer', 'both']]);
    const remaining = wrapper.findAll('.history-row');
    expect(remaining.length).toBe(1);
    expect(remaining[0].text()).toContain('Fashion MNIST');
  } finally {
    wrapper.unmount();
  }
});

appTest('historyPanel: empty journal shows the muted empty line', async ({ expect }) => {
  const wrapper = await mountHistoryPanel({ runs: [] });
  try {
    expect(wrapper.findAll('.history-row').length).toBe(0);
    const empty = wrapper.find('.history-empty');
    expect(empty.exists()).toBe(true);
    expect(empty.text()).toContain('No training runs recorded yet');
  } finally {
    wrapper.unmount();
  }
});
