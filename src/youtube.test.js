import { vi } from 'vitest';
import { emptyFeed, loadAccount, loadSavedDetails, loadSubscriptions, loadChannelPage, normalizeVideo, selectVideos, syncFeed } from './youtube';

const response = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const sub = id => ({ snippet: { title: `Channel ${id}`, resourceId: { channelId: id } } });
const item = id => ({ contentDetails: { videoId: id, videoPublishedAt: '2026-09-25T12:00:00Z' }, snippet: { title: `Video ${id}`, publishedAt: '2026-09-26T12:00:00Z' } });
const channel = { id: 'a', title: 'Channel a', playlistId: 'uploads-a' };
const signal = () => new AbortController().signal;
beforeEach(() => { global.fetch = vi.fn(); });
afterEach(() => { delete global.fetch; });

test('ambiguous account identities never select a persistent library', async () => {
  global.fetch.mockResolvedValueOnce(response({ items: [] }))
    .mockResolvedValueOnce(response({ items: [{ id: 'a' }, { id: 'b' }] }))
    .mockResolvedValueOnce(response({ items: [{ id: 'a' }], nextPageToken: 'more' }))
    .mockResolvedValueOnce(response({ items: [{ id: 'a', snippet: { title: 'My channel' } }] }));
  for (let i = 0; i < 3; i++) expect(await loadAccount('test', signal())).toBeNull();
  expect(await loadAccount('test', signal())).toEqual({ id: 'a', title: 'My channel' });
});

test('saved details deduplicate and batch IDs, retaining unavailable placeholders', async () => {
  const ids = Array.from({ length: 51 }, (_, i) => `saved-${i}`);
  const batches = vi.fn();
  global.fetch.mockResolvedValueOnce(response({ items: [{ id: ids[0], snippet: { title: 'Current title', channelId: 'a', publishedAt: '2026-09-01T00:00:00Z' } }] }))
    .mockResolvedValueOnce(response({ items: [] }));
  await loadSavedDetails([...ids, ids[0]], 'test', signal(), batches);
  expect(new URL(global.fetch.mock.calls[0][0]).searchParams.get('id').split(',')).toHaveLength(50);
  expect(new URL(global.fetch.mock.calls[1][0]).searchParams.get('id')).toBe(ids[50]);
  expect(batches.mock.calls[0][0][ids[0]]).toMatchObject({ title: 'Current title', unresolved: false });
  expect(batches.mock.calls[1][0][ids[50]]).toMatchObject({ videoId: ids[50], unresolved: true });
});

test('saved detail cancellation suppresses late updates', async () => {
  const controller = new AbortController();
  let resolve;
  global.fetch.mockImplementation(() => new Promise(done => { resolve = done; }));
  const onBatch = vi.fn();
  const pending = loadSavedDetails(['saved'], 'test', controller.signal, onBatch);
  controller.abort(); resolve(response({ items: [] }));
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(onBatch).not.toHaveBeenCalled();
});

test('loads all subscription pages and deduplicates channels', async () => {
  global.fetch.mockResolvedValueOnce(response({ items: Array.from({ length: 50 }, (_, i) => sub(String(i))), nextPageToken: 'page-2' }))
    .mockResolvedValueOnce(response({ items: [sub('50'), sub('0')] }));
  const channels = await loadSubscriptions('test', signal());
  expect(channels).toHaveLength(51);
  expect(new URL(global.fetch.mock.calls[1][0]).searchParams.get('pageToken')).toBe('page-2');
  expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer test');
});

test('repeated subscription cursors fail instead of looping indefinitely', async () => {
  global.fetch.mockResolvedValue(response({ items: [sub('a')], nextPageToken: 'same' }));
  await expect(loadSubscriptions('test', signal())).rejects.toThrow('repeated a subscription page');
  expect(global.fetch).toHaveBeenCalledTimes(2);
});

test('uses publication date, tolerates absent thumbnails and does not substitute playlist dates', () => {
  expect(normalizeVideo(item('v'), channel)).toMatchObject({ publishedAt: '2026-09-25T12:00:00Z', thumbnail: '' });
  expect(normalizeVideo({ snippet: { publishedAt: '2026-09-26T12:00:00Z', resourceId: { videoId: 'v' } } }, channel).publishedAt).toBeNull();
  expect(normalizeVideo({ ...item('v'), status: { privacyStatus: 'private' } }, channel)).toBeNull();
});

test('loads older pages using the returned cursor', async () => {
  global.fetch.mockResolvedValueOnce(response({ items: [item('old')] }));
  const result = await loadChannelPage({ ...channel, nextPageToken: 'older' }, 'test', signal());
  expect(new URL(global.fetch.mock.calls[0][0]).searchParams.get('pageToken')).toBe('older');
  expect(result.channel.nextPageToken).toBeNull();
});

test('keeps successful channels and previous failed-channel results, then retries only failures', async () => {
  const previous = { ...emptyFeed(), channels: [channel], videos: [{ ...normalizeVideo(item('previous'), channel) }] };
  let fail = true;
  global.fetch.mockImplementation(async url => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/subscriptions')) return response({ items: [sub('a'), sub('b')] });
    if (parsed.pathname.endsWith('/channels')) return response({ items: [{ contentDetails: { relatedPlaylists: { uploads: 'uploads-b' } } }] });
    if (parsed.searchParams.get('playlistId') === 'uploads-a' && fail) return response({ error: {} }, 500);
    return response({ items: [item(parsed.searchParams.get('playlistId'))] });
  });
  let state;
  const args = { token: 'test', previous, signal: signal(), onData: data => { state = data; }, onProgress: vi.fn() };
  await syncFeed(args);
  expect(state.videos.map(video => video.videoId)).toEqual(expect.arrayContaining(['previous', 'uploads-b']));
  expect(state.channels.find(c => c.id === 'a').error).toBeTruthy();
  expect(state.refreshedAt).toBeNull();
  global.fetch.mockClear(); fail = false;
  await syncFeed({ ...args, previous: state, mode: 'retry' });
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(state.videos.map(video => video.videoId)).not.toContain('previous');
  expect(state.channels.every(c => !c.error)).toBe(true);
});

test('pagination preserves cursor, deduplicates and does not misreport a full refresh', async () => {
  const previous = { ...emptyFeed(), refreshedAt: 12345, channels: [{ ...channel, nextPageToken: 'older' }], videos: [normalizeVideo(item('a'), channel)] };
  let state;
  const args = { token: 'test', previous, mode: 'more', signal: signal(), onData: data => { state = data; }, onProgress: vi.fn() };
  global.fetch.mockResolvedValueOnce(response({ error: {} }, 500));
  await syncFeed(args);
  expect(state.channels[0].nextPageToken).toBe('older');
  expect(state.videos).toHaveLength(1);
  global.fetch.mockResolvedValueOnce(response({ items: [item('a'), item('b')] }));
  await syncFeed({ ...args, previous: state, mode: 'retry' });
  expect(state.videos.map(video => video.videoId)).toEqual(['a', 'b']);
  expect(state.refreshedAt).toBe(12345);
});

test('quota failures stop scheduling remaining channels', async () => {
  global.fetch.mockResolvedValue(response({ error: { errors: [{ reason: 'quotaExceeded' }] } }, 403));
  let state;
  await expect(syncFeed({ token: 'test', previous: { ...emptyFeed(), channels: Array.from({ length: 10 }, (_, i) => ({ ...channel, id: String(i), error: 'retry' })) }, mode: 'retry', signal: signal(), onData: data => { state = data; }, onProgress: vi.fn() })).rejects.toMatchObject({ kind: 'quota' });
  expect(global.fetch).toHaveBeenCalledTimes(4);
  expect(state.channels.every(c => c.error)).toBe(true);
});

test('filters combine search, channel, period and ordering; missing dates stay last', () => {
  const now = Date.parse('2026-09-26T12:00:00Z');
  const videos = [
    { videoId: 'old', channelId: 'a', channelTitle: 'Nature', title: 'Forest', publishedAt: '2026-09-20T12:00:00Z' },
    { videoId: 'new', channelId: 'a', channelTitle: 'Nature', title: 'Ocean', publishedAt: '2026-09-26T11:00:00Z' },
    { videoId: 'unknown', channelId: 'b', channelTitle: 'Music', title: 'Song', publishedAt: null },
    { videoId: 'future', channelId: 'b', channelTitle: 'Music', title: 'Premiere', publishedAt: '2026-09-27T12:00:00Z' },
  ];
  const filters = { query: '', channel: 'all', period: 'all', sort: 'oldest' };
  expect(selectVideos(videos, { ...filters, period: '24h' }, now).map(v => v.videoId)).toEqual(['new']);
  expect(selectVideos(videos, { ...filters, query: 'NATURE', channel: 'a', period: '7d' }, now).map(v => v.videoId)).toEqual(['old', 'new']);
  expect(selectVideos(videos, filters, now).at(-1).videoId).toBe('unknown');
});

test('aborted loads publish no late channel results', async () => {
  const controller = new AbortController();
  let resolve;
  global.fetch.mockImplementation(() => new Promise(done => { resolve = done; }));
  const onData = vi.fn();
  const pending = syncFeed({ token: 'test', previous: { ...emptyFeed(), channels: [{ ...channel, error: 'retry' }] }, mode: 'retry', signal: controller.signal, onData, onProgress: vi.fn() });
  controller.abort(); resolve(response({ items: [item('late')] }));
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(onData).not.toHaveBeenCalled();
});
