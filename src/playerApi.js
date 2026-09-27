let pending;
export function loadPlayerAPI() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (pending) return pending;
  pending = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const previous = window.onYouTubeIframeAPIReady;
    let done = false;
    const finish = error => {
      if (done) return;
      done = true; clearTimeout(timer);
      window.onYouTubeIframeAPIReady = previous;
      if (error) { script.remove(); pending = null; reject(error); }
      else resolve(window.YT);
    };
    const timer = setTimeout(() => finish(new Error('Player controls did not load. Playback may still work; progress and autoplay are unavailable.')), 15000);
    window.onYouTubeIframeAPIReady = () => { finish(); if (typeof previous === 'function') previous(); };
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => finish(new Error('Player controls could not load. Playback may still work; progress and autoplay are unavailable.'));
    document.head.append(script);
  });
  return pending;
}
