import Database from 'better-sqlite3';
import path from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import type { Note, Stats, Subtask, Task } from './types.js';

const padTaskNum = (n: number) => 'T' + String(n).padStart(3, '0');
const padNoteNum = (n: number) => 'N' + String(n).padStart(3, '0');

export class Db {
  private db: Database.Database;

  constructor(dbPath: string) {
    const dir = path.dirname(dbPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.migrate();
    if (this.isEmpty()) this.seed();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        key   TEXT PRIMARY KEY,
        value INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tasks (
        id           TEXT PRIMARY KEY,
        text         TEXT NOT NULL,
        status       INTEGER NOT NULL DEFAULT 0,
        created_at   INTEGER NOT NULL,
        completed_at INTEGER,
        sort_order   INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS subtasks (
        id           TEXT PRIMARY KEY,
        parent_id    TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        text         TEXT NOT NULL,
        status       INTEGER NOT NULL DEFAULT 0,
        created_at   INTEGER NOT NULL,
        completed_at INTEGER,
        sort_order   INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS notes (
        id         TEXT PRIMARY KEY,
        title      TEXT NOT NULL,
        body       TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS hidden (
        task_id TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_subtasks_parent ON subtasks(parent_id);
    `);

    if (this.getMeta('uppercaseMigrated') === 0) {
      this.db.transaction(() => {
        const tasks = this.db
          .prepare('SELECT id, text FROM tasks')
          .all() as Array<{ id: string; text: string }>;
        const upT = this.db.prepare('UPDATE tasks SET text = ? WHERE id = ?');
        for (const r of tasks) upT.run(this.norm(r.text), r.id);

        const subs = this.db
          .prepare('SELECT id, text FROM subtasks')
          .all() as Array<{ id: string; text: string }>;
        const upS = this.db.prepare('UPDATE subtasks SET text = ? WHERE id = ?');
        for (const r of subs) upS.run(this.norm(r.text), r.id);

        const notes = this.db
          .prepare('SELECT id, title FROM notes')
          .all() as Array<{ id: string; title: string }>;
        const upN = this.db.prepare('UPDATE notes SET title = ? WHERE id = ?');
        for (const r of notes) upN.run(this.norm(r.title), r.id);

        this.setMeta('uppercaseMigrated', 1);
      })();
    }
  }

  /** Normaliza un valor de texto antes de persistirlo (mayúsculas Unicode). */
  private norm(s: string): string {
    return s.toUpperCase();
  }

  private isEmpty(): boolean {
    const t = this.db.prepare('SELECT COUNT(*) AS c FROM tasks').get() as { c: number };
    const n = this.db.prepare('SELECT COUNT(*) AS c FROM notes').get() as { c: number };
    return t.c === 0 && n.c === 0;
  }

  // ─── meta / counters ─────────────────────────────────────────────
  private getMeta(key: string): number {
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as
      | { value: number }
      | undefined;
    return row ? row.value : 0;
  }

  private setMeta(key: string, value: number) {
    this.db
      .prepare(
        'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      )
      .run(key, value);
  }

  private nextTaskId(): string {
    const n = this.getMeta('taskCounter') + 1;
    this.setMeta('taskCounter', n);
    return padTaskNum(n);
  }

  private nextNoteId(): string {
    const n = this.getMeta('noteCounter') + 1;
    this.setMeta('noteCounter', n);
    return padNoteNum(n);
  }

  private nextSubId(parentId: string): string {
    const row = this.db
      .prepare(
        `SELECT COALESCE(MAX(CAST(SUBSTR(id, INSTR(id,'.') + 1) AS INTEGER)), 0) AS m
         FROM subtasks WHERE parent_id = ?`,
      )
      .get(parentId) as { m: number };
    return `${parentId}.${row.m + 1}`;
  }

  // ─── seed data ────────────────────────────────────────────────────
  private seed() {
    const now = Date.now();
    const day = 86_400_000;
    const hour = 3_600_000;

    const insertTask = this.db.prepare(
      'INSERT INTO tasks (id, text, status, created_at, completed_at, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
    );
    const insertSub = this.db.prepare(
      'INSERT INTO subtasks (id, parent_id, text, status, created_at, completed_at, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    const insertNote = this.db.prepare(
      'INSERT INTO notes (id, title, body, created_at) VALUES (?, ?, ?, ?)',
    );

    const T = (s: string) => this.norm(s);

    this.db.transaction(() => {
      // tasks
      insertTask.run('T001', T('Preparar release v0.2'), 0, now - 2 * day, null, 1);
      insertSub.run('T001.1', 'T001', T('Actualizar CHANGELOG'), 1, now - 2 * day, now - 1 * day, 1);
      insertSub.run('T001.2', 'T001', T('Bump de versión en package.json'), 0, now - 2 * day, null, 2);
      insertSub.run('T001.3', 'T001', T('Tag y push'), 0, now - 2 * day, null, 3);

      insertTask.run('T002', T('Revisar PRs pendientes del equipo'), 0, now - Math.floor(1.5 * day), null, 2);

      insertTask.run('T003', T('Comprar café y leche de avena'), 0, now - 8 * hour, null, 3);
      insertSub.run('T003.1', 'T003', T('Filtros V60 #02'), 0, now - 8 * hour, null, 1);

      insertTask.run('T004', T('Escribir post sobre TUIs en navegador'), 1, now - 4 * day, now - 1 * day, 4);
      insertTask.run('T005', T('Backup mensual del disco externo'), 1, now - 10 * day, now - 6 * hour, 5);

      this.setMeta('taskCounter', 5);

      // notes
      insertNote.run(
        'N001',
        T('Comandos útiles de tmux'),
        'prefix + | → split vertical\nprefix + - → split horizontal\nprefix + d → detach\nprefix + [ → modo scroll',
        now - 6 * day,
      );
      insertNote.run(
        'N002',
        T('Idea: aplicación de hábitos minimal'),
        "Una sola pantalla, sin login, foco en la racha. Quizá inspirada en don't break the chain.\nColores: paleta cálida, tipografía mono.",
        now - 3 * day,
      );
      insertNote.run(
        'N003',
        T('Lectura pendiente'),
        '- The Pragmatic Programmer (releer)\n- A Philosophy of Software Design\n- Designing Data-Intensive Applications',
        now - 1 * day,
      );

      this.setMeta('noteCounter', 3);
    })();
  }

  // ─── tasks ───────────────────────────────────────────────────────
  private rowToTask(row: any, subs: Subtask[]): Task {
    return {
      id: row.id,
      text: row.text,
      status: !!row.status,
      createdAt: row.created_at,
      completedAt: row.completed_at,
      subtasks: subs,
    };
  }

  private rowToSub(row: any): Subtask {
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
    const rows = this.db
      .prepare('SELECT * FROM subtasks WHERE parent_id = ? ORDER BY sort_order, created_at')
      .all(taskId) as any[];
    return rows.map((r) => this.rowToSub(r));
  }

  listTasks(opts: { showCompleted?: boolean } = {}): Task[] {
    const sql = opts.showCompleted
      ? `SELECT t.* FROM tasks t ORDER BY t.sort_order, t.created_at`
      : `SELECT t.* FROM tasks t
         WHERE t.status = 0
           AND t.id NOT IN (SELECT task_id FROM hidden)
         ORDER BY t.sort_order, t.created_at`;
    const rows = this.db.prepare(sql).all() as any[];
    return rows.map((r) => this.rowToTask(r, this.subsForTask(r.id)));
  }

  findTask(id: string): Task | null {
    const row = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as any;
    return row ? this.rowToTask(row, this.subsForTask(row.id)) : null;
  }

  findSub(id: string): Subtask | null {
    const row = this.db.prepare('SELECT * FROM subtasks WHERE id = ?').get(id) as any;
    return row ? this.rowToSub(row) : null;
  }

  /** Devuelve una tarea, una subtarea, o null. */
  findAny(id: string):
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
    const order = (this.db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM tasks').get() as {
      m: number;
    }).m + 1;
    this.db
      .prepare(
        'INSERT INTO tasks (id, text, status, created_at, completed_at, sort_order) VALUES (?, ?, 0, ?, NULL, ?)',
      )
      .run(id, this.norm(text), now, order);
    return this.findTask(id)!;
  }

  createSubtask(parentId: string, text: string): Subtask {
    const id = this.nextSubId(parentId);
    const now = Date.now();
    const order = (this.db
      .prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM subtasks WHERE parent_id = ?')
      .get(parentId) as { m: number }).m + 1;
    this.db
      .prepare(
        'INSERT INTO subtasks (id, parent_id, text, status, created_at, completed_at, sort_order) VALUES (?, ?, ?, 0, ?, NULL, ?)',
      )
      .run(id, parentId, this.norm(text), now, order);
    return this.findSub(id)!;
  }

  editTaskOrSub(id: string, text: string): boolean {
    const value = this.norm(text);
    const t = this.db.prepare('UPDATE tasks SET text = ? WHERE id = ?').run(value, id);
    if (t.changes > 0) return true;
    const s = this.db.prepare('UPDATE subtasks SET text = ? WHERE id = ?').run(value, id);
    return s.changes > 0;
  }

  deleteTask(id: string): boolean {
    // FK ON DELETE CASCADE limpia subtareas y entrada en hidden
    const r = this.db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    return r.changes > 0;
  }

  deleteSub(id: string): boolean {
    const r = this.db.prepare('DELETE FROM subtasks WHERE id = ?').run(id);
    return r.changes > 0;
  }

  setStatus(id: string, done: boolean): boolean {
    const ts = done ? Date.now() : null;
    const t = this.db
      .prepare('UPDATE tasks SET status = ?, completed_at = ? WHERE id = ?')
      .run(done ? 1 : 0, ts, id);
    if (t.changes > 0) {
      if (!done) this.db.prepare('DELETE FROM hidden WHERE task_id = ?').run(id);
      return true;
    }
    const s = this.db
      .prepare('UPDATE subtasks SET status = ?, completed_at = ? WHERE id = ?')
      .run(done ? 1 : 0, ts, id);
    return s.changes > 0;
  }

  isHidden(id: string): boolean {
    const r = this.db.prepare('SELECT 1 FROM hidden WHERE task_id = ?').get(id);
    return !!r;
  }

  /** Oculta tareas completadas que aún no estén ocultas. Devuelve cuántas se ocultaron. */
  cleanCompleted(): number {
    const r = this.db
      .prepare(
        `INSERT OR IGNORE INTO hidden (task_id)
         SELECT id FROM tasks WHERE status = 1`,
      )
      .run();
    return r.changes;
  }

  /** Historial: tareas y subtareas completadas, ordenadas desc por completedAt. */
  listHistory(): Array<{ id: string; text: string; when: number; kind: 'task' | 'sub' }> {
    const tasks = this.db
      .prepare(
        `SELECT id, text, completed_at AS when_ts FROM tasks
         WHERE status = 1 AND completed_at IS NOT NULL`,
      )
      .all() as Array<{ id: string; text: string; when_ts: number }>;
    const subs = this.db
      .prepare(
        `SELECT id, text, completed_at AS when_ts FROM subtasks
         WHERE status = 1 AND completed_at IS NOT NULL`,
      )
      .all() as Array<{ id: string; text: string; when_ts: number }>;
    return [
      ...tasks.map((r) => ({ id: r.id, text: r.text, when: r.when_ts, kind: 'task' as const })),
      ...subs.map((r) => ({ id: r.id, text: r.text, when: r.when_ts, kind: 'sub' as const })),
    ].sort((a, b) => b.when - a.when);
  }

  // ─── notes ───────────────────────────────────────────────────────
  private rowToNote(row: any): Note {
    return { id: row.id, title: row.title, body: row.body, createdAt: row.created_at };
  }

  listNotes(): Note[] {
    const rows = this.db
      .prepare('SELECT * FROM notes ORDER BY created_at DESC')
      .all() as any[];
    return rows.map((r) => this.rowToNote(r));
  }

  findNote(id: string): Note | null {
    const row = this.db.prepare('SELECT * FROM notes WHERE id = ?').get(id) as any;
    return row ? this.rowToNote(row) : null;
  }

  createNote(title: string, body: string): Note {
    const id = this.nextNoteId();
    const now = Date.now();
    this.db
      .prepare('INSERT INTO notes (id, title, body, created_at) VALUES (?, ?, ?, ?)')
      .run(id, this.norm(title), body, now);
    return this.findNote(id)!;
  }

  updateNote(id: string, title: string, body: string): boolean {
    const r = this.db
      .prepare('UPDATE notes SET title = ?, body = ? WHERE id = ?')
      .run(this.norm(title), body, id);
    return r.changes > 0;
  }

  deleteNote(id: string): boolean {
    const r = this.db.prepare('DELETE FROM notes WHERE id = ?').run(id);
    return r.changes > 0;
  }

  searchNotes(q: string): Note[] {
    const like = `%${q.toLowerCase()}%`;
    const rows = this.db
      .prepare(
        `SELECT * FROM notes
         WHERE LOWER(title) LIKE ? OR LOWER(body) LIKE ?
         ORDER BY created_at DESC`,
      )
      .all(like, like) as any[];
    return rows.map((r) => this.rowToNote(r));
  }

  // ─── stats ───────────────────────────────────────────────────────
  getStats(): Stats {
    const open = this.db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM tasks WHERE status = 0
              AND id NOT IN (SELECT task_id FROM hidden))
         + (SELECT COUNT(*) FROM subtasks s
              WHERE s.status = 0
                AND s.parent_id NOT IN (SELECT task_id FROM hidden))
         AS c`,
      )
      .get() as { c: number };
    const done = this.db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM tasks WHERE status = 1)
         + (SELECT COUNT(*) FROM subtasks WHERE status = 1)
         AS c`,
      )
      .get() as { c: number };
    const notes = this.db.prepare('SELECT COUNT(*) AS c FROM notes').get() as { c: number };
    return { open: open.c, done: done.c, notes: notes.c };
  }
}
