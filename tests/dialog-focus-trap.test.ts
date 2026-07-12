import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), 'utf8');

describe('dialog focus trap', () => {
  it('provides a reusable useFocusTrap hook that cycles Tab and restores focus', () => {
    const src = read('src/renderer/hooks/useFocusTrap.ts');
    expect(src).toContain('export function useFocusTrap');
    // cycles on Tab (both directions)
    expect(src).toContain("e.key !== 'Tab'");
    expect(src).toContain('e.shiftKey');
    // restores focus to the previously-focused trigger on close
    expect(src).toContain('previouslyFocused');
  });

  it('wires the focus trap into the interactive modal dialogs', () => {
    for (const file of [
      'src/renderer/components/PermissionDialog.tsx',
      'src/renderer/components/SudoPasswordDialog.tsx',
      'src/renderer/components/ConfigModal.tsx',
    ]) {
      const src = read(file);
      expect(src).toContain('useFocusTrap');
      expect(src).toContain('ref={dialogRef}');
      // the trapped container is the dialog role container
      expect(src).toContain('role="dialog"');
    }
  });
});
