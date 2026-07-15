/**
 * Renderer-side detection of destructive delete commands, used to strengthen
 * the permission dialog's warning copy for the user.
 *
 * This mirrors (in spirit) the enforcement patterns in the main-process
 * `permission-rules-store.ts` — the renderer cannot import main-process code,
 * so the small pattern set is duplicated here on purpose.
 */

const SHELL_TOOL_HINTS = ['bash', 'command', 'shell', 'exec'];

const DESTRUCTIVE_DELETE_PATTERNS: RegExp[] = [
  /\brm\s+-[a-z]*[rf]/i,
  /\brm\s+[^|;&]*\*/i,
  /\brm\s+\//i,
  /\brmdir\b/i,
  /\bunlink\b/i,
  /\bshred\b/i,
  /\bfind\b[^|;&]*-delete/i,
  /\bgit\s+clean\s+-[a-z]*f/i,
  /\bdel\s+\/[a-z]/i,
  /\brd\s+\/s/i,
];

/** Patterns that suggest a bulk / recursive delete (wildcards or -r). */
const BULK_DELETE_PATTERNS: RegExp[] = [
  /\brm\s+-[a-z]*r/i,
  /\brm\s+[^|;&]*\*/i,
  /\bfind\b[^|;&]*-delete/i,
];

function isShellTool(toolName: string): boolean {
  const lowered = toolName.toLowerCase();
  return SHELL_TOOL_HINTS.some((hint) => lowered.includes(hint));
}

function stringifyInput(input: unknown): string {
  if (typeof input === 'string') return input;
  try {
    return JSON.stringify(input) ?? '';
  } catch {
    return '';
  }
}

export function isDestructiveDeleteRequest(toolName: string, input: unknown): boolean {
  if (!isShellTool(toolName)) return false;
  const inputStr = stringifyInput(input);
  return DESTRUCTIVE_DELETE_PATTERNS.some((pattern) => pattern.test(inputStr));
}

export function isBulkDeleteRequest(toolName: string, input: unknown): boolean {
  if (!isShellTool(toolName)) return false;
  const inputStr = stringifyInput(input);
  return BULK_DELETE_PATTERNS.some((pattern) => pattern.test(inputStr));
}
