import { createBackup, parseBackup, mergeLibrary, emptyLibrary, libraryKey, parseLibrary, queueVideos, readLibrary, setEntry, writeLibrary } from './library';

beforeEach(() => window.localStorage.clear());

test('serializes only identifiers and user action timestamps', () => {
  writeLibrary('account-a', { ...emptyLibrary(), token: 'not-to-be-stored', saved: [{ id: 'abc-123', addedAt: 12, title: 'Not stored' }] });
  expect(window.localStorage.getItem(libraryKey('account-a'))).not.toMatch(/Not stored|not-to-be-stored/);
  expect(readLibrary('account-b').data.saved).toHaveLength(0);
});

test('malformed or unknown library formats are preserved and use a temporary session', () => {
  const key = libraryKey('account-a');
  for (const raw of ['not json', '{"version":9}', '{"version":1,"saved":[{}],"watched":[],"favourites":[]}']) {
    window.localStorage.setItem(key, raw);
    expect(readLibrary('account-a').persistent).toBe(false);
    expect(window.localStorage.getItem(key)).toBe(raw);
  }
});

test('deduplicates stored IDs and rejects invalid entries', () => {
  expect(parseLibrary(JSON.stringify({ ...emptyLibrary(), saved: [{ id: 'a', addedAt: 1 }, { id: 'a', addedAt: 2 }] })).saved).toHaveLength(1);
  expect(() => parseLibrary(JSON.stringify({ ...emptyLibrary(), saved: [{ id: '../invalid', addedAt: 1 }] }))).toThrow();
});

test('removing a queue entry preserves other local choices', () => {
  const data = { ...emptyLibrary(), saved: [{ id: 'a', addedAt: 1 }], watched: [{ id: 'a', addedAt: 2 }] };
  const next = setEntry(data, 'saved', 'a', null);
  expect(next.saved).toEqual([]);
  expect(next.watched).toEqual(data.watched);
});

test('queue keeps unavailable IDs, prefers refreshed details, and preserves user ordering dates', () => {
  const result = queueVideos([{ id: 'a', addedAt: 1 }, { id: 'missing', addedAt: 2 }], [{ videoId: 'a', title: 'Old title' }], { a: { title: 'Fresh title' } });
  expect(result[0]).toMatchObject({ videoId: 'a', title: 'Fresh title', savedAt: 1 });
  expect(result[1]).toMatchObject({ videoId: 'missing', unresolved: true, savedAt: 2 });
});

test('migrates version one libraries without losing choices', () => {
  const old = { version: 1, saved: [{ id: 'a', addedAt: 10 }], watched: [], favourites: [] };
  expect(parseLibrary(JSON.stringify(old))).toEqual({ ...emptyLibrary(), saved: old.saved });
});

test('backup roundtrip preserves new choices and merges without deleting existing data', () => {
  const original = { ...emptyLibrary(), hidden: [{ id: 'h', addedAt: 2 }], progress: [{ id: 'a', seconds: 30, duration: 100, addedAt: 4 }], groups: [{ id: 'g', name: 'Learning', channelIds: ['channel-a'], addedAt: 1 }] };
  const imported = parseBackup(createBackup(original));
  expect(imported).toEqual(original);
  const current = { ...emptyLibrary(), saved: [{ id: 'saved', addedAt: 1 }], progress: [{ id: 'a', seconds: 20, duration: 100, addedAt: 3 }], groups: [{ id: 'g', name: 'My group', channelIds: [], addedAt: 2 }] };
  const merged = mergeLibrary(current, imported);
  expect(merged.saved).toEqual(current.saved);
  expect(merged.hidden).toEqual(original.hidden);
  expect(merged.progress[0].seconds).toBe(30);
  expect(merged.groups[0].name).toBe('My group');
  expect(() => parseBackup('{"format":"different"}')).toThrow();
  expect(() => parseLibrary(JSON.stringify({ ...original, progress: [{ id: 'a', seconds: -10, duration: 100, addedAt: 1 }] }))).toThrow();
});
