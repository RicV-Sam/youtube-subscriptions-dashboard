import { vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import VideoPlayer from './VideoPlayer';
import { loadPlayerAPI } from './playerApi';

vi.mock('./playerApi', () => ({ loadPlayerAPI: vi.fn() }));
let events, player, Player;
const video = { videoId: 'video-a', title: 'Example', channelTitle: 'Channel' };
beforeEach(() => {
  vi.useFakeTimers();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  player = { getCurrentTime: vi.fn(() => 32), getDuration: vi.fn(() => 100), destroy: vi.fn(), seekTo: vi.fn(), playVideo: vi.fn() };
  Player = vi.fn(function (element, options) { events = options.events; return player; });
  loadPlayerAPI.mockResolvedValue({ Player });
});
afterEach(() => { vi.useRealTimers(); });

async function open(props = {}) {
  const result = render(<VideoPlayer video={video} ready onSave={() => {}} onWatch={() => {}} onClose={() => {}} {...props} />);
  await act(async () => {});
  act(() => events.onReady());
  return result;
}

test('checkpoints playing position and close, without overwriting a resume before playback starts', async () => {
  const onProgress = vi.fn();
  const result = await open({ onProgress, resumeSeconds: 25 });
  act(() => vi.advanceTimersByTime(5000));
  expect(onProgress).not.toHaveBeenCalled();
  act(() => { events.onStateChange({ data: 1 }); vi.advanceTimersByTime(5000); });
  expect(onProgress).toHaveBeenLastCalledWith(32, 100, false);
  player.getCurrentTime.mockReturnValue(40);
  result.unmount();
  expect(onProgress).toHaveBeenLastCalledWith(40, 100, false);
  expect(player.destroy).toHaveBeenCalledTimes(1);
  expect(document.querySelector('iframe')).toBeNull();
});

test('completion clears progress and advances only with queue autoplay enabled', async () => {
  const onProgress = vi.fn(), onNext = vi.fn(), onWatch = vi.fn();
  const result = await open({ onProgress, onNext, onWatch, nextVideo: video, autoplay: false });
  act(() => { events.onStateChange({ data: 1 }); events.onStateChange({ data: 0 }); });
  expect(onProgress).toHaveBeenLastCalledWith(32, 100, true);
  expect(onNext).not.toHaveBeenCalled(); expect(onWatch).not.toHaveBeenCalled();
  result.rerender(<VideoPlayer video={video} ready onProgress={onProgress} onNext={onNext} onWatch={onWatch} nextVideo={video} autoplay />);
  act(() => { events.onStateChange({ data: 1 }); events.onStateChange({ data: 0 }); });
  expect(onNext).toHaveBeenCalledTimes(1);
});

test('restart seeks to zero and updates the saved position', async () => {
  const onProgress = vi.fn(); await open({ onProgress, resumeSeconds: 25 });
  fireEvent.click(screen.getByRole('button', { name: 'Start from beginning' }));
  expect(player.seekTo).toHaveBeenCalledWith(0, true);
  expect(onProgress).toHaveBeenCalledWith(0, 100, false);
  expect(player.playVideo).toHaveBeenCalled();
});

test('late API load cannot create a player after close, and blocked controls explain the limitation', async () => {
  let resolve;
  loadPlayerAPI.mockReturnValueOnce(new Promise(done => { resolve = done; }));
  const result = render(<VideoPlayer video={video} />);
  result.unmount();
  await act(async () => resolve({ Player }));
  expect(Player).not.toHaveBeenCalled();
  loadPlayerAPI.mockRejectedValueOnce(new Error('Player controls unavailable'));
  await act(async () => { render(<VideoPlayer video={video} />); });
  expect(screen.getByText('Player controls unavailable')).toBeInTheDocument();
  expect(screen.getByTitle('YouTube player: Example')).toBeInTheDocument();
});
