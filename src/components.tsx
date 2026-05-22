import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { theme } from './theme.js';
import type { Mode, Stats } from './types.js';
import { fmtClock } from './format.js';

// ──────────────────────────────────────────────────────────────────
// Chrome (barra superior estilo macOS con dots + título + reloj)
// ──────────────────────────────────────────────────────────────────
export function Chrome({ width }: { width: number }) {
  const [now, setNow] = useState(fmtClock());
  useEffect(() => {
    const id = setInterval(() => setNow(fmtClock()), 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <Box
      width={width}
      borderStyle="single"
      borderColor={theme.line}
      borderTop={false}
      borderLeft={false}
      borderRight={false}
      paddingX={1}
    >
      <Box width={20}>
        <Text color={theme.err}>● </Text>
        <Text color={theme.warn}>● </Text>
        <Text color={theme.ok}>●</Text>
      </Box>
      <Box flexGrow={1} justifyContent="center">
        <Text color={theme.fgMute}>~/notes-tasks — tui v0.1</Text>
      </Box>
      <Box width={20} justifyContent="flex-end">
        <Text color={theme.fgDim}>{now}</Text>
      </Box>
    </Box>
  );
}

// ──────────────────────────────────────────────────────────────────
// Header con brand + tabs + stats
// ──────────────────────────────────────────────────────────────────
export function Header({
  mode,
  stats,
  width,
}: {
  mode: Mode;
  stats: Stats;
  width: number;
}) {
  const compact = width < 80;

  return (
    <Box
      width={width}
      borderStyle="single"
      borderColor={theme.line}
      borderTop={false}
      borderLeft={false}
      borderRight={false}
      paddingX={1}
    >
      <Box width={compact ? 12 : 20}>
        <Text bold color={theme.fgBright}>
          <Text color={theme.accent}>▮ </Text>
          tui
          <Text color={theme.fgDim}>·</Text>
          nt
        </Text>
      </Box>
      <Box flexGrow={1} marginLeft={1}>
        <Tab label="TASKS" hint="/tasks" active={mode === 'tasks'} accent={theme.accent} />
        <Box marginLeft={1}>
          <Tab label="NOTES" hint="/notes" active={mode === 'notes'} accent={theme.accent3} />
        </Box>
      </Box>
      {!compact && (
        <Box>
          <Stat label="tareas" value={stats.open} />
          <Box marginLeft={2}>
            <Stat label="hechas" value={stats.done} />
          </Box>
          <Box marginLeft={2}>
            <Stat label="notas" value={stats.notes} />
          </Box>
        </Box>
      )}
    </Box>
  );
}

function Tab({
  label,
  hint,
  active,
  accent,
}: {
  label: string;
  hint: string;
  active: boolean;
  accent: string;
}) {
  if (active) {
    return (
      <Text>
        <Text backgroundColor={accent} color={theme.bg0} bold>
          {' '}
          {label}{' '}
        </Text>
        <Text backgroundColor={accent} color={theme.bg0}>
          {hint}{' '}
        </Text>
      </Text>
    );
  }
  return (
    <Text color={theme.fgMute}>
      {' '}
      {label}{' '}
      <Text color={theme.fgDim}>{hint}</Text>
      {' '}
    </Text>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Text color={theme.fgMute}>
      {label} <Text color={theme.fg} bold>{value}</Text>
    </Text>
  );
}

// ──────────────────────────────────────────────────────────────────
// Prompt: input multiplexado (modo comando o modo editor de nota)
// ──────────────────────────────────────────────────────────────────
export interface PromptProps {
  mode: Mode;
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  onTab: () => void;
  onArrowUp: () => void;
  onArrowDown: () => void;
  placeholder: string;
  /** true cuando el editor de notas está activo (cambia el indicador). */
  editor?: { lineNumber: number } | null;
  width: number;
}

export function Prompt(props: PromptProps) {
  const { mode, value, onChange, onSubmit, onTab, onArrowUp, onArrowDown, placeholder, editor, width } =
    props;

  useInput((input, key) => {
    if (key.return) {
      onSubmit(value);
      return;
    }
    if (key.tab) {
      onTab();
      return;
    }
    if (key.upArrow) {
      onArrowUp();
      return;
    }
    if (key.downArrow) {
      onArrowDown();
      return;
    }
    if (key.escape) {
      return;
    }
    if (key.backspace || key.delete) {
      if (value.length > 0) onChange(value.slice(0, -1));
      return;
    }
    if (key.leftArrow || key.rightArrow) return;
    if (key.ctrl || key.meta) return;
    if (input && input.length > 0) {
      onChange(value + input);
    }
  });

  const glyphColor = editor ? theme.warn : mode === 'notes' ? theme.accent3 : theme.accent;
  const glyph = editor ? '✎' : '❯';
  const modeLabel = editor ? `body L${editor.lineNumber}` : `modo: ${mode}`;

  return (
    <Box width={width} paddingX={1}>
      <Text color={glyphColor} bold>
        {glyph}
      </Text>
      <Text color={theme.fgMute}> {modeLabel} </Text>
      <Box flexGrow={1}>
        {value.length === 0 ? (
          <Text>
            <Text color={theme.fgDim}>{placeholder}</Text>
            <Text color={glyphColor}>▮</Text>
          </Text>
        ) : (
          <Text>
            <Text color={theme.fgBright}>{value}</Text>
            <Text color={glyphColor}>▮</Text>
          </Text>
        )}
      </Box>
    </Box>
  );
}

// ──────────────────────────────────────────────────────────────────
// Status bar inferior con atajos y estado
// ──────────────────────────────────────────────────────────────────
export function StatusBar({ width, dirty }: { width: number; dirty: boolean }) {
  const compact = width < 80;
  return (
    <Box
      width={width}
      borderStyle="single"
      borderColor={theme.line}
      borderBottom={false}
      borderLeft={false}
      borderRight={false}
      paddingX={1}
    >
      <Text color={theme.fgDim}>
        <Text color={theme.fg}>↑↓</Text> historial
      </Text>
      <Text color={theme.line}>{'  │  '}</Text>
      <Text color={theme.fgDim}>
        <Text color={theme.fg}>Tab</Text> alternar modo
      </Text>
      {!compact && (
        <>
          <Text color={theme.line}>{'  │  '}</Text>
          <Text color={theme.fgDim}>
            <Text color={theme.fg}>/help</Text> comandos
          </Text>
          <Text color={theme.line}>{'  │  '}</Text>
          <Text color={theme.fgDim}>
            <Text color={theme.fg}>Ctrl+C</Text> salir
          </Text>
        </>
      )}
      <Box flexGrow={1} justifyContent="flex-end">
        <Text color={dirty ? theme.warn : theme.ok}>● {dirty ? 'guardando…' : 'conectado'}</Text>
      </Box>
    </Box>
  );
}
