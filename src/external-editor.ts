import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export interface ExternalEditorResult {
  content: string;
  cancelled: boolean;
}

/**
 * Abre el editor externo (`$VISUAL` o `$EDITOR`, fallback `vi`) con `initial`
 * como contenido. Bloquea hasta que el editor cierra. La señal `setRawMode` se
 * usa para soltar el modo raw de Ink mientras dura la edición.
 */
export function runExternalEditor(
  initial: string,
  setRawMode?: (b: boolean) => void,
): ExternalEditorResult {
  let content = '';
  let cancelled = false;
  let dir: string | null = null;

  if (setRawMode) {
    try {
      setRawMode(false);
    } catch {
      /* ignore */
    }
  }

  try {
    dir = mkdtempSync(path.join(tmpdir(), 'tui-nt-'));
    const file = path.join(dir, 'note.md');
    writeFileSync(file, initial, 'utf8');

    const cmd = process.env.VISUAL || process.env.EDITOR || 'vi';
    const tokens = cmd.split(/\s+/).filter(Boolean);
    const bin = tokens[0];
    const extraArgs = tokens.slice(1);

    const result = spawnSync(bin, [...extraArgs, file], { stdio: 'inherit' });

    if (result.error || result.status !== 0) {
      cancelled = true;
    } else {
      try {
        content = readFileSync(file, 'utf8');
      } catch {
        cancelled = true;
      }
    }
  } catch {
    cancelled = true;
  } finally {
    if (dir) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
    if (setRawMode) {
      try {
        setRawMode(true);
      } catch {
        /* ignore */
      }
    }
  }

  if (!cancelled && content.trim() === '') cancelled = true;
  return { content, cancelled };
}

/**
 * Convención: la primera línea es el título; las líneas en blanco siguientes
 * se descartan; el resto es el cuerpo (sin blancos al inicio o final).
 */
export function parseEditorContent(content: string): { title: string; body: string } {
  const lines = content.split('\n');
  const title = (lines.shift() ?? '').trim();
  while (lines.length > 0 && lines[0].trim() === '') lines.shift();
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
  return { title, body: lines.join('\n') };
}
