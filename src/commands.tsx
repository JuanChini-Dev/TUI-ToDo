import type { Db } from './db.js';
import type { ExternalEditorResult } from './external-editor.js';
import { parseEditorContent } from './external-editor.js';
import type { FlashKind, Mode, View } from './types.js';

export interface Ctx {
  db: Db;
  mode: Mode;
  view: View;
  width: number;
  setMode: (m: Mode) => void;
  setView: (v: View) => void;
  /** Indica que la DB cambió: la lista viva se vuelve a derivar. */
  bumpDb: () => void;
  refreshStats: () => void;
  /** Establece el resultado del flash (eco lo pone el caller del runCommand). */
  flash: (kind: FlashKind, text: string) => void;
  /** Limpia flash y colapsa expansiones. */
  resetUi: () => void;
  toggleExpandedNote: (id: string) => void;
  collapseNote: (id: string) => void;
  collapseAllNotes: () => void;
  isNoteExpanded: (id: string) => boolean;
  /** Abre $EDITOR síncronamente con `initial` y devuelve el resultado. */
  openExternalEditor: (initial: string) => ExternalEditorResult;
  exit: () => void;
}

const TASK_OR_SUB_ID = /^T\d{3}(?:\.\d+)?$/i;
const NOTE_ID = /^N\d{3}$/i;

// ─────────────────────────────────────────────────────────────────
// Comandos
// ─────────────────────────────────────────────────────────────────
type Handler = (args: string, ctx: Ctx) => void;

function backToList(ctx: Ctx) {
  ctx.setView({ kind: 'list' });
}

const handlers: Record<string, Handler> = {
  // ── generales ────────────────────────────────────────────────
  help: (_a, ctx) => {
    ctx.setView({ kind: 'help' });
    ctx.flash('system', '→ ayuda');
  },

  back: (_a, ctx) => {
    backToList(ctx);
    ctx.flash('system', '→ lista');
  },
  list: (_a, ctx) => {
    backToList(ctx);
    ctx.bumpDb();
  },

  clear: (_a, ctx) => {
    ctx.collapseAllNotes();
    ctx.resetUi();
  },

  tasks: (_a, ctx) => {
    if (ctx.mode === 'tasks' && ctx.view.kind === 'list') {
      ctx.flash('info', 'ya estás en modo tareas');
    } else {
      ctx.setMode('tasks');
      backToList(ctx);
      ctx.flash('system', '→ modo tareas');
    }
  },

  notes: (_a, ctx) => {
    if (ctx.mode === 'notes' && ctx.view.kind === 'list') {
      ctx.flash('info', 'ya estás en modo notas');
    } else {
      ctx.setMode('notes');
      backToList(ctx);
      ctx.flash('system', '→ modo notas');
    }
  },

  quit: (_a, ctx) => {
    ctx.flash('system', 'saliendo… hasta la próxima');
    setTimeout(() => ctx.exit(), 80);
  },
  exit: (_a, ctx) => handlers.quit('', ctx),

  // ── tareas ───────────────────────────────────────────────────
  add: (args, ctx) => {
    const text = args.trim();
    if (!text) return ctx.flash('err', 'uso: /add <texto de la tarea>');
    const t = ctx.db.createTask(text);
    backToList(ctx);
    ctx.bumpDb();
    ctx.refreshStats();
    ctx.flash('ok', `${t.id} creada · ${t.text}`);
  },

  sub: (args, ctx) => {
    const m = args.trim().match(/^(T\d{3})\s+(.+)$/i);
    if (!m) return ctx.flash('err', 'uso: /sub <T001> <texto de la subtarea>');
    const parentId = m[1].toUpperCase();
    const parent = ctx.db.findTask(parentId);
    if (!parent) return ctx.flash('err', `no encuentro la tarea ${parentId}`);
    const s = ctx.db.createSubtask(parentId, m[2].trim());
    backToList(ctx);
    ctx.bumpDb();
    ctx.refreshStats();
    ctx.flash('ok', `${s.id} creada · ${s.text}`);
  },

  edit: (args, ctx) => {
    if (ctx.mode === 'notes') return editNote(args, ctx);
    const m = args.trim().match(/^(T\d{3}(?:\.\d+)?)\s+(.+)$/i);
    if (!m) return ctx.flash('err', 'uso: /edit <T001 ó T001.2> <nuevo texto>');
    const id = m[1].toUpperCase();
    const found = ctx.db.findAny(id);
    if (!found) return ctx.flash('err', `no encuentro ${id}`);
    ctx.db.editTaskOrSub(id, m[2].trim());
    backToList(ctx);
    ctx.bumpDb();
    ctx.flash('ok', `${id} editada`);
  },

  del: (args, ctx) => {
    if (ctx.mode === 'notes') return delNote(args, ctx);
    const id = args.trim().toUpperCase();
    if (!id || !TASK_OR_SUB_ID.test(id))
      return ctx.flash('err', 'uso: /del <T001 ó T001.2>');
    const found = ctx.db.findAny(id);
    if (!found) return ctx.flash('err', `no encuentro ${id}`);
    if (found.kind === 'task') {
      ctx.db.deleteTask(id);
      ctx.flash('ok', `tarea ${id} eliminada (con sus subtareas)`);
    } else {
      ctx.db.deleteSub(id);
      ctx.flash('ok', `subtarea ${id} eliminada`);
    }
    backToList(ctx);
    ctx.bumpDb();
    ctx.refreshStats();
  },

  done: (args, ctx) => {
    const id = args.trim().toUpperCase();
    if (!id || !TASK_OR_SUB_ID.test(id))
      return ctx.flash('err', 'uso: /done <T001 ó T001.2>');
    const found = ctx.db.findAny(id);
    if (!found) return ctx.flash('err', `no encuentro ${id}`);
    const target = found.kind === 'task' ? found.task : found.sub;
    if (target.status) return ctx.flash('info', `${id} ya estaba hecha`);
    ctx.db.setStatus(id, true);
    backToList(ctx);
    ctx.bumpDb();
    ctx.refreshStats();
    ctx.flash('ok', `${id} marcada como hecha`);
  },

  undone: (args, ctx) => {
    const id = args.trim().toUpperCase();
    if (!id || !TASK_OR_SUB_ID.test(id))
      return ctx.flash('err', 'uso: /undone <T001 ó T001.2>');
    const found = ctx.db.findAny(id);
    if (!found) return ctx.flash('err', `no encuentro ${id}`);
    const target = found.kind === 'task' ? found.task : found.sub;
    if (!target.status) return ctx.flash('info', `${id} ya estaba pendiente`);
    ctx.db.setStatus(id, false);
    backToList(ctx);
    ctx.bumpDb();
    ctx.refreshStats();
    ctx.flash('ok', `${id} marcada como pendiente`);
  },

  history: (_a, ctx) => {
    ctx.setView({ kind: 'history' });
    ctx.flash('system', '→ historial');
  },

  clean: (_a, ctx) => {
    const n = ctx.db.cleanCompleted();
    if (n === 0) {
      ctx.flash('info', 'no hay tareas completadas para ocultar');
    } else {
      backToList(ctx);
      ctx.bumpDb();
      ctx.flash('ok', `ocultadas ${n} tarea(s) completada(s)`);
    }
    ctx.refreshStats();
  },

  // ── notas ────────────────────────────────────────────────────
  new: (args, ctx) => {
    const titleArg = args.trim();
    const initial = titleArg ? `${titleArg}\n\n` : '';
    const { content, cancelled } = ctx.openExternalEditor(initial);
    if (cancelled) return ctx.flash('info', 'edición cancelada');
    const { title, body } = parseEditorContent(content);
    if (!title) return ctx.flash('err', 'la primera línea debe ser el título');
    const note = ctx.db.createNote(title, body);
    if (ctx.mode !== 'notes') ctx.setMode('notes');
    backToList(ctx);
    ctx.bumpDb();
    ctx.refreshStats();
    ctx.flash('ok', `nota ${note.id} creada · ${note.title}`);
  },

  open: (args, ctx) => {
    const id = args.trim().toUpperCase();
    if (!NOTE_ID.test(id)) return ctx.flash('err', 'uso: /open <N001>');
    const note = ctx.db.findNote(id);
    if (!note) return ctx.flash('err', `no encuentro ${id}`);
    if (ctx.mode !== 'notes') ctx.setMode('notes');
    backToList(ctx);
    const wasExpanded = ctx.isNoteExpanded(id);
    ctx.toggleExpandedNote(id);
    ctx.flash('ok', wasExpanded ? `${id} colapsada` : `${id} expandida`);
  },

  close: (args, ctx) => {
    const id = args.trim().toUpperCase();
    if (!NOTE_ID.test(id)) return ctx.flash('err', 'uso: /close <N001>');
    if (!ctx.isNoteExpanded(id)) return ctx.flash('info', `${id} ya estaba colapsada`);
    ctx.collapseNote(id);
    ctx.flash('ok', `${id} colapsada`);
  },

  search: (args, ctx) => {
    const q = args.trim();
    if (!q) return ctx.flash('err', 'uso: /search <texto>');
    ctx.setView({ kind: 'search', query: q });
    ctx.flash('system', `→ búsqueda · "${q}"`);
  },
};

function editNote(args: string, ctx: Ctx) {
  const m = args.trim().match(/^(N\d{3})$/i);
  if (!m) return ctx.flash('err', 'uso: /edit <N001>');
  const id = m[1].toUpperCase();
  const note = ctx.db.findNote(id);
  if (!note) return ctx.flash('err', `no encuentro ${id}`);
  const initial = note.body ? `${note.title}\n\n${note.body}\n` : `${note.title}\n\n`;
  const { content, cancelled } = ctx.openExternalEditor(initial);
  if (cancelled) return ctx.flash('info', 'edición cancelada');
  const { title, body } = parseEditorContent(content);
  if (!title) return ctx.flash('err', 'la primera línea debe ser el título');
  ctx.db.updateNote(id, title, body);
  backToList(ctx);
  ctx.bumpDb();
  ctx.flash('ok', `nota ${id} actualizada`);
}

function delNote(args: string, ctx: Ctx) {
  const id = args.trim().toUpperCase();
  if (!NOTE_ID.test(id)) return ctx.flash('err', 'uso: /del <N001>');
  const note = ctx.db.findNote(id);
  if (!note) return ctx.flash('err', `no encuentro ${id}`);
  ctx.db.deleteNote(id);
  ctx.collapseNote(id);
  backToList(ctx);
  ctx.bumpDb();
  ctx.refreshStats();
  ctx.flash('ok', `nota ${id} eliminada`);
}

// ─────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────
export function runCommand(raw: string, ctx: Ctx) {
  const trimmed = raw.trim();
  if (!trimmed) return;

  if (!trimmed.startsWith('/')) {
    ctx.flash('err', 'los comandos empiezan con /. probá /help.');
    return;
  }

  const space = trimmed.indexOf(' ');
  const name = (space === -1 ? trimmed.slice(1) : trimmed.slice(1, space)).toLowerCase();
  const args = space === -1 ? '' : trimmed.slice(space + 1);

  const fn = handlers[name];
  if (!fn) {
    ctx.flash('err', `comando desconocido: /${name}. probá /help`);
    return;
  }
  try {
    fn(args, ctx);
  } catch (e) {
    ctx.flash('err', `error en /${name}: ${(e as Error).message}`);
  }
}
