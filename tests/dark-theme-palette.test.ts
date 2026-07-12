import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const stylesPath = path.resolve(process.cwd(), 'src/renderer/styles/globals.css');

describe('dark theme palette', () => {
  it('uses a cool graphite palette for the default theme', () => {
    const source = fs.readFileSync(stylesPath, 'utf8');
    expect(source).toContain('--color-background: #0E0F11;');
    expect(source).toContain('--color-surface: #17181B;');
    expect(source).toContain('--color-text-primary: #ECEEF1;');
  });

  it('keeps the accent within the cool indigo family', () => {
    const source = fs.readFileSync(stylesPath, 'utf8');
    expect(source).toContain('--color-accent: #6D8BFF;');
    expect(source).toContain('--color-accent-hover: #8AA0FF;');
  });
});
