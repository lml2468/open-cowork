/**
 * GPU hardware-acceleration decision helpers.
 *
 * Electron requires `app.disableHardwareAcceleration()` to be called *before*
 * `app.whenReady()`, but `app.getGPUFeatureStatus()` is only available *after*
 * ready. So detection cannot inform the current boot — instead we probe once
 * after ready, persist a verdict, and read it on the next boot.
 *
 * These pure functions hold the decision logic so it can be unit-tested without
 * an Electron runtime.
 */

export type GpuAccelerationMode = 'auto' | 'on' | 'off';

/** Type guard for a persisted/raw GPU acceleration mode value. */
export function isGpuAccelerationMode(value: unknown): value is GpuAccelerationMode {
  return value === 'auto' || value === 'on' || value === 'off';
}

/**
 * Decide whether to disable hardware acceleration on this boot.
 *
 * - `off`  → always disable.
 * - `on`   → never disable.
 * - `auto` → disable only if a previous probe flagged the GPU as blocklisted.
 *            First boot (`blocklisted === undefined`) enables acceleration.
 */
export function shouldDisableHardwareAcceleration(
  mode: GpuAccelerationMode,
  blocklisted: boolean | undefined
): boolean {
  if (mode === 'off') return true;
  if (mode === 'on') return false;
  return blocklisted === true;
}

/**
 * Interpret an Electron `GPUFeatureStatus`-shaped object and decide whether the
 * GPU is effectively unusable (software fallback / disabled / unavailable) for
 * the features that matter to rendering.
 *
 * Values seen in practice: `enabled`, `enabled_readback`, `enabled_force`,
 * `software`, `disabled_software`, `disabled_off`, `unavailable_software`, etc.
 */
export function isGpuBlocklisted(status: Record<string, string> | undefined | null): boolean {
  if (!status) return false;
  const critical = ['gpu_compositing', 'webgl'];
  return critical.some((key) => {
    const value = status[key];
    if (!value) return false;
    return (
      value.startsWith('disabled') || value.startsWith('unavailable') || value.includes('software')
    );
  });
}
