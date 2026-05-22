export interface Subtask {
  id: string;
  parentId: string;
  text: string;
  status: boolean;
  createdAt: number;
  completedAt: number | null;
}

export interface Task {
  id: string;
  text: string;
  status: boolean;
  createdAt: number;
  completedAt: number | null;
  subtasks: Subtask[];
}

export interface Note {
  id: string;
  title: string;
  body: string;
  createdAt: number;
}

export type Mode = 'tasks' | 'notes';

export interface Stats {
  open: number;
  done: number;
  notes: number;
}

export type View =
  | { kind: 'list' }
  | { kind: 'help' }
  | { kind: 'history' }
  | { kind: 'search'; query: string };

export type FlashKind = 'ok' | 'err' | 'info' | 'system' | 'dim';

export interface Flash {
  echo: string;
  result: { kind: FlashKind; text: string } | null;
}
