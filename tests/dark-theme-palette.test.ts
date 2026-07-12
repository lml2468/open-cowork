import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const stylesPath = path.resolve(process.cwd(), 'src/renderer/styles/globals.css');

describe('dark theme palette', () => {
  it('uses a cool graphite palette for the default theme', () => {
    const source = fs.readFileSync(stylesPath, 'utf8');
    expect(source).toContain('--color-background: #0e0f11;');
    expect(source).toContain('--color-surface: #17181b;');
    expect(source).toContain('--color-text-primary: #eceef1;');
  });

  it('keeps the accent within the cool indigo family', () => {
    const source = fs.readFileSync(stylesPath, 'utf8');
    expect(source).toContain('--color-accent: #6d8bff;');
    expect(source).toContain('--color-accent-hover: #8aa0ff;');
  });
});
