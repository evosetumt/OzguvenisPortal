import { describe, expect, it, vi } from 'vitest';
import { closeTopOverlay, overlayCount, pushOverlay } from './overlay-stack';

describe('overlay stack', () => {
  it('returns false when nothing is open', () => {
    expect(closeTopOverlay()).toBe(false);
  });

  it('closes only the topmost overlay', () => {
    const drawer = vi.fn();
    const preview = vi.fn();
    const offDrawer = pushOverlay(drawer);
    const offPreview = pushOverlay(preview);

    expect(closeTopOverlay()).toBe(true);
    expect(preview).toHaveBeenCalledTimes(1);
    expect(drawer).not.toHaveBeenCalled();

    offPreview();
    expect(closeTopOverlay()).toBe(true);
    expect(drawer).toHaveBeenCalledTimes(1);
    offDrawer();
    expect(overlayCount()).toBe(0);
  });

  it('removing a lower overlay keeps the top one on top', () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = pushOverlay(a);
    const offB = pushOverlay(b);
    offA();
    closeTopOverlay();
    expect(b).toHaveBeenCalledTimes(1);
    expect(a).not.toHaveBeenCalled();
    offB();
  });
});
