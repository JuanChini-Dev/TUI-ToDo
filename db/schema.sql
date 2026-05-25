-- tui-notes-tasks · esquema Supabase
-- Ejecutar una sola vez en el SQL editor del proyecto.

create table if not exists meta (
  key   text primary key,
  value bigint not null
);

create table if not exists tasks (
  id           text primary key,
  text         text not null,
  status       smallint not null default 0,
  created_at   bigint not null,
  completed_at bigint,
  sort_order   integer not null default 0
);

create table if not exists subtasks (
  id           text primary key,
  parent_id    text not null references tasks(id) on delete cascade,
  text         text not null,
  status       smallint not null default 0,
  created_at   bigint not null,
  completed_at bigint,
  sort_order   integer not null default 0
);

create table if not exists notes (
  id         text primary key,
  title      text not null,
  body       text not null default '',
  created_at bigint not null
);

create table if not exists hidden (
  task_id text primary key references tasks(id) on delete cascade
);

create index if not exists idx_subtasks_parent on subtasks(parent_id);

-- Aplicación de usuario único: deshabilitamos RLS.
-- (Alternativa: enable + policy "using (true) with check (true)".)
alter table meta     disable row level security;
alter table tasks    disable row level security;
alter table subtasks disable row level security;
alter table notes    disable row level security;
alter table hidden   disable row level security;
