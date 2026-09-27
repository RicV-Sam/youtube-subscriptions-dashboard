import React, { useEffect, useRef, useState } from 'react';
import { loadPlayerAPI } from './playerApi';

export function formatPosition(seconds = 0) {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

// Own the iframe inside a stable container: the API may remove/replace it on destroy.
function PlayerSurface({ video, resumeSeconds, onProgress, onEnded, restartRef }) {
  const host = useRef(null);
  const callbacks = useRef({ onProgress, onEnded });
  callbacks.current = { onProgress, onEnded };
  const start = useRef(Math.floor(resumeSeconds || 0));
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let disposed = false, player, started = false, ended = false, failed = false;
    const element = document.createElement('iframe');
    element.className = 'youtube-player';
    element.title = `YouTube player: ${video.title}`;
    element.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    element.allowFullscreen = true;
    element.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    element.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(video.videoId)}?${new URLSearchParams({ autoplay: '1', playsinline: '1', rel: '0', enablejsapi: '1', origin: window.location.origin, start: String(start.current) })}`;
    const container = host.current;
    container.append(element);
    function checkpoint(complete = false) {
      if (!player || !started || failed) return;
      try { callbacks.current.onProgress?.(player.getCurrentTime(), player.getDuration(), complete || ended); } catch { /* Player may already be unavailable. */ }
    }
    const timer = setInterval(() => checkpoint(), 5000);
    const save = () => checkpoint();
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', save);
    loadPlayerAPI().then(YT => {
      if (disposed) return;
      player = new YT.Player(element, { events: {
        onReady: () => {
          if (disposed) return;
          restartRef.current = () => { ended = false; started = true; player.seekTo(0, true); callbacks.current.onProgress?.(0, player.getDuration(), false); player.playVideo(); };
        },
        onStateChange: event => {
          if (disposed) return;
          if (event.data === 1) { started = true; ended = false; }
          if (event.data === 2) checkpoint();
          if (event.data === 0 && started) { ended = true; checkpoint(true); callbacks.current.onEnded?.(); }
        },
        onError: () => { if (!disposed) { failed = true; setNotice('This video could not play here. Try the next queued video or Open on YouTube.'); } },
        onAutoplayBlocked: () => { if (!disposed) setNotice('Press Play in the YouTube player to continue.'); },
      } });
    }).catch(error => { if (!disposed) setNotice(error.message); });
    return () => {
      disposed = true; checkpoint(); clearInterval(timer);
      window.removeEventListener('pagehide', save); document.removeEventListener('visibilitychange', save);
      restartRef.current = null;
      try { player?.destroy(); } catch { /* The host still gets cleared below. */ }
      container.replaceChildren();
    };
  }, [video.videoId, video.title, restartRef]);
  return <><div ref={host} />{notice && <p className="player-note" role="status">{notice}</p>}</>;
}

export default function VideoPlayer({ video, saved, watched, ready, onSave, onWatch, onClose, resumeSeconds = 0, onProgress, nextVideo, onNext, autoplay, onAutoplay }) {
  const dialogRef = useRef(null);
  const openerRef = useRef(document.activeElement);
  const restartRef = useRef(null);
  const [restartKey, setRestartKey] = useState(0);
  const restartedVideo = useRef(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = openerRef.current;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal(); document.body.style.overflow = 'hidden';
    return () => {
      dialog.close(); document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus(); else document.getElementById('feed')?.focus();
    };
  }, []);
  return <dialog ref={dialogRef} className="player-dialog" aria-labelledby="player-title" onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="player-content">
      <header className="player-heading"><div><p className="eyebrow">Now playing</p><h2 id="player-title">{video.title}</h2><p className="channel-name">{video.channelTitle}</p></div><button className="button" autoFocus onClick={onClose}>Close player</button></header>
      <PlayerSurface key={`${video.videoId}:${restartKey}`} video={video} resumeSeconds={restartedVideo.current === video.videoId ? 0 : resumeSeconds} onProgress={onProgress} restartRef={restartRef} onEnded={() => { if (autoplay && nextVideo) onNext(); }} />
      <div className="player-actions">
        <button className="button" disabled={!ready} aria-pressed={saved} onClick={onSave}>{saved ? 'Remove from saved queue' : 'Save to queue'}</button>
        <button className="button" disabled={!ready} aria-pressed={watched} onClick={onWatch}>{watched ? 'Mark unwatched here' : 'Mark watched here'}</button>
        <button className="button" onClick={() => { if (restartRef.current) restartRef.current(); else { restartedVideo.current = video.videoId; onProgress?.(0, 1, true); setRestartKey(key => key + 1); } }}>Start from beginning</button>
        <a href={`https://www.youtube.com/watch?v=${encodeURIComponent(video.videoId)}`} target="_blank" rel="noopener noreferrer">Open on YouTube ↗<span className="sr-only"> (opens in a new tab)</span></a>
      </div>
      <div className="queue-controls"><button className="button" disabled={!nextVideo} onClick={onNext}>Play next in queue</button><label><input type="checkbox" checked={Boolean(autoplay)} onChange={event => onAutoplay?.(event.target.checked)} />Autoplay next in queue</label><p>{nextVideo ? `Up next: ${nextVideo.title}` : 'No more unwatched, visible videos in this queue.'}</p></div>
      <p className="player-note">Playback position is saved locally while the player is available. Some videos cannot play outside YouTube. Watched marks remain manual.</p>
    </div>
  </dialog>;
}
