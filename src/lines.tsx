import React from 'react';
import { Box, Text } from 'ink';
import { theme } from './theme.js';
import type { Note, Subtask, Task } from './types.js';
import { fmtDate, fmtRelative } from './format.js';

// ──────────────────────────────────────────────────────────────────
// Renderers de líneas (cada uno reporta sus filas estimadas en `rows`)
// ──────────────────────────────────────────────────────────────────

export function renderText(kind: 'system' | 'ok' | 'err' | 'info' | 'dim' | 'plain', text: string) {
  const colorMap = {
    system: theme.info,
    ok: theme.ok,
    err: theme.err,
    info: theme.accent2,
    dim: theme.fgDim,
    plain: theme.fg,
  } as const;
  return {
    rows: 1,
    node: <Text color={colorMap[kind]}>{text}</Text>,
  };
}

export function renderDivider(width: number) {
  const len = Math.max(20, Math.min(120, width - 4));
  return {
    rows: 1,
    node: <Text color={theme.line}>{'─'.repeat(len)}</Text>,
  };
}

export function renderSection(title: string, count?: number) {
  return {
    rows: 1,
    node: (
      <Text>
        <Text color={theme.fgMute} bold>
          {title.toUpperCase()}
        </Text>
        {typeof count === 'number' && (
          <Text color={theme.fgDim}> · {count}</Text>
        )}
      </Text>
    ),
  };
}

export function renderEmpty(text: string) {
  return {
    rows: 1,
    node: (
      <Text color={theme.fgDim} italic>
        {text}
      </Text>
    ),
  };
}

export function renderTask(t: Task) {
  const meta = t.status
    ? `hecha · ${fmtRelative(t.completedAt)}`
    : `creada · ${fmtRelative(t.createdAt)}`;
  return {
    rows: 1,
    node: (
      <Box>
        <Box width={2}>
          <Text color={t.status ? theme.ok : theme.fgDim} bold>
            -
          </Text>
        </Box>
        <Box width={9}>
          <Text color={theme.accent2}>{t.id}</Text>
        </Box>
        <Box flexGrow={1} marginRight={1}>
          {t.status ? (
            <Text color={theme.fgDim} strikethrough>
              {t.text}
            </Text>
          ) : (
            <Text color={theme.fg}>{t.text}</Text>
          )}
        </Box>
        <Box>
          <Text color={theme.fgDim}>{meta}</Text>
        </Box>
      </Box>
    ),
  };
}

export function renderSubtask(s: Subtask, isLast: boolean) {
  const branch = isLast ? '└─' : '├─';
  const meta = s.status
    ? `hecha · ${fmtRelative(s.completedAt)}`
    : `creada · ${fmtRelative(s.createdAt)}`;
  return {
    rows: 1,
    node: (
      <Box>
        <Box width={2}>
          <Text color={theme.line}>{branch}</Text>
        </Box>
        <Box width={2}>
          <Text color={s.status ? theme.ok : theme.fgDim} bold>
            -
          </Text>
        </Box>
        <Box width={9}>
          <Text color={theme.accent2} dimColor>
            {s.id}
          </Text>
        </Box>
        <Box flexGrow={1} marginRight={1}>
          {s.status ? (
            <Text color={theme.fgDim} strikethrough>
              {s.text}
            </Text>
          ) : (
            <Text color={theme.fg}>{s.text}</Text>
          )}
        </Box>
        <Box>
          <Text color={theme.fgDim}>{meta}</Text>
        </Box>
      </Box>
    ),
  };
}

export function renderNoteRow(n: Note, expanded = false) {
  const firstLine = n.body.split('\n')[0] ?? '';
  const preview = firstLine.length > 60 ? firstLine.slice(0, 60) + '…' : firstLine;
  const marker = expanded ? '▼' : '▶';
  return {
    rows: 1,
    node: (
      <Box>
        <Box width={2}>
          <Text color={expanded ? theme.accent3 : theme.fgDim}>{marker}</Text>
        </Box>
        <Box width={6}>
          <Text color={theme.accent3}>{n.id}</Text>
        </Box>
        <Box flexGrow={1} marginRight={1}>
          <Text>
            <Text color={theme.fgBright} bold>
              {n.title}
            </Text>
            {!expanded && preview ? <Text color={theme.fgMute}>  {preview}</Text> : null}
          </Text>
        </Box>
        <Box>
          <Text color={theme.fgDim}>{fmtRelative(n.createdAt)}</Text>
        </Box>
      </Box>
    ),
  };
}

export function renderNoteBodyLine(line: string) {
  return {
    rows: 1,
    node: (
      <Box>
        <Box width={8} />
        <Text color={line ? theme.fg : theme.fgDim}>{line || ' '}</Text>
      </Box>
    ),
  };
}

export function renderNoteBodyMeta(n: Note) {
  return {
    rows: 1,
    node: (
      <Box>
        <Box width={8} />
        <Text color={theme.fgDim} italic>
          creada · {fmtDate(n.createdAt)}
        </Text>
      </Box>
    ),
  };
}

export function renderHistoryRow(row: { id: string; text: string; when: number }) {
  return {
    rows: 1,
    node: (
      <Box>
        <Box width={9}>
          <Text color={theme.accent2}>{row.id}</Text>
        </Box>
        <Box flexGrow={1} marginRight={1}>
          <Text color={theme.fgMute}>{row.text}</Text>
        </Box>
        <Box>
          <Text color={theme.fgDim}>{fmtDate(row.when)}</Text>
        </Box>
      </Box>
    ),
  };
}

export function renderHelp() {
  const sections: Array<{ title: string; rows: Array<[string, string]> }> = [
    {
      title: 'general',
      rows: [
        ['/help', 'muestra esta ayuda'],
        ['/back', 'vuelve a la lista (alias /list)'],
        ['/clear', 'limpia el feedback y colapsa notas abiertas'],
        ['/tasks', 'cambia al modo tareas'],
        ['/notes', 'cambia al modo notas'],
        ['/quit', 'salir de la aplicación'],
      ],
    },
    {
      title: 'tareas',
      rows: [
        ['/add <texto>', 'crea una tarea (id TNNN)'],
        ['/sub <T001> <texto>', 'añade subtarea bajo la tarea'],
        ['/edit <id> <texto>', 'edita texto de tarea o subtarea'],
        ['/del <id>', 'elimina tarea (con sus subtareas) o subtarea'],
        ['/done <id>', 'marca como resuelta'],
        ['/undone <id>', 'marca como no resuelta'],
        ['/history', 'historial de tareas completadas'],
        ['/clean', 'oculta tareas completadas de la lista'],
      ],
    },
    {
      title: 'notas',
      rows: [
        ['/new [título]', 'crea nota (abre $EDITOR)'],
        ['/open <N001>', 'expande/colapsa la nota inline en la lista'],
        ['/close <N001>', 'colapsa la nota expandida'],
        ['/edit <N001>', 'edita título y cuerpo (abre $EDITOR)'],
        ['/del <N001>', 'elimina la nota'],
        ['/search <texto>', 'busca en título y cuerpo'],
      ],
    },
    {
      title: 'editor externo',
      rows: [
        ['$VISUAL / $EDITOR', 'comando que se invoca; fallback: vi'],
        ['1ª línea', 'título · resto: cuerpo (sep. línea en blanco)'],
        ['archivo vacío', 'cancela la operación'],
      ],
    },
  ];

  let totalRows = 2; // marco superior + inferior
  for (const s of sections) totalRows += 1 + s.rows.length + 1;

  return {
    rows: totalRows,
    node: (
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor={theme.line}
        paddingX={1}
      >
        {sections.map((sec, si) => (
          <Box key={sec.title} flexDirection="column" marginTop={si === 0 ? 0 : 1}>
            <Text color={theme.warn} bold>
              {sec.title.toUpperCase()}
            </Text>
            {sec.rows.map(([cmd, desc]) => (
              <Box key={cmd}>
                <Box width={26}>
                  <Text color={theme.accent}>{cmd}</Text>
                </Box>
                <Box flexGrow={1}>
                  <Text color={theme.fgMute}>{desc}</Text>
                </Box>
              </Box>
            ))}
          </Box>
        ))}
      </Box>
    ),
  };
}

