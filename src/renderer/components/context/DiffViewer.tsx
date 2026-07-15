import { memo } from 'react';
import type { DiffLine, ParsedDiffFile } from '../../utils/parse-diff';

interface DiffViewerProps {
  file: ParsedDiffFile;
}

function lineClasses(type: DiffLine['type']): string {
  switch (type) {
    case 'add':
      return 'bg-success/10 text-text-primary';
    case 'del':
      return 'bg-error/10 text-text-primary';
    case 'hunk':
      return 'bg-surface-muted text-text-muted';
    default:
      return 'text-text-secondary';
  }
}

function marker(type: DiffLine['type']): string {
  if (type === 'add') return '+';
  if (type === 'del') return '-';
  return ' ';
}

/** Renders a single file's parsed unified diff with line-number gutters. */
export const DiffViewer = memo(function DiffViewer({ file }: DiffViewerProps) {
  if (file.isBinary) {
    return null;
  }

  return (
    <div className="overflow-x-auto font-mono text-caption leading-relaxed">
      <table className="w-full border-collapse">
        <tbody>
          {file.lines.map((line, index) => (
            <tr key={index} className={lineClasses(line.type)}>
              <td className="select-none w-8 pr-1 text-right align-top text-text-muted/60 tabular-nums">
                {line.oldLine ?? ''}
              </td>
              <td className="select-none w-8 pr-2 text-right align-top text-text-muted/60 tabular-nums">
                {line.newLine ?? ''}
              </td>
              <td className="select-none w-3 align-top text-text-muted/70">{marker(line.type)}</td>
              <td className="whitespace-pre-wrap break-all align-top">{line.text || ' '}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});
