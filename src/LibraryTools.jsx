import React, { useRef, useState } from 'react';
import { createBackup, parseBackup } from './library';

export function LibraryBackup({ library }) {
  const [incoming, setIncoming] = useState(null);
  const [notice, setNotice] = useState('');
  const readSequence = useRef(0);
  function download() {
    try {
      const url = URL.createObjectURL(new Blob([createBackup(library.getData())], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'youtube-feed-library.json';
      document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice('Backup download started. Keep the file somewhere safe.');
    } catch { setNotice('The backup could not be created. Please try again.'); }
  }
  async function read(event) {
    const file = event.target.files?.[0]; event.target.value = '';
    const sequence = ++readSequence.current;
    setIncoming(null); setNotice('');
    if (!file) return;
    try {
      if (file.size > 5000000) throw new Error('Choose a backup smaller than 5 MB.');
      const parsed = parseBackup(await file.text());
      if (sequence === readSequence.current) setIncoming(parsed);
    } catch { if (sequence === readSequence.current) setNotice('This file is not a valid library backup, or exceeds 5 MB. Your library has not changed.'); }
  }
  return <details className="library-settings"><summary>Back up or import library</summary>
    <p>Export your queue, favourites, watched and hidden marks, progress and channel groups. The file contains your viewing choices and group names, but no access tokens or fetched video details.</p>
    <button className="button" disabled={!library.ready} onClick={download}>Export library</button>
    <label>Choose library backup<input type="file" accept=".json,application/json" disabled={!library.ready} onChange={read} /></label>
    {incoming && <div className="import-preview"><p>Merge into {library.account?.title || 'this temporary library'}: {incoming.saved.length} saved, {incoming.favourites.length} favourites, {incoming.watched.length} watched, {incoming.hidden.length} hidden, {incoming.progress.length} playback positions and {incoming.groups.length} groups.</p><p>Existing choices stay. Existing groups win matching IDs; the newest playback position wins. You can import a backup from another account into this account deliberately.</p><button className="button primary" onClick={() => { try { library.importLibrary(incoming); setIncoming(null); setNotice('Import complete. Refresh the feed to check video details.'); } catch { setNotice('The combined library exceeds the supported limits. Nothing was imported.'); } }}>Merge backup into this library</button><button className="button" onClick={() => { ++readSequence.current; setIncoming(null); }}>Cancel import</button></div>}
    {notice && <p role="status">{notice}</p>}
  </details>;
}

export function ChannelGroups({ library, channels }) {
  const [selected, setSelected] = useState('');
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(40);
  const [notice, setNotice] = useState('');
  const group = library.data.groups.find(item => item.id === selected);
  const channelNames = new Map(channels.map(channel => [channel.id, channel.title]));
  const allChannels = [...channels, ...(group?.channelIds || []).filter(id => !channelNames.has(id)).map(id => ({ id, title: `Channel ${id} (not in loaded subscriptions)` }))];
  const matching = allChannels.filter(channel => channel.title.toLowerCase().includes(query.trim().toLowerCase()));
  function choose(id) { setSelected(id); setName(library.data.groups.find(item => item.id === id)?.name || ''); setQuery(''); setLimit(40); setNotice(''); }
  function save(event) {
    event.preventDefault();
    if (!name.trim()) { setNotice('Enter a group name.'); return; }
    if (library.data.groups.some(item => item.id !== group?.id && item.name.toLowerCase() === name.trim().toLowerCase())) { setNotice('A group with this name already exists.'); return; }
    if (!group && library.data.groups.length >= 100) { setNotice('You can keep up to 100 groups.'); return; }
    const id = group?.id || `group-${crypto.getRandomValues(new Uint32Array(4)).join('-')}`;
    library.updateGroup(id, name, group?.channelIds || []); setSelected(id); setNotice('');
  }
  return <details className="channel-manager"><summary>Manage channel groups</summary>
    <label>Edit group<select value={group?.id || ''} onChange={event => choose(event.target.value)}><option value="">New group</option>{library.data.groups.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <form onSubmit={save}><label>Group name<input maxLength={80} value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Learning" /></label><button className="button" disabled={!library.ready} type="submit">{group ? 'Rename group' : 'Create group'}</button></form>
    {notice && <p role="status">{notice}</p>}
    {group && <><p>{group.channelIds.length} channels in {group.name}. A channel can belong to more than one group.</p><label>Find channels for this group<input type="search" value={query} onChange={event => { setQuery(event.target.value); setLimit(40); }} /></label><ul className="channel-list">{matching.slice(0, limit).map(channel => <li key={channel.id}><label className="check-label"><input type="checkbox" checked={group.channelIds.includes(channel.id)} onChange={event => library.updateGroup(group.id, group.name, event.target.checked ? [...group.channelIds, channel.id] : group.channelIds.filter(id => id !== channel.id))} />{channel.title}</label></li>)}</ul>{matching.length > limit && <button className="button" onClick={() => setLimit(value => value + 40)}>Show more group channels</button>}<button className="button" onClick={() => { library.updateGroup(group.id, null, []); choose(''); }}>Remove group</button><p>Removing a group can be undone. It does not unsubscribe any channels.</p></>}
  </details>;
}
