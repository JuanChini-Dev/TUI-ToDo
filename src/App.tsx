import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, useApp, useStdin, useStdout } from 'ink';
import { Chrome, Header, Prompt, StatusBar } from './components.js';
import {
  renderEmpty,
  renderHelp,
  renderHistoryRow,
  renderNoteBodyLine,
  renderNoteBodyMeta,
  renderNoteRow,
  renderSection,
  renderSubtask,
  renderTask,
  renderText,
} from './lines.js';
import { runCommand } from './commands.js';
import { runExternalEditor } from './external-editor.js';
import type { Db } from './db.js';
import type { Flash, FlashKind, Mode, Stats, View } from './types.js';
import { theme } from './theme.js';

// chrome (2) + header (2) + flash (1) + prompt (1) + status (2)
const FIXED_ROWS = 8;

interface Props {
  db: Db;
}

interface ListItem {
  rows: number;
  node: React.ReactNode;
  key: string;
}

export function App({ db }: Props) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const { setRawMode, isRawModeSupported } = useStdin();

  const [size, setSize] = useState({
    cols: stdout.columns ?? 80,
    rows: stdout.rows ?? 24,
  });
  const [mode, setMode] = useState<Mode>('tasks');
  const [view, setView] = useState<View>({ kind: 'list' });
  const [dbVersion, setDbVersion] = useState(0);
  const [stats, setStats] = useState<Stats>(() => db.getStats());
  const [cmdValue, setCmdValue] = useState('');
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [dirty, setDirty] = useState(false);
  const [flash, setFlashState] = useState<Flash | null>(null);
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(() => new Set());

  // ── Resize ──────────────────────────────────────────────────────
  useEffect(() => {
    const update = () =>
      setSize({ cols: stdout.columns ?? 80, rows: stdout.rows ?? 24 });
    stdout.on('resize', update);
    return () => {
      stdout.off('resize', update);
    };
  }, [stdout]);

  // ── Helpers ─────────────────────────────────────────────────────
  const flashDirty = useCallback(() => {
    setDirty(true);
    setTimeout(() => setDirty(false), 220);
  }, []);

  const refreshStats = useCallback(() => setStats(db.getStats()), [db]);
  const bumpDb = useCallback(() => setDbVersion((v) => v + 1), []);

  const flashFn = useCallback((kind: FlashKind, text: string) => {
    setFlashState((f) => ({ echo: f?.echo ?? '', result: { kind, text } }));
  }, []);

  const resetUi = useCallback(() => {
    setFlashState(null);
    setView({ kind: 'list' });
  }, []);

  const toggleExpandedNote = useCallback((id: string) => {
    setExpandedNotes((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const collapseNote = useCallback((id: string) => {
    setExpandedNotes((s) => {
      if (!s.has(id)) return s;
      const next = new Set(s);
      next.delete(id);
      return next;
    });
  }, []);

  const collapseAllNotes = useCallback(() => {
    setExpandedNotes((s) => (s.size === 0 ? s : new Set()));
  }, []);

  const expandedRef = useRef(expandedNotes);
  expandedRef.current = expandedNotes;
  const isNoteExpanded = useCallback(
    (id: string) => expandedRef.current.has(id),
    [],
  );

  const openExternalEditor = useCallback(
    (initial: string) => {
      if (!isRawModeSupported) {
        return { content: '', cancelled: true };
      }
      // Limpia la pantalla para que el editor arranque sin restos del TUI
      // visibles antes de su pantalla alterna.
      stdout.write('\x1b[2J\x1b[H');
      const result = runExternalEditor(initial, setRawMode);
      // Forzar un repintado completo: re-emite el último frame.
      stdout.write('\x1b[2J\x1b[H');
      return result;
    },
    [stdout, setRawMode, isRawModeSupported],
  );

  const makeCtx = useCallback(
    () => ({
      db,
      mode,
      view,
      width: size.cols,
      setMode: (m: Mode) => setMode(m),
      setView,
      bumpDb,
      refreshStats,
      flash: flashFn,
      resetUi,
      toggleExpandedNote,
      collapseNote,
      collapseAllNotes,
      isNoteExpanded,
      openExternalEditor,
      exit,
    }),
    [
      db,
      mode,
      view,
      size.cols,
      bumpDb,
      refreshStats,
      flashFn,
      resetUi,
      toggleExpandedNote,
      collapseNote,
      collapseAllNotes,
      isNoteExpanded,
      openExternalEditor,
      exit,
    ],
  );

  // ── Items del body según la vista ───────────────────────────────
  const bodyItems = useMemo<ListItem[]>(() => {
    const items: ListItem[] = [];
    if (view.kind === 'help') {
      items.push({ ...renderHelp(), key: 'help' });
      return items;
    }
    if (view.kind === 'history') {
      const rows = db.listHistory();
      if (rows.length === 0) {
        items.push({ ...renderEmpty('aún no has completado tareas.'), key: 'empty' });
      } else {
        items.push({
          ...renderSection('historial de tareas completadas', rows.length),
          key: 'h',
        });
        for (const r of rows) items.push({ ...renderHistoryRow(r), key: `${r.id}-${r.when}` });
      }
      return items;
    }
    if (view.kind === 'search') {
      const matches = db.searchNotes(view.query);
      if (matches.length === 0) {
        items.push({
          ...renderText('info', `· sin resultados para "${view.query}".`),
          key: 'empty',
        });
      } else {
        items.push({
          ...renderSection(`resultados para "${view.query}"`, matches.length),
          key: 'h',
        });
        for (const n of matches) items.push({ ...renderNoteRow(n, false), key: `s-${n.id}` });
      }
      return items;
    }
    // list view
    if (mode === 'tasks') {
      const tasks = db.listTasks();
      if (tasks.length === 0) {
        items.push({
          ...renderEmpty('no tienes tareas pendientes. usa /add <texto> para crear una.'),
          key: 'empty',
        });
      } else {
        items.push({ ...renderSection('tareas pendientes', tasks.length), key: 'h' });
        for (const t of tasks) {
          items.push({ ...renderTask(t), key: t.id });
          const subs = t.subtasks ?? [];
          subs.forEach((s, i) => {
            items.push({ ...renderSubtask(s, i === subs.length - 1), key: s.id });
          });
        }
      }
    } else {
      const notes = db.listNotes();
      if (notes.length === 0) {
        items.push({
          ...renderEmpty('no hay notas. usa /new <título> para crear una.'),
          key: 'empty',
        });
      } else {
        items.push({ ...renderSection('notas', notes.length), key: 'h' });
        for (const n of notes) {
          const expanded = expandedNotes.has(n.id);
          items.push({ ...renderNoteRow(n, expanded), key: n.id });
          if (expanded) {
            items.push({ ...renderNoteBodyMeta(n), key: `${n.id}-meta` });
            const lines = n.body.length === 0 ? ['(sin contenido)'] : n.body.split('\n');
            lines.forEach((line, i) => {
              items.push({ ...renderNoteBodyLine(line), key: `${n.id}-l${i}` });
            });
          }
        }
      }
    }
    return items;
  }, [view, mode, db, dbVersion, expandedNotes]);

  // ── Submit ──────────────────────────────────────────────────────
  const handleSubmit = useCallback(
    (raw: string) => {
      const text = raw;
      if (!text.trim()) {
        setCmdValue('');
        return;
      }
      setCmdHistory((h) => {
        const next = h[h.length - 1] === text ? h : [...h, text];
        return next.slice(-100);
      });
      setHistoryIdx(-1);
      setCmdValue('');
      setFlashState({ echo: text, result: null });
      runCommand(text, makeCtx());
      flashDirty();
      refreshStats();
    },
    [makeCtx, flashDirty, refreshStats],
  );

  const handleTab = useCallback(() => {
    const next: Mode = mode === 'tasks' ? 'notes' : 'tasks';
    setMode(next);
    setView({ kind: 'list' });
    setFlashState({ echo: 'Tab', result: { kind: 'system', text: `modo ${next}` } });
  }, [mode]);

  const handleArrowUp = useCallback(() => {
    if (cmdHistory.length === 0) return;
    const newIdx =
      historyIdx === -1 ? cmdHistory.length - 1 : Math.max(0, historyIdx - 1);
    setHistoryIdx(newIdx);
    setCmdValue(cmdHistory[newIdx] ?? '');
  }, [cmdHistory, historyIdx]);

  const handleArrowDown = useCallback(() => {
    if (cmdHistory.length === 0) return;
    if (historyIdx === -1) return;
    const newIdx = historyIdx + 1;
    if (newIdx >= cmdHistory.length) {
      setHistoryIdx(-1);
      setCmdValue('');
    } else {
      setHistoryIdx(newIdx);
      setCmdValue(cmdHistory[newIdx] ?? '');
    }
  }, [cmdHistory, historyIdx]);

  // ── Slicing del body (top-down, indicador "+K más abajo") ──────
  const { bodySlice, hidden } = useMemo(() => {
    const totalBody = Math.max(3, size.rows - FIXED_ROWS);
    const naturalRows = bodyItems.reduce((sum, it) => sum + it.rows, 0);
    if (naturalRows <= totalBody) {
      return { bodySlice: bodyItems, hidden: 0 };
    }
    let rowsLeft = totalBody - 1;
    const out: ListItem[] = [];
    for (let i = 0; i < bodyItems.length; i++) {
      if (bodyItems[i].rows > rowsLeft) break;
      out.push(bodyItems[i]);
      rowsLeft -= bodyItems[i].rows;
    }
    return { bodySlice: out, hidden: bodyItems.length - out.length };
  }, [bodyItems, size.rows]);

  const promptPlaceholder =
    mode === 'tasks'
      ? 'ej: /add llamar al banco · /done T002 · /help'
      : 'ej: /new ideas para el blog · /open N001 · /help';

  return (
    <Box flexDirection="column" width={size.cols} height={size.rows}>
      <Chrome width={size.cols} />
      <Header mode={mode} stats={stats} width={size.cols} />
      <Box flexDirection="column" flexGrow={1} paddingX={1}>
        {bodySlice.map((l) => (
          <Box key={l.key}>{l.node}</Box>
        ))}
        {hidden > 0 && (
          <Text color={theme.fgDim} italic>
            … (+{hidden} elemento(s) ocultos abajo · /clear para colapsar notas)
          </Text>
        )}
      </Box>
      <FlashBar flash={flash} mode={mode} width={size.cols} />
      <Prompt
        mode={mode}
        value={cmdValue}
        onChange={setCmdValue}
        onSubmit={handleSubmit}
        onTab={handleTab}
        onArrowUp={handleArrowUp}
        onArrowDown={handleArrowDown}
        placeholder={promptPlaceholder}
        editor={null}
        width={size.cols}
      />
      <StatusBar width={size.cols} dirty={dirty} />
    </Box>
  );
}

const FLASH_MARKER: Record<FlashKind, string> = {
  ok: '✓',
  err: '×',
  info: '·',
  system: '→',
  dim: '',
};

const FLASH_COLOR: Record<FlashKind, string> = {
  ok: theme.ok,
  err: theme.err,
  info: theme.accent2,
  system: theme.info,
  dim: theme.fgDim,
};

function FlashBar({
  flash,
  mode,
  width,
}: {
  flash: Flash | null;
  mode: Mode;
  width: number;
}) {
  if (!flash || (!flash.echo && !flash.result)) {
    return (
      <Box width={width} paddingX={1}>
        <Text> </Text>
      </Box>
    );
  }
  const echoColor = mode === 'notes' ? theme.accent3 : theme.accent;
  const result = flash.result;
  return (
    <Box width={width} paddingX={1}>
      <Text>
        {flash.echo ? (
          <>
            <Text color={echoColor}>❯ </Text>
            <Text color={theme.fgMute}>{flash.echo}</Text>
          </>
        ) : null}
        {result ? (
          <>
            {flash.echo ? <Text color={theme.fgDim}>  </Text> : null}
            <Text color={FLASH_COLOR[result.kind]}>
              {FLASH_MARKER[result.kind]
                ? `${FLASH_MARKER[result.kind]} ${result.text}`
                : result.text}
            </Text>
          </>
        ) : null}
      </Text>
    </Box>
  );
}
