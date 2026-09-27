import React, { useState } from 'react';
import { ChannelGroups, LibraryBackup } from './LibraryTools';

export default function LibraryPanel({ library, channels, view, onView, onClear }) {
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(40);
  const [confirmClear, setConfirmClear] = useState(false);
  const favourites = new Set(library.data.favourites.map(item => item.id));
  const matching = channels.filter(channel => channel.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((a, b) => Number(favourites.has(b.id)) - Number(favourites.has(a.id)) || a.title.localeCompare(b.title));
  return <section className="library-panel" aria-label="Your local library">
    <div className="library-nav" role="group" aria-label="Choose feed view">
      {[
        ['feed', 'All subscriptions'], ['favourites', `Favourites (${favourites.size})`], ['saved', `Saved queue (${library.data.saved.length})`],
        ['continue', 'Continue watching'], ['hidden', `Hidden (${library.data.hidden.length})`],
      ].map(([id, title]) => <button className="library-tab" key={id} aria-pressed={view === id} onClick={() => onView(id)}>{title}</button>)}
    </div>
    <p className="library-caption">{!library.ready ? 'Preparing your local library…' : library.persistent ? `Saved in this browser for ${library.account.title}.` : 'Temporary library for this sign-in.'} Favourites, saved videos and watched marks belong to this viewer, not YouTube.</p>
    {library.notice && <p className="library-warning" role="alert">{library.notice}</p>}
    <div className="library-tools">
      <ChannelGroups library={library} channels={channels} />
      <LibraryBackup library={library} />
      <details className="channel-manager"><summary>Manage favourite channels</summary>
        <label>Find a channel<input type="search" value={query} placeholder="Channel name…" onChange={event => { setQuery(event.target.value); setLimit(40); }} /></label>
        <p className="library-caption">Favouriting a channel does not change your YouTube subscriptions.</p>
        <ul className="channel-list">{matching.slice(0, limit).map(channel => {
          const selected = favourites.has(channel.id);
          return <li key={channel.id}><span>{channel.title}</span><button className="small-button" aria-pressed={selected} aria-label={`${selected ? 'Unfavourite' : 'Favourite'} channel: ${channel.title}`} disabled={!library.ready} onClick={() => library.choose('favourites', channel.id, !selected, `${channel.title} ${selected ? 'removed from' : 'added to'} favourites.`)}>{selected ? '★ Favourite' : '☆ Favourite'}</button></li>;
        })}</ul>
        {!matching.length && <p className="library-caption">{channels.length ? 'No channels match this search.' : 'Your subscription channels will appear here when loaded.'}</p>}
        {matching.length > limit && <button className="button" onClick={() => setLimit(value => value + 40)}>Show more channels</button>}
      </details>
      <details className="library-settings"><summary>Local library settings</summary>
        <p>Your library, playback positions and channel groups stay in this browser after sign-out. They are hidden until you connect the same YouTube account again. Video titles, thumbnails and access tokens are not saved in browser storage.</p>
        <p>Clearing this library removes only this account’s choices from this browser. Nothing on YouTube changes.</p>
        {confirmClear ? <div className="clear-confirmation"><p>Clear {library.data.saved.length} saved videos, {library.data.favourites.length} favourite channels, {library.data.watched.length} watched marks, {library.data.hidden.length} hidden marks, {library.data.progress.length} playback positions and {library.data.groups.length} groups? This cannot be undone.</p><div className="header-actions"><button className="button danger" onClick={() => { if (onClear()) setConfirmClear(false); }}>Confirm clear local library</button><button className="button" onClick={() => setConfirmClear(false)}>Cancel</button></div></div>
          : <button className="button" disabled={!library.ready} onClick={() => setConfirmClear(true)}>Clear local library</button>}
      </details>
    </div>
    <div className="library-feedback"><span role="status" aria-live="polite">{library.message}</span>{library.canUndo && <button className="undo-button" onClick={library.undo}>Undo</button>}</div>
  </section>;
}
