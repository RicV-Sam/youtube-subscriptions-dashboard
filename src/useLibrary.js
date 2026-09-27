import { useEffect, useRef, useState } from 'react';
import { emptyLibrary, libraryKey, mergeLibrary, readLibrary, setEntry, writeLibrary } from './library';

const initial = () => ({ data: emptyLibrary(), account: null, ready: false, persistent: false, notice: '', undo: null, message: '' });

export default function useLibrary() {
  const [state, setState] = useState(initial);
  const ref = useRef(state);
  const revision = useRef(0);
  function publish(next) { ref.current = next; setState(next); }

  useEffect(() => {
    function receive(event) {
      const current = ref.current;
      if (!current.persistent || !current.account || (event.key !== null && event.key !== libraryKey(current.account.id))) return;
      const stored = readLibrary(current.account.id);
      const next = { ...current, ...stored, undo: null, message: 'Local library updated in another tab.' };
      ref.current = next; setState(next);
    }
    window.addEventListener('storage', receive);
    return () => window.removeEventListener('storage', receive);
  }, []);

  function activate(account, reason = '') {
    revision.current++;
    const stored = account ? readLibrary(account.id) : { data: emptyLibrary(), persistent: false, notice: reason || 'We could not identify a single YouTube channel for this account. Your library is temporary for this sign-in.' };
    publish({ ...initial(), ...stored, account, ready: true });
    return stored.data;
  }

  function commit(data, extra) {
    const current = ref.current;
    const written = !current.persistent || writeLibrary(current.account.id, data);
    publish({ ...current, data, ...extra,
      persistent: current.persistent && written,
      notice: written ? current.notice : 'Browser storage could not save this change. Your current library is temporary for this sign-in; previously stored choices remain unchanged.',
    });
  }

  function latestData() {
    const current = ref.current;
    if (!current.persistent) return current.data;
    const stored = readLibrary(current.account.id);
    if (!stored.persistent) {
      publish({ ...current, persistent: false, notice: stored.notice });
      return current.data;
    }
    return stored.data;
  }

  function choose(kind, id, selected, label) {
    if (!ref.current.ready) return;
    const data = latestData();
    const before = data[kind].find(item => item.id === id) || null;
    const entry = selected ? (before || { id, addedAt: Date.now() }) : null;
    commit(setEntry(data, kind, id, entry), { undo: { kind, id, before }, message: label });
  }

  function undo() {
    const action = ref.current.undo;
    if (!action) return;
    commit(setEntry(latestData(), action.kind, action.id, action.before), { undo: null, message: 'Last library change undone.' });
  }

  function updateGroup(id, name, channelIds) {
    if (!ref.current.ready) return;
    const data = latestData();
    const before = data.groups.find(item => item.id === id) || null;
    const entry = name === null ? null : { id, name: name.trim(), channelIds, addedAt: Date.now() };
    commit(setEntry(data, 'groups', id, entry), { undo: { kind: 'groups', id, before }, message: entry ? 'Channel group saved.' : 'Channel group removed. Your subscriptions are unchanged.' });
  }

  function recordProgress(id, seconds, duration, complete, accountId, expectedRevision) {
    if (!ref.current.ready || revision.current !== expectedRevision || ref.current.account?.id !== accountId || !Number.isFinite(seconds) || !Number.isFinite(duration) || duration <= 0) return;
    const data = latestData();
    const before = data.progress.find(item => item.id === id);
    if (!complete && before?.seconds === seconds && before?.duration === duration) return;
    if ((complete || seconds < 1) && !before) return;
    const entry = complete || seconds < 1 ? null : { id, seconds: Math.min(seconds, duration), duration, addedAt: Date.now() };
    commit(setEntry(data, 'progress', id, entry), {});
  }

  function importLibrary(incoming) {
    if (!ref.current.ready) return;
    commit(mergeLibrary(latestData(), incoming), { undo: null, message: 'Backup merged into this account’s local library. Refresh to load video details.' });
  }

  function clear() {
    const current = ref.current;
    try {
      if (current.account) window.localStorage.removeItem(libraryKey(current.account.id));
      revision.current++;
      publish({ ...current, data: emptyLibrary(), undo: null, notice: current.persistent ? '' : 'Local choices will remain temporary until you reconnect.', message: 'Local library cleared. Nothing on YouTube was changed.' });
      return true;
    } catch {
      publish({ ...current, notice: 'Browser storage could not be cleared. No deletion has been confirmed. Try again or remove this site’s data in your browser settings.' });
      return false;
    }
  }

  return { ...state, revision: revision.current, canUndo: Boolean(state.undo), activate, choose, undo, clear, updateGroup, recordProgress, importLibrary, getData: () => ref.current.data, reset: () => { revision.current++; publish(initial()); } };
}
