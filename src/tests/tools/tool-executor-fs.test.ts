import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ToolExecutor } from '@/main/tools/tool-executor';
import { PathResolver } from '@/main/sandbox/path-resolver';

describe('ToolExecutor file operations (async fs)', () => {
  let tmpDir: string;
  let resolver: PathResolver;
  let exec: ToolExecutor;
  const sessionId = 's1';

  beforeEach(() => {
    // realpathSync collapses the macOS /var → /private/var symlink so the
    // resolver's within-mount check (which realpath-resolves targets) matches.
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cowork-tool-')));
    resolver = new PathResolver();
    resolver.registerSession(sessionId, [{ virtual: '/mnt/work', real: tmpDir }]);
    exec = new ToolExecutor(resolver);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes then reads a file (round-trip)', async () => {
    await exec.writeFile(sessionId, 'a.txt', 'hello world');
    const content = await exec.readFile(sessionId, 'a.txt');
    expect(content).toBe('hello world');
  });

  it('creates missing parent directories on write', async () => {
    await exec.writeFile(sessionId, 'nested/deep/b.txt', 'x');
    expect(fs.existsSync(path.join(tmpDir, 'nested/deep/b.txt'))).toBe(true);
  });

  it('reading a missing file reports File not found', async () => {
    await expect(exec.readFile(sessionId, 'missing.txt')).rejects.toThrow(/File not found/);
  });

  it('edits a file via string replacement', async () => {
    await exec.writeFile(sessionId, 'c.txt', 'foo bar foo');
    await exec.editFile(sessionId, 'c.txt', 'foo', 'baz');
    expect(await exec.readFile(sessionId, 'c.txt')).toBe('baz bar baz');
  });

  it('lists directory contents', async () => {
    await exec.writeFile(sessionId, 'd1.txt', 'aaa');
    await exec.writeFile(sessionId, 'sub/d2.txt', 'bbb');
    const listing = await exec.listDirectory(sessionId, '.');
    expect(listing).toMatch(/\[FILE\] d1\.txt/);
    expect(listing).toMatch(/\[DIR\] sub/);
  });

  it('rejects reading a file above the size cap', async () => {
    // 21 MiB > MAX_READ_BYTES (20 MiB)
    const big = path.join(tmpDir, 'big.bin');
    fs.writeFileSync(big, Buffer.alloc(21 * 1024 * 1024, 0x61));
    await expect(exec.readFile(sessionId, 'big.bin')).rejects.toThrow(/too large/i);
  });
});
