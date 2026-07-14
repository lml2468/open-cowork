import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

function readChatView() {
  const filePath = path.resolve(__dirname, '../src/renderer/components/ChatView.tsx');
  return fs.readFileSync(filePath, 'utf8');
}

describe('chat view width layout', () => {
  it('uses a centered responsive messages container', () => {
    const source = readChatView();
    expect(source).toContain('max-w-content');
    expect(source).toContain('gutter-x');
  });

  it('virtualizes the message list without hard-coded class selectors', () => {
    const source = readChatView();
    // The message list is virtualized via react-virtuoso; scrolling is handled
    // by Virtuoso rather than a hard-coded class-selector lookup.
    expect(source).toContain('Virtuoso');
    expect(source).not.toContain("querySelector('.max-w-3xl')");
  });
});
