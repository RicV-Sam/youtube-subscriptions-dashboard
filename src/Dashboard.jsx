import React, { useEffect, useRef, useState } from 'react';
import { useGoogleLogin, useGoogleOAuth } from '@react-oauth/google';
import { emptyFeed, loadAccount, loadSavedDetails, READ_SCOPE, selectVideos, syncFeed } from './youtube';
import { queueVideos } from './library';
import useLibrary from './useLibrary';
import LibraryPanel from './LibraryPanel';
import VideoPlayer, { formatPosition } from './VideoPlayer';
import './App.css';

const defaultFilters = { query: '', channel: 'all', period: 'all', sort: 'newest', watched: 'unwatched', group: 'all' };

function relativeDate(value, now) {
  if (!value) return 'Publication date unavailable';
  const seconds = Math.round((Date.parse(value) - now) / 1000);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  for (const [unit, length] of [['year', 31536000], ['month', 2592000], ['day', 86400], ['hour', 3600], ['minute', 60]]) {
    if (Math.abs(seconds) >= length) return formatter.format(Math.round(seconds / length), unit);
  }
  return 'Just now';
}

function VideoCard({ video, now, saved, watched, favourite, hidden, progress, ready, onSave, onWatch, onFavourite, onPlay, onHide }) {
  const [failedImage, setFailedImage] = useState(false);
  return <article className="video-card">
    <button className="video-link" aria-label={`Play in page: ${video.title}`} onClick={onPlay}>
      <span className="thumbnail">
        {video.thumbnail && !failedImage
          ? <img src={video.thumbnail} alt="" loading="lazy" width="320" height="180" onError={() => setFailedImage(true)} />
          : <span className="thumbnail-fallback">Preview unavailable</span>}
        <span className="watch-label">▶ Play here</span>
      </span>
      <span className="video-title">{video.title}</span>
    </button>
    {progress && <p className="resume-note">Resume at {formatPosition(progress.seconds)} of {formatPosition(progress.duration)}</p>}
    <div className="card-channel"><p className="channel-name">{video.channelTitle}</p>{video.channelId && <button className="favourite-button" aria-pressed={favourite} aria-label={`${favourite ? 'Unfavourite' : 'Favourite'} channel: ${video.channelTitle}`} disabled={!ready} onClick={onFavourite}>{favourite ? '★ Favourite' : '☆ Favourite'}</button>}</div>
    {video.publishedAt
      ? <time dateTime={video.publishedAt} title={new Date(video.publishedAt).toLocaleString()}>{relativeDate(video.publishedAt, now)}</time>
      : <span className="video-date">Publication date unavailable</span>}
    <div className="card-actions">
      <button className="small-button" aria-pressed={saved} aria-label={`${saved ? 'Remove from queue' : 'Save to queue'}: ${video.title}`} disabled={!ready} onClick={onSave}>{saved ? 'Saved ✓' : 'Save to queue'}</button>
      <button className="small-button" aria-pressed={watched} aria-label={`${watched ? 'Mark unwatched here' : 'Mark watched here'}: ${video.title}`} disabled={!ready} onClick={onWatch}>{watched ? 'Watched here ✓' : 'Mark watched'}</button>
      <button className="small-button" aria-label={`${hidden ? 'Restore video' : 'Hide video'}: ${video.title}`} disabled={!ready} onClick={onHide}>{hidden ? 'Restore video' : 'Hide video'}</button>
    </div>
  </article>;
}

export default function Dashboard() {
  const { scriptLoadedSuccessfully } = useGoogleOAuth();
  const [feed, setFeed] = useState(emptyFeed);
  const feedRef = useRef(feed);
  const credentials = useRef(null);
  const operation = useRef(null);
  const authAttempt = useRef(false);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState(defaultFilters);
  const [visibleCount, setVisibleCount] = useState(60);
  const [now, setNow] = useState(Date.now);
  const library = useLibrary();
  const [view, setView] = useState('feed');
  const [savedDetails, setSavedDetails] = useState({});
  const [savedError, setSavedError] = useState('');
  const [playing, setPlaying] = useState(null);
  const [playbackOrder, setPlaybackOrder] = useState([]);
  const [autoplay, setAutoplay] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => { clearInterval(timer); operation.current?.abort(); authAttempt.current = false; };
  }, []);

  function updateFeed(value) {
    feedRef.current = value; setFeed(value);
  }

  async function load(mode = 'refresh') {
    const session = credentials.current;
    if (!session || !Number.isFinite(session.expiresAt) || session.expiresAt <= Date.now()) {
      setError({ kind: 'auth', message: 'Your connection expired. Reconnect to Google to continue.' });
      return;
    }
    operation.current?.abort();
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true); setError(null);
    setProgress(mode === 'refresh' ? 'Finding subscriptions…' : 'Loading uploads…');
    try {
      if (!session.accountChecked) {
        let account = null;
        let reason = '';
        try { account = await loadAccount(session.token, controller.signal); }
        catch (failure) {
          if (controller.signal.aborted) throw failure;
          reason = 'Your YouTube account could not be identified. Your library is temporary for this sign-in; reconnect to try again.';
        }
        if (controller.signal.aborted) return;
        session.accountChecked = true;
        library.activate(account, reason);
      }
      const detailsTask = mode === 'refresh' ? (async () => {
        setSavedError('');
        try {
          const choices = library.getData();
          await loadSavedDetails([...choices.saved, ...choices.progress, ...choices.hidden].map(item => item.id), session.token, controller.signal,
            batch => { if (!controller.signal.aborted) setSavedDetails(current => ({ ...current, ...batch })); });
        } catch (failure) { if (!controller.signal.aborted) setSavedError(failure.message); }
      })() : Promise.resolve();
      const feedTask = syncFeed({ token: session.token, previous: feedRef.current, mode, signal: controller.signal,
        onData: value => { if (!controller.signal.aborted) updateFeed(value); },
        onProgress: value => { if (!controller.signal.aborted) setProgress(value); },
      });
      const [result] = await Promise.allSettled([feedTask, detailsTask]);
      if (result.status === 'rejected') throw result.reason;
    } catch (failure) {
      if (!controller.signal.aborted) setError({ kind: failure.kind || 'request', message: failure.message });
    } finally {
      if (operation.current === controller) { setBusy(false); setProgress(''); setNow(Date.now()); }
    }
  }

  const login = useGoogleLogin({
    scope: READ_SCOPE, overrideScope: true, include_granted_scopes: false,
    onSuccess: response => {
      if (!authAttempt.current || response.state !== authAttempt.current) return;
      authAttempt.current = false; setConnecting(false);
      if (!response.access_token || !response.scope?.split(' ').includes(READ_SCOPE)) {
        setError({ kind: 'permission', message: 'Read-only YouTube access was not granted. Sign in again and allow it to load your subscriptions.' });
        return;
      }
      credentials.current = { token: response.access_token, expiresAt: Date.now() + Number(response.expires_in) * 1000 };
      setConnected(true);
      load();
    },
    onError: () => { authAttempt.current = false; setConnecting(false); setError({ kind: 'login', message: 'Sign-in was not completed. Please try again.' }); },
    onNonOAuthError: failure => { authAttempt.current = false; setConnecting(false); setError({ kind: 'login', message: failure.type === 'popup_failed_to_open' ? 'The sign-in window could not open. Allow pop-ups for this site and try again.' : 'Sign-in was closed. You can try again when ready.' }); },
  });

  function signOut() {
    operation.current?.abort(); operation.current = null;
    credentials.current = null; authAttempt.current = false;
    updateFeed(emptyFeed()); setConnected(false); setConnecting(false); setBusy(false);
    setError(null); setProgress(''); setFilters(defaultFilters); setVisibleCount(60);
    library.reset(); setView('feed'); setSavedDetails({}); setSavedError('');
    setPlaying(null);
    setPlaybackOrder([]); setAutoplay(false);
  }

  function connect() {
    // Clear account-specific data before account selection, including reconnection.
    signOut();
    // Correlate responses so a cancelled popup cannot connect a later session.
    authAttempt.current = crypto.getRandomValues(new Uint32Array(4)).join('-');
    setConnecting(true);
    try { login({ prompt: 'select_account', state: authAttempt.current }); }
    catch { authAttempt.current = false; setConnecting(false); setError({ kind: 'login', message: 'Google sign-in is not ready. Please reload the page and try again.' }); }
  }

  function changeFilter(name, value) { setFilters(current => ({ ...current, [name]: value })); setVisibleCount(60); }
  function changeView(value) { setView(value); setFilters({ ...defaultFilters, watched: value === 'hidden' ? 'all' : 'unwatched', sort: value === 'saved' ? 'saved-first' : value === 'continue' ? 'saved-last' : 'newest' }); setVisibleCount(60); }
  function save(video, selected) {
    if (selected) setSavedDetails(current => ({ ...current, [video.videoId]: video }));
    library.choose('saved', video.videoId, selected, `${video.title} ${selected ? 'saved to' : 'removed from'} your local queue.`);
  }
  const savedIds = new Set(library.data.saved.map(item => item.id));
  const watchedIds = new Set(library.data.watched.map(item => item.id));
  const favouriteIds = new Set(library.data.favourites.map(item => item.id));
  const hiddenIds = new Set(library.data.hidden.map(item => item.id));
  const progressById = new Map(library.data.progress.map(item => [item.id, item]));
  const localView = ['saved', 'continue', 'hidden'].includes(view);
  const source = localView ? queueVideos(library.data[view === 'saved' ? 'saved' : view === 'continue' ? 'progress' : 'hidden'], feed.videos, savedDetails) : feed.videos;
  const selectedGroup = library.data.groups.find(group => group.id === filters.group);
  const available = source.filter(video => (view !== 'favourites' || favouriteIds.has(video.channelId))
    && (view === 'hidden' || !hiddenIds.has(video.videoId))
    && (!selectedGroup || selectedGroup.channelIds.includes(video.channelId))
    && (filters.watched === 'all' || watchedIds.has(video.videoId) === (filters.watched === 'watched')));
  const channelOptions = new Map(feed.channels.map(channel => [channel.id, channel.title]));
  if (localView) source.forEach(video => { if (video.channelId) channelOptions.set(video.channelId, video.channelTitle); });
  const selectedChannel = channelOptions.has(filters.channel) ? filters.channel : 'all';
  const filtered = selectVideos(available, { ...filters, channel: selectedChannel }, now);
  const failed = feed.channels.filter(channel => channel.error);
  const loaded = feed.channels.filter(channel => channel.loadedAt && !channel.error).length;
  const more = feed.channels.some(channel => channel.nextPageToken && !channel.error);
  const activeFilters = filters.query || selectedChannel !== 'all' || filters.period !== 'all' || selectedGroup || filters.watched !== (view === 'hidden' ? 'all' : defaultFilters.watched);
  const requiresConnection = ['auth', 'permission'].includes(error?.kind);
  const viewTitle = view === 'saved' ? 'Your saved queue' : view === 'continue' ? 'Continue watching' : view === 'hidden' ? 'Hidden videos' : view === 'favourites' ? 'From your favourites' : 'Your latest uploads';
  const queue = queueVideos(library.data.saved, feed.videos, savedDetails).sort((a, b) => a.savedAt - b.savedAt);
  const playableQueue = queue.filter(video => !watchedIds.has(video.videoId) && !hiddenIds.has(video.videoId));
  const nextVideo = playing && playbackOrder.slice(playbackOrder.indexOf(playing.videoId) + 1).map(id => playableQueue.find(video => video.videoId === id)).find(Boolean);
  function openVideo(video) {
    const index = queue.findIndex(item => item.videoId === video.videoId);
    setPlaybackOrder([video.videoId, ...queue.slice(index + 1).filter(item => item.videoId !== video.videoId).map(item => item.videoId)]);
    setPlaying(video);
    setSavedDetails(current => ({ ...current, [video.videoId]: video }));
  }
  let emptyTitle = 'No available videos loaded';
  let emptyDescription = 'Try different filters or load older uploads if available.';
  if (view === 'saved' && !library.data.saved.length) { emptyTitle = 'Your queue is empty'; emptyDescription = 'Choose Save to queue on a video to keep it here for later.'; }
  else if (view === 'continue' && !library.data.progress.length) { emptyTitle = 'Nothing to resume yet'; emptyDescription = 'Play a video here and your position will be saved when the YouTube player is available.'; }
  else if (view === 'hidden' && !library.data.hidden.length) { emptyTitle = 'No hidden videos'; emptyDescription = 'Hide videos you are not interested in. You can restore them here without changing watched marks.'; }
  else if (view === 'favourites' && !favouriteIds.size) { emptyTitle = 'Choose your favourite channels'; emptyDescription = 'Use Favourite on a video card or open Manage favourite channels above.'; }
  else if (activeFilters) { emptyTitle = view === 'saved' ? 'No saved videos match' : 'No loaded videos match'; emptyDescription = 'Clear your filters to see unwatched videos, or choose All videos under Watched status here to include watched videos.'; }
  else if (!localView && !feed.subscriptionsComplete) { emptyTitle = 'Your feed could not be loaded'; emptyDescription = 'Use the retry action above to try again.'; }
  else if (!localView && !feed.channels.length) { emptyTitle = 'No subscriptions found'; emptyDescription = 'Subscribe to channels on YouTube, then refresh your feed here.'; }
  else if (!localView && failed.length === feed.channels.length) { emptyTitle = 'Your channels could not be loaded'; emptyDescription = 'Use the retry action above to try again.'; }
  else if (filters.watched === 'unwatched' && source.some(video => (view !== 'favourites' || favouriteIds.has(video.channelId)) && watchedIds.has(video.videoId))) { emptyTitle = 'You’re caught up'; emptyDescription = 'Watched videos are hidden. Choose All videos or Marked watched under Watched status here to see them again.'; }
  else if (source.some(video => hiddenIds.has(video.videoId))) { emptyTitle = 'No visible videos here'; emptyDescription = 'Hidden videos can be restored from the Hidden view.'; }
  else if (view === 'favourites') { emptyTitle = 'No loaded uploads from your favourites'; }

  return <>
    <a className="skip-link" href="#feed">Skip to feed</a>
    <header className="app-header">
      <div className="brand"><span className="brand-icon" aria-hidden="true">▶</span><div><h1>Your YouTube Feed</h1><p>Your subscriptions. At your pace.</p></div></div>
      {connected && <div className="header-actions">
        <button className="button primary" disabled={busy} onClick={() => requiresConnection ? connect() : load()}>{requiresConnection ? 'Reconnect Google' : busy ? 'Refreshing…' : 'Refresh feed'}</button>
        <button className="button quiet" onClick={connect} disabled={!scriptLoadedSuccessfully}>Switch account</button>
        <button className="button quiet" onClick={signOut}>Sign out</button>
      </div>}
    </header>
    <main id="feed" tabIndex="-1">
      {error && <div className="notice error" role="alert"><p>{error.message}</p>
        {connected && !busy && <button className="button" onClick={() => requiresConnection ? connect() : load()}>{requiresConnection ? 'Reconnect Google' : 'Retry refresh'}</button>}
      </div>}
      {!connected ? <section className="welcome" aria-labelledby="welcome-title">
        <p className="eyebrow">A little less scrolling</p>
        <h2 id="welcome-title">Catch up with the<br className="desktop-break" /> channels you choose.</h2>
        <p className="welcome-description">Bring your subscriptions into one chronological feed. Find a video, filter by channel, and pick up where your curiosity takes you.</p>
        <button className="button primary connect-button" onClick={connect} disabled={!scriptLoadedSuccessfully || connecting}>{connecting ? 'Waiting for Google…' : scriptLoadedSuccessfully ? 'Sign in with Google' : 'Loading Google sign-in…'}</button>
        {connecting && <button className="button quiet" onClick={signOut}>Cancel sign-in</button>}
        <p className="access-note">Requests read-only YouTube access. Play videos here with YouTube’s embedded player.<br />Your queue, favourites and watched marks are saved in this browser for your YouTube account. Access tokens stay in memory and are cleared on sign-out or reload.</p>
        {!scriptLoadedSuccessfully && <p className="access-note">If sign-in does not load, check your connection or content blocker and reload this page.</p>}
        <div className="welcome-details"><div><strong>Your channels</strong><p>Find every subscription, not just the first few.</p></div><div><strong>Your order</strong><p>Browse by date and search the videos you’ve loaded.</p></div><div><strong>Your choice</strong><p>Read-only access. No changes to your YouTube account.</p></div></div>
      </section> : <>
        <section className="feed-heading" aria-labelledby="subscriptions-title"><div><p className="eyebrow">{localView ? 'Your local library' : 'Subscriptions'}</p><h2 id="subscriptions-title">{viewTitle}</h2></div>
          <p className="freshness">{feed.refreshedAt ? <>Last full refresh <time dateTime={new Date(feed.refreshedAt).toISOString()}>{new Date(feed.refreshedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></> : 'No complete refresh yet'}</p>
        </section>
        <LibraryPanel key={library.account?.id || (connected ? 'temporary' : 'signed-out')} library={library} channels={feed.channels} view={view} onView={changeView} onClear={() => {
          const cleared = library.clear();
          if (cleared) { setSavedDetails({}); setSavedError(''); setPlaying(null); }
          return cleared;
        }} />
        {savedError && <div className="notice warning" role="alert"><p>{savedError}</p><button className="button" disabled={busy} onClick={() => load()}>Refresh saved details</button></div>}
        <section className="toolbar" aria-label="Filter videos">
          <label className="search-field">{view === 'saved' ? 'Search saved videos' : localView ? 'Search library videos' : 'Search loaded videos'}<input type="search" value={filters.query} placeholder="Video title or channel…" onChange={event => changeFilter('query', event.target.value)} /></label>
          <label>Channel<select value={selectedChannel} onChange={event => changeFilter('channel', event.target.value)}><option value="all">All channels</option>{[...channelOptions].sort((a, b) => a[1].localeCompare(b[1])).map(([id, title]) => <option key={id} value={id}>{favouriteIds.has(id) ? '★ ' : ''}{title}</option>)}</select></label>
          <label>Sort by<select value={filters.sort} onChange={event => changeFilter('sort', event.target.value)}>{view === 'saved' && <><option value="saved-first">First saved</option><option value="saved-last">Recently saved</option></>}<option value="newest">Newest first</option><option value="oldest">Oldest first</option>{view === 'continue' && <option value="saved-last">Last played</option>}</select></label>
          <label>Watched status here<select value={filters.watched} onChange={event => changeFilter('watched', event.target.value)}><option value="all">All videos</option><option value="unwatched">Not marked watched</option><option value="watched">Marked watched</option></select></label>
          {library.data.groups.length > 0 && <label>Channel group<select value={selectedGroup?.id || 'all'} onChange={event => changeFilter('group', event.target.value)}><option value="all">All groups</option>{library.data.groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>}
          <div className="date-filters" role="group" aria-label="Publication date">{[['all', 'All loaded'], ['24h', 'Last 24 hours'], ['7d', 'Last 7 days']].map(([value, label]) => <button className="filter-button" key={value} aria-pressed={filters.period === value} onClick={() => changeFilter('period', value)}>{label}</button>)}</div>
        </section>
        <div className="feed-status" role="status" aria-live="polite" aria-atomic="true">{busy ? progress : `${filtered.length.toLocaleString()} ${filtered.length === 1 ? 'video matches' : 'videos match'} your filters · ${view === 'saved' ? `${library.data.saved.length} saved in your queue` : localView ? `${source.length} in this library view` : `${loaded} of ${feed.channels.length} channels loaded`}`}</div>
        <p className="coverage">{view === 'saved' ? 'Your saved queue includes older videos even after refreshing the feed. Refresh to check their latest details. Unknown publication dates are excluded from date filters.' : localView ? 'Includes videos outside your loaded feed. Refresh to check their latest details. Hidden and watched videos are excluded from Continue watching.' : 'Initially loads up to 50 uploads per channel. Search and date filters apply to loaded videos; older uploads may still be available.'}</p>
        {!localView && failed.length > 0 && <aside className="notice warning" aria-label="Channels needing attention"><div><strong>{failed.length} {failed.length === 1 ? 'channel needs' : 'channels need'} attention</strong><p>Other channels remain available. Previous results for failed channels may be out of date.</p><details><summary>View affected channels</summary><ul>{failed.map(channel => <li key={channel.id}><strong>{channel.title}:</strong> {channel.error}</li>)}</ul></details></div><button className="button" disabled={busy} onClick={() => requiresConnection ? connect() : load('retry')}>{requiresConnection ? 'Reconnect Google' : 'Retry failed channels'}</button></aside>}
        {filtered.length > 0 ? <section className="video-grid" aria-label="Videos">{filtered.slice(0, visibleCount).map(video => <VideoCard key={video.videoId} video={video} now={now}
          saved={savedIds.has(video.videoId)} watched={watchedIds.has(video.videoId)} favourite={favouriteIds.has(video.channelId)} ready={library.ready}
          hidden={hiddenIds.has(video.videoId)} progress={progressById.get(video.videoId)}
          onHide={() => { setSavedDetails(current => ({ ...current, [video.videoId]: video })); library.choose('hidden', video.videoId, !hiddenIds.has(video.videoId), hiddenIds.has(video.videoId) ? 'Video restored. Watched marks are unchanged.' : 'Video hidden. You can restore it in Hidden.'); }}
          onPlay={() => openVideo(video)} onSave={() => save(video, !savedIds.has(video.videoId))}
          onWatch={() => library.choose('watched', video.videoId, !watchedIds.has(video.videoId), `${video.title} marked ${watchedIds.has(video.videoId) ? 'unwatched' : 'watched'} in this viewer.`)}
          onFavourite={() => library.choose('favourites', video.channelId, !favouriteIds.has(video.channelId), `${video.channelTitle} ${favouriteIds.has(video.channelId) ? 'removed from' : 'added to'} favourites.`)} />)}</section>
          : busy ? <div className="loading-state"><span className="loading-dot" aria-hidden="true" /><p>Building your feed. Videos will appear as channels load.</p></div>
          : <section className="empty-state"><h3>{emptyTitle}</h3><p>{emptyDescription}</p>{activeFilters && <button className="button" onClick={() => changeView(view)}>Clear filters</button>}{view !== 'feed' && <button className="button" onClick={() => changeView('feed')}>Browse all subscriptions</button>}</section>}
        <div className="load-actions">{filtered.length > visibleCount && <button className="button primary" onClick={() => setVisibleCount(value => value + 60)}>Show more loaded videos ({filtered.length - visibleCount} remaining)</button>}{!localView && more && <button className="button" disabled={busy} onClick={() => load('more')}>Load older uploads</button>}</div>
        {!localView && !busy && feed.subscriptionsComplete && feed.channels.length > 0 && !more && !failed.length && <p className="end-note">You’ve loaded all uploads available from these channel playlists.</p>}
      </>}
    </main>
    <footer>Made for catching up. Playback provided by YouTube. Your local library stays in this browser.</footer>
    {playing && <VideoPlayer video={playing} ready={library.ready} saved={savedIds.has(playing.videoId)} watched={watchedIds.has(playing.videoId)}
      resumeSeconds={progressById.get(playing.videoId)?.seconds || 0}
      onProgress={(seconds, duration, complete) => library.recordProgress(playing.videoId, seconds, duration, complete, library.account?.id, library.revision)}
      nextVideo={nextVideo} onNext={() => { if (nextVideo) setPlaying(nextVideo); }} autoplay={autoplay} onAutoplay={setAutoplay}
      onClose={() => setPlaying(null)} onSave={() => save(playing, !savedIds.has(playing.videoId))}
      onWatch={() => library.choose('watched', playing.videoId, !watchedIds.has(playing.videoId), `${playing.title} marked ${watchedIds.has(playing.videoId) ? 'unwatched' : 'watched'} in this viewer.`)} />}
  </>;
}
