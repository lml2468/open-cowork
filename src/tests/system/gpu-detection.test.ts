import { describe, it, expect } from 'vitest';
import {
  shouldDisableHardwareAcceleration,
  isGpuBlocklisted,
  isGpuAccelerationMode,
} from '../../main/system/gpu-detection';

describe('shouldDisableHardwareAcceleration', () => {
  it('always disables when mode is off', () => {
    expect(shouldDisableHardwareAcceleration('off', undefined)).toBe(true);
    expect(shouldDisableHardwareAcceleration('off', false)).toBe(true);
    expect(shouldDisableHardwareAcceleration('off', true)).toBe(true);
  });

  it('never disables when mode is on', () => {
    expect(shouldDisableHardwareAcceleration('on', undefined)).toBe(false);
    expect(shouldDisableHardwareAcceleration('on', true)).toBe(false);
  });

  it('auto disables only when a previous probe flagged the GPU', () => {
    // First boot: no verdict yet → keep acceleration enabled.
    expect(shouldDisableHardwareAcceleration('auto', undefined)).toBe(false);
    expect(shouldDisableHardwareAcceleration('auto', false)).toBe(false);
    expect(shouldDisableHardwareAcceleration('auto', true)).toBe(true);
  });
});

describe('isGpuBlocklisted', () => {
  it('returns false for a healthy GPU', () => {
    expect(isGpuBlocklisted({ gpu_compositing: 'enabled', webgl: 'enabled' })).toBe(false);
  });

  it('treats software/disabled/unavailable critical features as blocklisted', () => {
    expect(isGpuBlocklisted({ gpu_compositing: 'disabled_software', webgl: 'enabled' })).toBe(true);
    expect(isGpuBlocklisted({ gpu_compositing: 'enabled', webgl: 'unavailable_off' })).toBe(true);
    expect(isGpuBlocklisted({ gpu_compositing: 'software', webgl: 'enabled' })).toBe(true);
  });

  it('ignores non-critical features', () => {
    expect(
      isGpuBlocklisted({
        gpu_compositing: 'enabled',
        webgl: 'enabled',
        video_decode: 'disabled_off',
      })
    ).toBe(false);
  });

  it('is defensive against missing/empty input', () => {
    expect(isGpuBlocklisted(undefined)).toBe(false);
    expect(isGpuBlocklisted(null)).toBe(false);
    expect(isGpuBlocklisted({})).toBe(false);
  });
});

describe('isGpuAccelerationMode', () => {
  it('accepts valid modes', () => {
    expect(isGpuAccelerationMode('auto')).toBe(true);
    expect(isGpuAccelerationMode('on')).toBe(true);
    expect(isGpuAccelerationMode('off')).toBe(true);
  });

  it('rejects everything else', () => {
    expect(isGpuAccelerationMode('yes')).toBe(false);
    expect(isGpuAccelerationMode(undefined)).toBe(false);
    expect(isGpuAccelerationMode(1)).toBe(false);
  });
});
