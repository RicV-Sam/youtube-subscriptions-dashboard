import { vi } from 'vitest';
import { onCLS, onINP, onFCP, onLCP, onTTFB } from 'web-vitals';
import reportWebVitals from './reportWebVitals';

vi.mock('web-vitals', () => ({
  onCLS: vi.fn(), onINP: vi.fn(), onFCP: vi.fn(), onLCP: vi.fn(), onTTFB: vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());

test('performance reporting remains disabled without a callback', () => {
  expect(reportWebVitals()).toBeUndefined();
  for (const register of [onCLS, onINP, onFCP, onLCP, onTTFB]) {
    expect(register).not.toHaveBeenCalled();
  }
});

test('registers the callback for supported metrics including INP', async () => {
  const callback = vi.fn();
  await reportWebVitals(callback);
  const actual = await vi.importActual('web-vitals');
  for (const [name, register] of Object.entries({ onCLS, onINP, onFCP, onLCP, onTTFB })) {
    expect(actual[name]).toBeTypeOf('function');
    expect(register).toHaveBeenCalledExactlyOnceWith(callback);
  }
});
