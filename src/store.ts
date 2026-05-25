import type { SupabaseClient } from '@supabase/supabase-js';
import type { Note, Stats, Subtask, Task } from './types.js';

const padTaskNum = (n: number) => 'T' + String(n).padStart(3, '0');
const padNoteNum = (n: number) => 'N' + String(n).padStart(3, '0');

interface TaskRow {
  id: string;
  text: string;
  status: number;
  created_at: number;
  completed_at: number | null;
  sort_order: number;
}

interface SubtaskRow {
  id: string;
  parent_id: string;
  text: string;
  status: number;
  created_at: number;
  completed_at: number | null;
  sort_order: number;
}

interface NoteRow {
  id: string;
  title: string;
  body: string;
  created_at: number;
}

export class Store {
  private sb: SupabaseClient;
  private tasks = new Map<string, TaskRow>();
  private subs = new Map<string, SubtaskRow>();
  private notes = new Map<string, NoteRow>();
  private hidden = new Set<string>();
  private meta = new Map<string, number>();
  private readyP: Promise<void>;

  constructor(sb: SupabaseClient) {
    this.sb = sb;
    this.readyP = this.bootstrap();
  }

  ready(): Promise<void> {
    return this.readyP;
  }

  private async bootstrap() {
    await this.hydrate();
    if (this.tasks.size === 0 && this.notes.size === 0) {
      await this.seed();
    }
  }

  private async hydrate() {
    const [t, s, n, h, m] = await Promise.all([
      this.sb.from('tasks').select('*'),
      this.sb.from('subtasks').select('*'),
      this.sb.from('notes').select('*'),
      this.sb.from('hidden').select('task_id'),
      this.sb.from('meta').select('*'),
    ]);
    for (const r of [t, s, n, h, m]) {
      if (r.error) {
        throw new Error(`Error al hidratar desde Supabase: ${r.error.message}`);
      }
    }
    for (const row of (t.data ?? []) as TaskRow[]) this.tasks.set(row.id, row);
    for (const row of (s.data ?? []) as SubtaskRow[]) this.subs.set(row.id, row);
    for (const row of (n.data ?? []) as NoteRow[]) this.notes.set(row.id, row);
    for (const row of (h.data ?? []) as Array<{ task_id: string }>) {
      this.hidden.add(row.task_id);
    }
    for (const row of (m.data ?? []) as Array<{ key: string; value: number }>) {
      this.meta.set(row.key, Number(row.value));
    }
  }

  private norm(s: string): string {
    return s.toUpperCase();
  }

  // ── meta / counters ──────────────────────────────────────────────
  private getMeta(key: string): number {
    return this.meta.get(key) ?? 0;
  }

  private setMetaAsync(key: string, value: number) {
    this.meta.set(key, value);
    this.fire(`upsert meta ${key}`, this.sb.from('meta').upsert({ key, value }));
  }

  private nextTaskId(): string {
    const n = this.getMeta('taskCounter') + 1;
    this.setMetaAsync('taskCounter', n);
    return padTaskNum(n);
  }

  private nextNoteId(): string {
    const n = this.getMeta('noteCounter') + 1;
    this.setMetaAsync('noteCounter', n);
    return padNoteNum(n);
  }

  private nextSubId(parentId: string): string {
    let max = 0;
    for (const s of this.subs.values()) {
      if (s.parent_id !== parentId) continue;
      const dot = s.id.indexOf('.');
      if (dot < 0) continue;
      const n = Number(s.id.slice(dot + 1));
      if (Number.isFinite(n) && n > max) max = n;
    }
    return `${parentId}.${max + 1}`;
  }

  // Fire-and-forget para escrituras a Supabase. El cache local ya tiene el
  // cambio aplicado; si la red/Supabase falla, lo logueamos a stderr (se ve
  // al salir de la TUI) sin revertir el cache.
  private fire(op: string, p: PromiseLike<{ error: unknown } | null>) {
    Promise.resolve(p)
      .then((r) => {
        const err = r && (r as { error?: unknown }).error;
        if (err) {
          const msg = (err as { message?: string }).message ?? String(err);
          process.stderr.write(`[store] error en ${op}: ${msg}\n`);
        }
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        process.stderr.write(`[store] excepción en ${op}: ${msg}\n`);
      });
  }

  // ── seed ─────────────────────────────────────────────────────────
  private async seed() {
    const now = Date.now();
    const day = 86_400_000;
    const hour = 3_600_000;
    const T = (s: string) => this.norm(s);

    const tasks: TaskRow[] = [
      { id: 'T001', text: T('Preparar release v0.2'), status: 0, created_at: now - 2 * day, completed_at: null, sort_order: 1 },
      { id: 'T002', text: T('Revisar PRs pendientes del equipo'), status: 0, created_at: now - Math.floor(1.5 * day), completed_at: null, sort_order: 2 },
      { id: 'T003', text: T('Comprar café y leche de avena'), status: 0, created_at: now - 8 * hour, completed_at: null, sort_order: 3 },
      { id: 'T004', text: T('Escribir post sobre TUIs en navegador'), status: 1, created_at: now - 4 * day, completed_at: now - 1 * day, sort_order: 4 },
      { id: 'T005', text: T('Backup mensual del disco externo'), status: 1, created_at: now - 10 * day, completed_at: now - 6 * hour, sort_order: 5 },
    ];
    const subs: SubtaskRow[] = [
      { id: 'T001.1', parent_id: 'T001', text: T('Actualizar CHANGELOG'), status: 1, created_at: now - 2 * day, completed_at: now - 1 * day, sort_order: 1 },
      { id: 'T001.2', parent_id: 'T001', text: T('Bump de versión en package.json'), status: 0, created_at: now - 2 * day, completed_at: null, sort_order: 2 },
      { id: 'T001.3', parent_id: 'T001', text: T('Tag y push'), status: 0, created_at: now - 2 * day, completed_at: null, sort_order: 3 },
      { id: 'T003.1', parent_id: 'T003', text: T('Filtros V60 #02'), status: 0, created_at: now - 8 * hour, completed_at: null, sort_order: 1 },
    ];
    const notes: NoteRow[] = [
      {
        id: 'N001',
        title: T('Comandos útiles de tmux'),
        body: 'prefix + | → split vertical\nprefix + - → split horizontal\nprefix + d → detach\nprefix + [ → modo scroll',
        created_at: now - 6 * day,
      },
      {
        id: 'N002',
        title: T('Idea: aplicación de hábitos minimal'),
        body: "Una sola pantalla, sin login, foco en la racha. Quizá inspirada en don't break the chain.\nColores: paleta cálida, tipografía mono.",
        created_at: now - 3 * day,
      },
      {
        id: 'N003',
        title: T('Lectura pendiente'),
        body: '- The Pragmatic Programmer (releer)\n- A Philosophy of Software Design\n- Designing Data-Intensive Applications',
        created_at: now - 1 * day,
      },
    ];

    for (const r of tasks) this.tasks.set(r.id, r);
    for (const r of subs) this.subs.set(r.id, r);
    for (const r of notes) this.notes.set(r.id, r);
    this.meta.set('taskCounter', 5);
    this.meta.set('noteCounter', 3);

    // tasks debe confirmarse antes que subtasks: subtasks.parent_id tiene un
    // FK a tasks(id). notes y meta no dependen de nada, van en paralelo.
    const [rt, rn, rm] = await Promise.all([
      this.sb.from('tasks').insert(tasks),
      this.sb.from('notes').insert(notes),
      this.sb.from('meta').upsert([
        { key: 'taskCounter', value: 5 },
        { key: 'noteCounter', value: 3 },
      ]),
    ]);
    const rs = rt.error ? rt : await this.sb.from('subtasks').insert(subs);
    const errs: string[] = [];
    if (rt.error) errs.push(`tasks: ${rt.error.message}`);
    if (rs.error && !rt.error) errs.push(`subtasks: ${rs.error.message}`);
    if (rn.error) errs.push(`notes: ${rn.error.message}`);
    if (rm.error) errs.push(`meta: ${rm.error.message}`);
    if (errs.length) {
      throw new Error('Error al sembrar datos iniciales:\n  ' + errs.join('\n  '));
    }
  }

  // ── tasks ────────────────────────────────────────────────────────
  private rowToTask(row: TaskRow, subs: Subtask[]): Task {
    return {
      id: row.id,
      text: row.text,
      status: !!row.status,
      createdAt: row.created_at,
      completedAt: row.completed_at,
      subtasks: subs,
    };
  }

  private rowToSub(row: SubtaskRow): Subtask {
    return {
      id: row.id,
      parentId: row.parent_id,
      text: row.text,
      status: !!row.status,
      createdAt: row.created_at,
      completedAt: row.completed_at,
    };
  }

  private subsForTask(taskId: string): Subtask[] {
    const out: SubtaskRow[] = [];
    for (const s of this.subs.values()) {
      if (s.parent_id === taskId) out.push(s);
    }
    out.sort((a, b) => a.sort_order - b.sort_order || a.created_at - b.created_at);
    return out.map((r) => this.rowToSub(r));
  }

  listTasks(opts: { showCompleted?: boolean } = {}): Task[] {
    const rows = Array.from(this.tasks.values());
    const filtered = opts.showCompleted
      ? rows
      : rows.filter((r) => r.status === 0 && !this.hidden.has(r.id));
    filtered.sort((a, b) => a.sort_order - b.sort_order || a.created_at - b.created_at);
    return filtered.map((r) => this.rowToTask(r, this.subsForTask(r.id)));
  }

  findTask(id: string): Task | null {
    const row = this.tasks.get(id);
    return row ? this.rowToTask(row, this.subsForTask(row.id)) : null;
  }

  findSub(id: string): Subtask | null {
    const row = this.subs.get(id);
    return row ? this.rowToSub(row) : null;
  }

  findAny(
    id: string,
  ):
    | { kind: 'task'; task: Task }
    | { kind: 'sub'; task: Task; sub: Subtask }
    | null {
    const t = this.findTask(id);
    if (t) return { kind: 'task', task: t };
    const s = this.findSub(id);
    if (s) {
      const parent = this.findTask(s.parentId);
      if (parent) return { kind: 'sub', task: parent, sub: s };
    }
    return null;
  }

  createTask(text: string): Task {
    const id = this.nextTaskId();
    const now = Date.now();
    let max = 0;
    for (const t of this.tasks.values()) if (t.sort_order > max) max = t.sort_order;
    const row: TaskRow = {
      id,
      text: this.norm(text),
      status: 0,
      created_at: now,
      completed_at: null,
      sort_order: max + 1,
    };
    this.tasks.set(id, row);
    this.fire(`insert task ${id}`, this.sb.from('tasks').insert(row));
    return this.findTask(id)!;
  }

  createSubtask(parentId: string, text: string): Subtask {
    const id = this.nextSubId(parentId);
    const now = Date.now();
    let max = 0;
    for (const s of this.subs.values()) {
      if (s.parent_id === parentId && s.sort_order > max) max = s.sort_order;
    }
    const row: SubtaskRow = {
      id,
      parent_id: parentId,
      text: this.norm(text),
      status: 0,
      created_at: now,
      completed_at: null,
      sort_order: max + 1,
    };
    this.subs.set(id, row);
    this.fire(`insert subtask ${id}`, this.sb.from('subtasks').insert(row));
    return this.findSub(id)!;
  }

  editTaskOrSub(id: string, text: string): boolean {
    const value = this.norm(text);
    const t = this.tasks.get(id);
    if (t) {
      t.text = value;
      this.fire(
        `update task text ${id}`,
        this.sb.from('tasks').update({ text: value }).eq('id', id),
      );
      return true;
    }
    const s = this.subs.get(id);
    if (s) {
      s.text = value;
      this.fire(
        `update subtask text ${id}`,
        this.sb.from('subtasks').update({ text: value }).eq('id', id),
      );
      return true;
    }
    return false;
  }

  deleteTask(id: string): boolean {
    if (!this.tasks.has(id)) return false;
    this.tasks.delete(id);
    // Cascade local (Postgres lo hace solo vía FK on delete cascade).
    for (const sid of Array.from(this.subs.keys())) {
      if (this.subs.get(sid)!.parent_id === id) this.subs.delete(sid);
    }
    this.hidden.delete(id);
    this.fire(`delete task ${id}`, this.sb.from('tasks').delete().eq('id', id));
    return true;
  }

  deleteSub(id: string): boolean {
    if (!this.subs.has(id)) return false;
    this.subs.delete(id);
    this.fire(`delete subtask ${id}`, this.sb.from('subtasks').delete().eq('id', id));
    return true;
  }

  setStatus(id: string, done: boolean): boolean {
    const ts = done ? Date.now() : null;
    const t = this.tasks.get(id);
    if (t) {
      t.status = done ? 1 : 0;
      t.completed_at = ts;
      this.fire(
        `update task status ${id}`,
        this.sb.from('tasks').update({ status: t.status, completed_at: ts }).eq('id', id),
      );
      if (!done && this.hidden.has(id)) {
        this.hidden.delete(id);
        this.fire(
          `delete hidden ${id}`,
          this.sb.from('hidden').delete().eq('task_id', id),
        );
      }
      return true;
    }
    const s = this.subs.get(id);
    if (s) {
      s.status = done ? 1 : 0;
      s.completed_at = ts;
      this.fire(
        `update subtask status ${id}`,
        this.sb.from('subtasks').update({ status: s.status, completed_at: ts }).eq('id', id),
      );
      return true;
    }
    return false;
  }

  isHidden(id: string): boolean {
    return this.hidden.has(id);
  }

  cleanCompleted(): number {
    const toHide: string[] = [];
    for (const t of this.tasks.values()) {
      if (t.status === 1 && !this.hidden.has(t.id)) toHide.push(t.id);
    }
    for (const id of toHide) this.hidden.add(id);
    if (toHide.length > 0) {
      this.fire(
        'upsert hidden batch',
        this.sb.from('hidden').upsert(toHide.map((id) => ({ task_id: id }))),
      );
    }
    return toHide.length;
  }

  listHistory(): Array<{ id: string; text: string; when: number; kind: 'task' | 'sub' }> {
    const out: Array<{ id: string; text: string; when: number; kind: 'task' | 'sub' }> = [];
    for (const t of this.tasks.values()) {
      if (t.status === 1 && t.completed_at != null) {
        out.push({ id: t.id, text: t.text, when: t.completed_at, kind: 'task' });
      }
    }
    for (const s of this.subs.values()) {
      if (s.status === 1 && s.completed_at != null) {
        out.push({ id: s.id, text: s.text, when: s.completed_at, kind: 'sub' });
      }
    }
    out.sort((a, b) => b.when - a.when);
    return out;
  }

  // ── notes ────────────────────────────────────────────────────────
  private rowToNote(row: NoteRow): Note {
    return { id: row.id, title: row.title, body: row.body, createdAt: row.created_at };
  }

  listNotes(): Note[] {
    const rows = Array.from(this.notes.values());
    rows.sort((a, b) => b.created_at - a.created_at);
    return rows.map((r) => this.rowToNote(r));
  }

  findNote(id: string): Note | null {
    const r = this.notes.get(id);
    return r ? this.rowToNote(r) : null;
  }

  createNote(title: string, body: string): Note {
    const id = this.nextNoteId();
    const now = Date.now();
    const row: NoteRow = { id, title: this.norm(title), body, created_at: now };
    this.notes.set(id, row);
    this.fire(`insert note ${id}`, this.sb.from('notes').insert(row));
    return this.findNote(id)!;
  }

  updateNote(id: string, title: string, body: string): boolean {
    const r = this.notes.get(id);
    if (!r) return false;
    r.title = this.norm(title);
    r.body = body;
    this.fire(
      `update note ${id}`,
      this.sb.from('notes').update({ title: r.title, body }).eq('id', id),
    );
    return true;
  }

  deleteNote(id: string): boolean {
    if (!this.notes.has(id)) return false;
    this.notes.delete(id);
    this.fire(`delete note ${id}`, this.sb.from('notes').delete().eq('id', id));
    return true;
  }

  searchNotes(q: string): Note[] {
    const lower = q.toLowerCase();
    const rows = Array.from(this.notes.values()).filter(
      (r) => r.title.toLowerCase().includes(lower) || r.body.toLowerCase().includes(lower),
    );
    rows.sort((a, b) => b.created_at - a.created_at);
    return rows.map((r) => this.rowToNote(r));
  }

  // ── stats ────────────────────────────────────────────────────────
  getStats(): Stats {
    let open = 0;
    for (const t of this.tasks.values()) {
      if (t.status === 0 && !this.hidden.has(t.id)) open++;
    }
    for (const s of this.subs.values()) {
      if (s.status === 0 && !this.hidden.has(s.parent_id)) open++;
    }
    let done = 0;
    for (const t of this.tasks.values()) if (t.status === 1) done++;
    for (const s of this.subs.values()) if (s.status === 1) done++;
    return { open, done, notes: this.notes.size };
  }
}
