import { vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Dashboard from './Dashboard';
import { READ_SCOPE } from './youtube';
import { createBackup, libraryKey, emptyLibrary } from './library';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});

const mocks = vi.hoisted(() => ({ options: null, login: vi.fn() }));
vi.mock('@react-oauth/google', () => ({
  useGoogleOAuth: () => ({ scriptLoadedSuccessfully: true }),
  useGoogleLogin: options => { mocks.options = options; return mocks.login; },
}));
const reply = items => Promise.resolve({ ok: true, json: async () => ({ items }) });
const token = { access_token: 'test-token', expires_in: 3600, scope: READ_SCOPE };
const tokenResponse = overrides => ({ ...token, state: mocks.login.mock.calls.at(-1)[0].state, ...overrides });
function subscriptions() { return reply([{ snippet: { title: 'Example channel', resourceId: { channelId: 'channel-a' } } }]); }
function uploads() { return reply([{ contentDetails: { videoId: 'video-a', videoPublishedAt: new Date().toISOString() }, snippet: { title: 'An example video' } }]); }
async function connect() {
  fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));
  await act(async () => mocks.options.onSuccess(tokenResponse()));
}
beforeEach(() => {
  mocks.login.mockClear();
  window.localStorage.clear();
  global.fetch = vi.fn(url => {
    if (url.includes('/subscriptions?')) return subscriptions();
    if (url.includes('/channels?')) return reply([{ id: 'account-a', snippet: { title: 'Test account A' }, contentDetails: { relatedPlaylists: { uploads: 'uploads-a' } } }]);
    if (url.includes('/videos?')) return reply([{ id: 'video-a', snippet: { title: 'An example video', channelTitle: 'Example channel', channelId: 'channel-a', publishedAt: new Date().toISOString() } }]);
    return uploads();
  });
});
afterEach(() => { delete global.fetch; });

test('does not auto-login and requests only read-only YouTube access', () => {
  render(<Dashboard />);
  expect(mocks.login).not.toHaveBeenCalled();
  expect(mocks.options.scope).toBe(READ_SCOPE);
  expect(mocks.options.overrideScope).toBe(true);
  expect(mocks.options.include_granted_scopes).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));
  expect(mocks.login).toHaveBeenCalledWith({ prompt: 'select_account', state: expect.any(String) });
});

test('loads, searches, resets filters, refreshes, and clears account data on sign-out', async () => {
  render(<Dashboard />);
  await connect();
  expect(await screen.findByRole('button', { name: 'Play in page: An example video' })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Search loaded videos'), { target: { value: 'no match' } });
  expect(screen.getByText('No loaded videos match')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  expect(screen.getByRole('button', { name: 'Play in page: An example video' })).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh feed' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Refresh feed' }));
  await waitFor(() => expect(global.fetch.mock.calls.filter(([url]) => url.includes('/subscriptions?'))).toHaveLength(2));
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  expect(screen.queryByText('An example video')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument();
});

test('failed subscription requests show recovery rather than no subscriptions', async () => {
  global.fetch.mockRejectedValue(new TypeError('Network failure'));
  render(<Dashboard />); await connect();
  expect(await screen.findByText('Could not reach YouTube. Check your connection and retry.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Retry refresh' })).toBeInTheDocument();
  expect(screen.queryByText('No subscriptions found')).not.toBeInTheDocument();
});

test('sign-out cancels in-flight requests and late responses cannot restore the feed', async () => {
  let resolve;
  global.fetch.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  render(<Dashboard />); await connect();
  const signal = global.fetch.mock.calls[0][1].signal;
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  expect(signal.aborted).toBe(true);
  await act(async () => resolve(await subscriptions()));
  expect(screen.queryByText('Your latest uploads')).not.toBeInTheDocument();
});

test('switching accounts clears old results before selecting another account', async () => {
  render(<Dashboard />); await connect();
  await screen.findByText('An example video');
  fireEvent.click(screen.getByRole('button', { name: 'Switch account' }));
  expect(screen.queryByText('An example video')).not.toBeInTheDocument();
  expect(mocks.login).toHaveBeenCalledTimes(2);
});

test('rejects missing read permission without fetching account data', async () => {
  render(<Dashboard />);
  fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));
  await act(async () => mocks.options.onSuccess(tokenResponse({ scope: '' })));
  expect(screen.getByRole('alert')).toHaveTextContent('was not granted');
  expect(global.fetch).not.toHaveBeenCalled();
});

test('cancelled sign-in ignores a late OAuth success', async () => {
  render(<Dashboard />);
  fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel sign-in' }));
  await act(async () => mocks.options.onSuccess(tokenResponse()));
  expect(global.fetch).not.toHaveBeenCalled();
});

test('expired tokens prompt reconnection without making another API request', async () => {
  render(<Dashboard />);
  fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));
  await act(async () => mocks.options.onSuccess(tokenResponse({ expires_in: -1 })));
  expect(screen.getByRole('alert')).toHaveTextContent('connection expired');
  expect(global.fetch).not.toHaveBeenCalled();
});

test('a cancelled popup cannot connect the next sign-in attempt', async () => {
  render(<Dashboard />);
  fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));
  const staleToken = tokenResponse();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel sign-in' }));
  fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));
  await act(async () => mocks.options.onSuccess(staleToken));
  expect(global.fetch).not.toHaveBeenCalled();
  await act(async () => mocks.options.onSuccess(tokenResponse()));
  expect(await screen.findByText('An example video')).toBeInTheDocument();
});

test('opens a single inline player without marking watched, and removes it on close', async () => {
  render(<Dashboard />); await connect();
  const play = await screen.findByRole('button', { name: 'Play in page: An example video' });
  play.focus(); fireEvent.click(play);
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  const iframe = screen.getByTitle('YouTube player: An example video');
  expect(iframe.src).toContain('https://www.youtube-nocookie.com/embed/video-a?');
  expect(iframe).toHaveAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  expect(document.querySelectorAll('iframe')).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Mark watched here', exact: true })).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByRole('link', { name: /Open on YouTube/ })).toHaveAttribute('href', 'https://www.youtube.com/watch?v=video-a');
  fireEvent.click(screen.getByRole('button', { name: 'Close player' }));
  expect(document.querySelector('iframe')).toBeNull();
  expect(document.activeElement).toBe(play);
  expect(document.body.style.overflow).toBe('');
});

test('Escape closes the player and stops the embed', async () => {
  render(<Dashboard />); await connect();
  fireEvent.click(await screen.findByRole('button', { name: 'Play in page: An example video' }));
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: false, cancelable: true }));
  expect(document.querySelector('iframe')).toBeNull();
});

test('saved choices persist across sign-in, store no metadata or token, and can be removed with undo', async () => {
  render(<Dashboard />); await connect();
  fireEvent.click(await screen.findByRole('button', { name: 'Save to queue: An example video' }));
  const stored = window.localStorage.getItem(libraryKey('account-a'));
  expect(JSON.parse(stored).saved).toEqual([{ id: 'video-a', addedAt: expect.any(Number) }]);
  expect(stored).not.toMatch(/test-token|An example video|thumbnail/);
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  await connect();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Saved queue (1)' })).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'Saved queue (1)' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Remove from queue: An example video' }));
  expect(screen.getByText('Your queue is empty')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  expect(screen.getByRole('button', { name: 'Remove from queue: An example video' })).toBeInTheDocument();
});

test('favourites and manual watched filters can be combined and undone', async () => {
  render(<Dashboard />); await connect();
  await screen.findByRole('button', { name: 'Play in page: An example video' });
  // The closed manager contains a duplicate channel control; choose the card control.
  fireEvent.click(screen.getAllByRole('button', { name: 'Favourite channel: Example channel' }).at(-1));
  fireEvent.click(screen.getByRole('button', { name: 'Favourites (1)' }));
  expect(screen.getByRole('button', { name: 'Play in page: An example video' })).toBeInTheDocument();
  expect(screen.getByLabelText('Watched status here')).toHaveValue('unwatched');
  fireEvent.click(screen.getByRole('button', { name: 'Mark watched here: An example video' }));
  expect(screen.queryByRole('button', { name: 'Play in page: An example video' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  expect(screen.getByRole('button', { name: 'Play in page: An example video' })).toBeInTheDocument();
});

test('marking watched hides videos by default, including after reconnect, with an explicit way to view them', async () => {
  render(<Dashboard />); await connect();
  fireEvent.click(await screen.findByRole('button', { name: 'Mark watched here: An example video' }));
  expect(screen.queryByRole('button', { name: 'Play in page: An example video' })).not.toBeInTheDocument();
  expect(screen.getByText('You’re caught up')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  await connect();
  await screen.findByText('You’re caught up');
  expect(screen.queryByRole('button', { name: 'Play in page: An example video' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Watched status here'), { target: { value: 'watched' } });
  expect(screen.getByRole('button', { name: 'Play in page: An example video' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Mark unwatched here: An example video' }));
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  expect(screen.getByRole('button', { name: 'Play in page: An example video' })).toBeInTheDocument();
});

test('an older saved video outside the loaded feed is retrieved independently', async () => {
  window.localStorage.setItem(libraryKey('account-a'), JSON.stringify({ ...emptyLibrary(), saved: [{ id: 'video-older', addedAt: 1 }] }));
  const original = global.fetch.getMockImplementation();
  global.fetch.mockImplementation(url => url.includes('/videos?') ? reply([{ id: 'video-older', snippet: { title: 'Older saved video', channelTitle: 'An old subscription', channelId: 'old-channel', publishedAt: '2020-01-01T00:00:00Z' } }]) : original(url));
  render(<Dashboard />); await connect();
  fireEvent.click(await screen.findByRole('button', { name: 'Saved queue (1)' }));
  expect(await screen.findByRole('button', { name: 'Play in page: Older saved video' })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Channel'), { target: { value: 'old-channel' } });
  expect(screen.getByRole('button', { name: 'Play in page: Older saved video' })).toBeInTheDocument();
});

test('switching accounts never exposes another account’s saved library', async () => {
  window.localStorage.setItem(libraryKey('account-a'), JSON.stringify({ ...emptyLibrary(), saved: [{ id: 'video-a', addedAt: 1 }] }));
  render(<Dashboard />); await connect();
  await screen.findByRole('button', { name: 'Saved queue (1)' });
  fireEvent.click(screen.getByRole('button', { name: 'Switch account' }));
  const original = global.fetch.getMockImplementation();
  global.fetch.mockImplementation(url => url.includes('/channels?') && url.includes('mine=true') ? reply([{ id: 'account-b', snippet: { title: 'Test account B' } }]) : original(url));
  await act(async () => mocks.options.onSuccess(tokenResponse()));
  expect(await screen.findByRole('button', { name: 'Saved queue (0)' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Saved queue (1)' })).not.toBeInTheDocument();
  expect(JSON.parse(window.localStorage.getItem(libraryKey('account-a'))).saved).toHaveLength(1);
});

test('storage failures keep the change usable while disclosing that it is temporary', async () => {
  render(<Dashboard />); await connect();
  const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Full'); });
  fireEvent.click(await screen.findByRole('button', { name: 'Save to queue: An example video' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Browser storage could not save');
  expect(screen.getByRole('button', { name: 'Saved queue (1)' })).toBeInTheDocument();
  storage.mockRestore();
});

test('clear local library requires confirmation and affects only the connected account', async () => {
  window.localStorage.setItem(libraryKey('account-b'), JSON.stringify({ ...emptyLibrary(), watched: [{ id: 'video-b', addedAt: 1 }] }));
  render(<Dashboard />); await connect();
  fireEvent.click(await screen.findByRole('button', { name: 'Save to queue: An example video' }));
  fireEvent.click(screen.getByText('Local library settings'));
  fireEvent.click(screen.getByRole('button', { name: 'Clear local library', exact: true }));
  expect(JSON.parse(window.localStorage.getItem(libraryKey('account-a'))).saved).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Confirm clear local library' }));
  expect(window.localStorage.getItem(libraryKey('account-a'))).toBeNull();
  expect(window.localStorage.getItem(libraryKey('account-b'))).not.toBeNull();
});

test('hidden videos can be restored without marking them watched', async () => {
  render(<Dashboard />); await connect();
  fireEvent.click(await screen.findByRole('button', { name: 'Hide video: An example video' }));
  expect(screen.queryByRole('button', { name: 'Play in page: An example video' })).not.toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem(libraryKey('account-a'))).watched).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: 'Hidden (1)' }));
  fireEvent.click(screen.getByRole('button', { name: 'Restore video: An example video' }));
  fireEvent.click(screen.getByRole('button', { name: 'All subscriptions' }));
  expect(screen.getByRole('button', { name: 'Play in page: An example video' })).toBeInTheDocument();
});

test('channel groups support membership, filtering, rename and undo removal', async () => {
  render(<Dashboard />); await connect();
  await screen.findByRole('button', { name: 'Play in page: An example video' });
  fireEvent.click(screen.getByText('Manage channel groups'));
  fireEvent.change(screen.getByLabelText('Group name'), { target: { value: 'Learning' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create group' }));
  const group = JSON.parse(localStorage.getItem(libraryKey('account-a'))).groups[0];
  fireEvent.change(screen.getByLabelText('Channel group'), { target: { value: group.id } });
  expect(screen.queryByRole('button', { name: 'Play in page: An example video' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Example channel' }));
  expect(screen.getByRole('button', { name: 'Play in page: An example video' })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Group name'), { target: { value: 'Education' } });
  fireEvent.click(screen.getByRole('button', { name: 'Rename group' }));
  expect(screen.getByLabelText('Channel group')).toHaveDisplayValue('Education');
  fireEvent.click(screen.getByRole('button', { name: 'Remove group' }));
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  expect(screen.getByLabelText('Channel group')).toHaveDisplayValue('Education');
});

test('imports require a validated preview and merge rather than replace', async () => {
  render(<Dashboard />); await connect();
  fireEvent.click(await screen.findByRole('button', { name: 'Save to queue: An example video' }));
  fireEvent.click(screen.getByText('Back up or import library'));
  const incoming = { ...emptyLibrary(), hidden: [{ id: 'another', addedAt: 1 }] };
  const file = { size: 200, text: async () => createBackup(incoming) };
  fireEvent.change(screen.getByLabelText('Choose library backup'), { target: { files: [file] } });
  await screen.findByRole('button', { name: 'Merge backup into this library' });
  expect(JSON.parse(localStorage.getItem(libraryKey('account-a'))).hidden).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: 'Merge backup into this library' }));
  const stored = JSON.parse(localStorage.getItem(libraryKey('account-a')));
  expect(stored.saved).toHaveLength(1); expect(stored.hidden).toEqual(incoming.hidden);
  fireEvent.change(screen.getByLabelText('Choose library backup'), { target: { files: [{ size: 5, text: async () => 'bad' }] } });
  await screen.findByText(/This file is not a valid library backup/);
  expect(JSON.parse(localStorage.getItem(libraryKey('account-a')))).toEqual(stored);
});

test('continue watching includes older progress and player resumes at the stored position', async () => {
  localStorage.setItem(libraryKey('account-a'), JSON.stringify({ ...emptyLibrary(), progress: [{ id: 'video-a', seconds: 65, duration: 200, addedAt: 1 }] }));
  render(<Dashboard />); await connect();
  fireEvent.click(await screen.findByRole('button', { name: 'Continue watching', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Play in page: An example video' }));
  expect(new URL(screen.getByTitle('YouTube player: An example video').src).searchParams.get('start')).toBe('65');
});

test('queue next skips hidden and watched entries while leaving saved choices intact', async () => {
  localStorage.setItem(libraryKey('account-a'), JSON.stringify({ ...emptyLibrary(), saved: ['video-a', 'hidden', 'watched', 'next'].map((id, i) => ({ id, addedAt: i })), hidden: [{ id: 'hidden', addedAt: 1 }], watched: [{ id: 'watched', addedAt: 1 }] }));
  render(<Dashboard />); await connect();
  fireEvent.click(await screen.findByRole('button', { name: 'Play in page: An example video' }));
  fireEvent.click(screen.getByRole('button', { name: 'Play next in queue' }));
  expect(screen.getByTitle('YouTube player: Saved video (next)')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Play next in queue' })).toBeDisabled();
  expect(JSON.parse(localStorage.getItem(libraryKey('account-a'))).saved).toHaveLength(4);
});
