/**
 * Tests for src/renderer/utils/destructive-command.
 *
 * Powers the permission dialog's strengthened warning for delete commands.
 */
import { describe, it, expect } from 'vitest';
import {
  isDestructiveDeleteRequest,
  isBulkDeleteRequest,
} from '../../renderer/utils/destructive-command';

describe('isDestructiveDeleteRequest', () => {
  it('detects rm/rmdir/find-delete on shell tools (string or object input)', () => {
    expect(isDestructiveDeleteRequest('bash', 'rm -rf ./dist')).toBe(true);
    expect(isDestructiveDeleteRequest('execute_command', { command: 'rmdir foo' })).toBe(true);
    expect(isDestructiveDeleteRequest('bash', { command: 'find . -delete' })).toBe(true);
  });

  it('ignores non-destructive commands and non-shell tools', () => {
    expect(isDestructiveDeleteRequest('bash', 'ls -la')).toBe(false);
    expect(isDestructiveDeleteRequest('write', { path: '/tmp/rm.txt' })).toBe(false);
  });
});

describe('isBulkDeleteRequest', () => {
  it('flags recursive and wildcard deletes', () => {
    expect(isBulkDeleteRequest('bash', 'rm -rf node_modules')).toBe(true);
    expect(isBulkDeleteRequest('bash', 'rm *.log')).toBe(true);
    expect(isBulkDeleteRequest('bash', { command: 'find . -name "*.tmp" -delete' })).toBe(true);
  });

  it('does not flag a single-file rm', () => {
    expect(isBulkDeleteRequest('bash', 'rm notes.txt')).toBe(false);
  });
});
