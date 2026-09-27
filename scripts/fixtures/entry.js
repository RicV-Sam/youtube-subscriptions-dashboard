// Synthetic data for checking layout and recovery. This is a separate Vite entry.
let failedOnce = false;
let liveSample = false;
const names = ['Example Nature Channel', 'Example Design Channel With A Long Name', 'Example Music Channel'];
const titles = ['A quiet morning in the mountains', 'Designing a small space with a very long title that should wrap naturally without hiding important details', 'An evening piano session', 'The details you might have missed', 'A walk through the changing seasons', 'Making time for creative work'];
function video(id, index) {
  const sample = id === 'M7lc1UVf-VE' || (liveSample && id === 'channel-0-new');
  const artwork = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="${['#cedbd1', '#e8d5bd', '#cbd4e2'][index % 3]}"/><text x="32" y="300" font-family="sans-serif" font-size="30" fill="#24322a">SYNTHETIC PREVIEW ${index + 1}</text></svg>`;
  return { contentDetails: { videoId: sample ? 'M7lc1UVf-VE' : id, videoPublishedAt: new Date(Date.now() - index * 86400000).toISOString() }, snippet: { title: sample ? 'YouTube documentation sample (live embed)' : titles[index % titles.length], thumbnails: index === 2 ? {} : { medium: { url: 'data:image/svg+xml,' + encodeURIComponent(artwork) } } } };
}
window.fetch = async url => {
  const parsed = new URL(url);
  if (parsed.origin !== 'https://www.googleapis.com') throw new Error('Unexpected fixture request');
  let body;
  if (parsed.pathname.endsWith('/subscriptions')) body = { items: names.map((title, index) => ({ snippet: { title, resourceId: { channelId: 'channel-' + index } } })) };
  if (parsed.pathname.endsWith('/channels')) body = parsed.searchParams.has('mine') ? { items: [{ id: 'fixture-account', snippet: { title: 'Synthetic preview account' } }] } : { items: [{ contentDetails: { relatedPlaylists: { uploads: parsed.searchParams.get('id') } } }] };
  if (parsed.pathname.endsWith('/videos')) body = { items: parsed.searchParams.get('id').split(',').map(id => {
    const index = Number(id.split('-')[1]) || 0;
    const item = video(id, index);
    return { id, snippet: { ...item.snippet, publishedAt: item.contentDetails.videoPublishedAt, channelId: 'channel-' + index, channelTitle: names[index] || 'Example channel' } };
  }) };
  if (parsed.pathname.endsWith('/playlistItems')) {
    const id = parsed.searchParams.get('playlistId');
    if (id === 'channel-2' && !failedOnce) { failedOnce = true; return new Response(JSON.stringify({ error: {} }), { status: 500 }); }
    const older = parsed.searchParams.has('pageToken');
    body = { items: [video(id + (older ? '-old' : '-new'), older ? 10 : Number(id.slice(-1))), video(id + (older ? '-old2' : '-new2'), older ? 14 : Number(id.slice(-1)) + 3)], ...(!older ? { nextPageToken: 'older' } : {}) };
  }
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
const banner = document.createElement('div');
banner.textContent = 'TEST PREVIEW — synthetic videos; no Google account connected';
banner.style.cssText = 'padding:10px 16px;background:#fff1c4;color:#382b00;font:14px system-ui';
document.body.prepend(banner);
const sampleButton = document.createElement('button');
sampleButton.textContent = 'Use live YouTube sample';
sampleButton.onclick = () => { liveSample = true; sampleButton.textContent = 'Live sample enabled — refresh feed'; sampleButton.disabled = true; };
banner.append(sampleButton);
const checkButton = document.createElement('button');
checkButton.textContent = 'Run accessibility check';
checkButton.onclick = async () => {
  const { default: axe } = await import('axe-core');
  const result = await axe.run(document.getElementById('root'));
  let report = document.getElementById('fixture-accessibility');
  if (!report) { report = document.createElement('pre'); report.id = 'fixture-accessibility'; report.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere'; banner.append(report); }
  report.textContent = JSON.stringify({ violations: result.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => n.target) })), incomplete: result.incomplete.map(v => v.id) });
};
banner.append(checkButton);
const textButton = document.createElement('button');
textButton.textContent = 'Test 200% text';
textButton.onclick = () => {
  const sizes = [...document.querySelectorAll('#root *')].map(el => [el, parseFloat(getComputedStyle(el).fontSize)]);
  sizes.forEach(([el, size]) => { el.style.fontSize = `${size * 2}px`; });
  textButton.disabled = true;
};
banner.append(textButton);
import('../../src/index.jsx');
