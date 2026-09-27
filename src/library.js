const PREFIX = 'youtube-feed:library:v1:'; // Keep the key so existing libraries migrate in place.
const kinds = ['saved', 'watched', 'favourites', 'hidden'];
const validId = id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(id);
const validTime = value => Number.isFinite(value) && value >= 0;
const list = value => { if (!Array.isArray(value) || value.length > 100000) throw new Error('Invalid library list'); return value; };
export const emptyLibrary = () => ({ version: 2, saved: [], watched: [], favourites: [], hidden: [], progress: [], groups: [] });
export const libraryKey = accountId => `${PREFIX}${encodeURIComponent(accountId)}`;

// Whitelist local choices. Never store OAuth tokens or fetched video metadata.
export function parseLibrary(raw) {
  if (raw === null) return emptyLibrary();
  const value = JSON.parse(raw);
  if (![1, 2].includes(value?.version)) throw new Error('Unsupported local library');
  const result = emptyLibrary();
  for (const kind of kinds) {
    const entries = new Map();
    for (const item of list(value[kind] ?? (value.version === 1 && kind === 'hidden' ? [] : null))) {
      if (!validId(item?.id) || !validTime(item.addedAt)) throw new Error('Invalid local library entry');
      entries.set(item.id, { id: item.id, addedAt: item.addedAt });
    }
    result[kind] = [...entries.values()];
  }
  result.progress = [...new Map(list(value.progress ?? (value.version === 1 ? [] : null)).map(item => {
    if (!validId(item?.id) || !validTime(item.addedAt) || !validTime(item.seconds) || !validTime(item.duration) || item.seconds > item.duration || item.duration > 31536000) throw new Error('Invalid playback progress');
    return [item.id, { id: item.id, addedAt: item.addedAt, seconds: item.seconds, duration: item.duration }];
  })).values()];
  const groups = list(value.groups ?? (value.version === 1 ? [] : null));
  if (groups.length > 100) throw new Error('Too many channel groups');
  result.groups = [...new Map(groups.map(item => {
    if (!validId(item?.id) || !validTime(item.addedAt) || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 80 || list(item.channelIds).some(id => !validId(id))) throw new Error('Invalid channel group');
    return [item.id, { id: item.id, addedAt: item.addedAt, name: item.name.trim(), channelIds: [...new Set(item.channelIds)] }];
  })).values()];
  return result;
}

export function mergeLibrary(current, incoming) {
  const result = emptyLibrary();
  // Existing choices win conflicts; importing never removes an existing choice.
  for (const kind of [...kinds, 'groups']) result[kind] = [...new Map([...incoming[kind], ...current[kind]].map(item => [item.id, item])).values()];
  result.progress = [...new Map([...incoming.progress, ...current.progress].sort((a, b) => a.addedAt - b.addedAt).map(item => [item.id, item])).values()];
  return parseLibrary(JSON.stringify(result));
}
export function parseBackup(raw) {
  if (typeof raw !== 'string' || raw.length > 5000000) throw new Error('Choose a library backup smaller than 5 MB.');
  const value = JSON.parse(raw);
  if (value?.format !== 'youtube-feed-backup' || value.version !== 1) throw new Error('This is not a supported YouTube Feed backup.');
  return parseLibrary(JSON.stringify(value.library));
}
export const createBackup = data => JSON.stringify({ format: 'youtube-feed-backup', version: 1, exportedAt: new Date().toISOString(), library: parseLibrary(JSON.stringify(data)) }, null, 2);

export function readLibrary(accountId) {
  try { return { data: parseLibrary(window.localStorage.getItem(libraryKey(accountId))), persistent: true, notice: '' }; }
  catch { return { data: emptyLibrary(), persistent: false, notice: 'Your stored library could not be read. Changes will last for this sign-in only; existing stored data has not been overwritten.' }; }
}
export function writeLibrary(accountId, data) {
  try { window.localStorage.setItem(libraryKey(accountId), JSON.stringify(parseLibrary(JSON.stringify(data)))); return true; }
  catch { return false; }
}
export function setEntry(data, kind, id, entry) {
  return { ...data, [kind]: [...data[kind].filter(item => item.id !== id), ...(entry ? [entry] : [])] };
}
export function queueVideos(saved, liveVideos, details) {
  const live = new Map(liveVideos.map(video => [video.videoId, video]));
  return saved.map(entry => ({ videoId: entry.id, title: `Video (${entry.id})`, channelTitle: 'Details unavailable — refresh to check', channelId: '', thumbnail: '', publishedAt: null, unresolved: true,
    ...(live.get(entry.id) || {}), ...(details[entry.id] || {}), savedAt: entry.addedAt }));
}
