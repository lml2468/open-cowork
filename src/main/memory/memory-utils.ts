import * as fs from 'node:fs';

/** Last-modified time of a file in ms, or null if it doesn't exist / can't stat. */
export function getFileTimestampMs(filePath: string): number | null {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return null;
  }
}

/** Size of a file in bytes, or 0 if it doesn't exist / can't stat. */
export function getFileSizeBytes(filePath: string): number {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}
