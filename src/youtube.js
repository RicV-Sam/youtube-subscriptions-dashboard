export const READ_SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';
export const PAGE_SIZE = 50;
export const emptyFeed = () => ({ channels: [], videos: [], subscriptionsComplete: false, refreshedAt: null, refreshPending: false });

export class YouTubeError extends Error {
  constructor(message, kind = 'request') { super(message); this.kind = kind; }
}

async function request(resource, params, token, signal) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  signal?.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(cancel, 20000);
  try {
    const response = await fetch(`https://www.googleapis.com/youtube/v3/${resource}?${new URLSearchParams(params)}`, {
      headers: { Authorization: `Bearer ${token}` }, signal: controller.signal,
    });
    const body = await response.json();
    if (!response.ok) {
      const reasons = (body.error?.errors || []).map(error => error.reason);
      if (response.status === 401) throw new YouTubeError('Your connection expired. Reconnect to Google to continue.', 'auth');
      if (reasons.some(reason => ['quotaExceeded', 'dailyLimitExceeded'].includes(reason))) throw new YouTubeError('YouTube’s request allowance for this app has been reached. Please try again later.', 'quota');
      if (response.status === 403) throw new YouTubeError('YouTube denied access. Check that you granted read-only YouTube access, then reconnect.', 'permission');
      throw new YouTubeError(response.status === 404 ? 'This channel or uploads playlist is unavailable.' : 'YouTube could not complete this request. Please retry.');
    }
    if (!Array.isArray(body.items)) throw new YouTubeError('YouTube returned an unexpected response. Please retry.');
    return body;
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (error.name === 'AbortError') throw new YouTubeError('The request timed out. Please retry.');
    if (error instanceof YouTubeError) throw error;
    throw new YouTubeError('Could not reach YouTube. Check your connection and retry.');
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', cancel);
  }
}

export async function loadSubscriptions(token, signal, onProgress = () => {}) {
  const channels = new Map();
  const seenPages = new Set();
  let pageToken = '';
  do {
    if (seenPages.has(pageToken)) throw new YouTubeError('YouTube repeated a subscription page. Please retry.');
    seenPages.add(pageToken);
    const result = await request('subscriptions', {
      part: 'snippet', mine: 'true', maxResults: PAGE_SIZE, ...(pageToken ? { pageToken } : {}),
    }, token, signal);
    for (const item of result.items) {
      const id = item.snippet?.resourceId?.channelId;
      if (id) channels.set(id, { id, title: item.snippet.title || 'Untitled channel' });
    }
    onProgress(`Finding subscriptions… ${channels.size} found`);
    pageToken = result.nextPageToken || '';
  } while (pageToken);
  return [...channels.values()].sort((a, b) => a.title.localeCompare(b.title));
}

export async function loadAccount(token, signal) {
  const result = await request('channels', { part: 'snippet', mine: 'true', maxResults: PAGE_SIZE }, token, signal);
  // Ambiguous/missing identity must never share a persistent library with another account.
  if (result.items.length !== 1 || result.nextPageToken || !result.items[0].id) return null;
  return { id: result.items[0].id, title: result.items[0].snippet?.title || 'Your YouTube account' };
}

export async function loadSavedDetails(ids, token, signal, onBatch) {
  const unique = [...new Set(ids)];
  let failures = 0;
  for (let offset = 0; offset < unique.length; offset += PAGE_SIZE) {
    const batch = unique.slice(offset, offset + PAGE_SIZE);
    try {
      const result = await request('videos', { part: 'snippet', id: batch.join(',') }, token, signal);
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      const returned = new Map(result.items.map(item => [item.id, item]));
      const details = {};
      for (const id of batch) {
        const item = returned.get(id);
        const snippet = item?.snippet;
        details[id] = snippet ? {
          videoId: id, title: snippet.title || 'Untitled video', channelId: snippet.channelId || '',
          channelTitle: snippet.channelTitle || 'Channel unavailable', thumbnail: snippet.thumbnails?.medium?.url || snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url || '',
          publishedAt: Number.isFinite(Date.parse(snippet.publishedAt)) ? snippet.publishedAt : null, unresolved: false,
        } : { videoId: id, title: `Saved video (${id})`, channelId: '', channelTitle: 'YouTube did not return details for this video', thumbnail: '', publishedAt: null, unresolved: true };
      }
      onBatch(details);
    } catch (error) {
      if (signal.aborted) throw error;
      if (['auth', 'quota'].includes(error.kind)) throw error;
      failures += batch.length;
    }
  }
  if (failures) throw new YouTubeError(`Details for ${failures} saved ${failures === 1 ? 'video' : 'videos'} could not be checked. Your saved queue is intact; refresh to retry.`);
}

export function normalizeVideo(item, channel) {
  const snippet = item.snippet || {};
  const videoId = item.contentDetails?.videoId || snippet.resourceId?.videoId;
  if (!videoId || item.status?.privacyStatus === 'private' || ['Private video', 'Deleted video'].includes(snippet.title)) return null;
  const published = item.contentDetails?.videoPublishedAt;
  return {
    videoId, channelId: channel.id, channelTitle: channel.title,
    title: snippet.title || 'Untitled video',
    thumbnail: snippet.thumbnails?.medium?.url || snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url || '',
    // Playlist insertion dates are not a substitute for publication dates.
    publishedAt: published && Number.isFinite(Date.parse(published)) ? published : null,
  };
}

export async function loadChannelPage(channel, token, signal) {
  let playlistId = channel.playlistId;
  if (!playlistId) {
    const details = await request('channels', { part: 'contentDetails', id: channel.id }, token, signal);
    playlistId = details.items[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!playlistId) throw new YouTubeError('No accessible uploads playlist was returned for this channel.');
  }
  const result = await request('playlistItems', {
    part: 'snippet,contentDetails,status', playlistId, maxResults: PAGE_SIZE,
    ...(channel.nextPageToken ? { pageToken: channel.nextPageToken } : {}),
  }, token, signal);
  if (result.nextPageToken && result.nextPageToken === channel.nextPageToken) throw new YouTubeError('YouTube repeated an uploads page. Refresh this feed before loading more.');
  return {
    channel: { ...channel, playlistId, nextPageToken: result.nextPageToken || null, error: null, loadedAt: Date.now() },
    videos: result.items.map(item => normalizeVideo(item, channel)).filter(Boolean),
  };
}

// Four workers bound request concurrency; successful channels appear immediately.
export async function syncFeed({ token, previous, mode = 'refresh', signal, onData, onProgress }) {
  let feed = { ...previous };
  if (mode === 'refresh') {
    const subscriptions = await loadSubscriptions(token, signal, onProgress);
    const oldChannels = new Map(previous.channels.map(channel => [channel.id, channel]));
    const ids = new Set(subscriptions.map(channel => channel.id));
    feed = {
      ...feed, subscriptionsComplete: true, refreshPending: true,
      channels: subscriptions.map(channel => ({ ...oldChannels.get(channel.id), ...channel, nextPageToken: undefined, error: null })),
      videos: previous.videos.filter(video => ids.has(video.channelId)),
    };
    onData(feed);
  }
  const targets = feed.channels.filter(channel => mode === 'refresh' || (mode === 'retry' ? channel.error : channel.nextPageToken && !channel.error));
  let index = 0;
  let completed = 0;
  let fatal = null;
  const settled = new Set();
  async function worker() {
    while (index < targets.length && !fatal) {
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      const channel = targets[index++];
      try {
        const result = await loadChannelPage(channel, token, signal);
        if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
        // A refresh replaces the first page; pagination appends and deduplicates.
        const retained = channel.nextPageToken ? feed.videos : feed.videos.filter(video => video.channelId !== channel.id);
        const unique = new Map([...retained, ...result.videos].map(video => [video.videoId, video]));
        feed = { ...feed, videos: [...unique.values()], channels: feed.channels.map(c => c.id === channel.id ? result.channel : c) };
      } catch (error) {
        if (signal.aborted) throw error;
        feed = { ...feed, channels: feed.channels.map(c => c.id === channel.id ? { ...c, error: error.message } : c) };
        if (['auth', 'quota'].includes(error.kind)) fatal = error;
      }
      settled.add(channel.id);
      completed++;
      onData(feed);
      onProgress(`Checked ${completed} of ${targets.length} channels`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, targets.length) }, worker));
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
  if (fatal) {
    feed = { ...feed, channels: feed.channels.map(channel => targets.some(c => c.id === channel.id) && !settled.has(channel.id) ? { ...channel, error: 'Loading stopped before this channel could be checked.' } : channel) };
    onData(feed);
    throw fatal;
  }
  if (feed.refreshPending && mode !== 'more' && !feed.channels.some(channel => channel.error)) feed = { ...feed, refreshedAt: Date.now(), refreshPending: false };
  onData(feed);
  return feed;
}

export function selectVideos(videos, { query, channel, period, sort }, now = Date.now()) {
  const search = query.trim().toLocaleLowerCase();
  const duration = period === '24h' ? 86400000 : period === '7d' ? 7 * 86400000 : Infinity;
  return videos.filter(video => {
    const age = video.publishedAt ? now - Date.parse(video.publishedAt) : NaN;
    return (channel === 'all' || video.channelId === channel)
      && (!search || `${video.title} ${video.channelTitle}`.toLocaleLowerCase().includes(search))
      && (period === 'all' || (age >= 0 && age <= duration));
  }).sort((a, b) => {
    if (sort === 'saved-first' || sort === 'saved-last') return sort === 'saved-first' ? a.savedAt - b.savedAt : b.savedAt - a.savedAt;
    if (!a.publishedAt) return b.publishedAt ? 1 : 0;
    if (!b.publishedAt) return -1;
    const difference = Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
    return sort === 'newest' ? difference : -difference;
  });
}
