# tui · notes & tasks

Aplicación de consola para llevar **notas** y **tareas**, basada en el diseño
TUI Notes and Tasks (paleta Nord oscura, JetBrains Mono, comandos slash).

Implementada con [Ink](https://github.com/vadimdemedes/ink) (React para
terminal) + [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) para
persistencia local en SQLite.

## Requisitos

- Node.js ≥ 18 (recomendado 20+)
- pnpm
- Una terminal con soporte de colores 24-bit (la mayoría: iTerm2, Alacritty,
  WezTerm, kitty, Terminal.app reciente, etc.). Para JetBrains Mono, instala la
  fuente y configúrala en tu emulador de terminal.

## Instalación y arranque

```bash
pnpm install
pnpm start
```

La primera vez se crea `data/tui_nt.db` con datos seed (5 tareas y 3 notas).
Para empezar de cero, borra ese archivo.

## Comandos

### General
- `/help` — muestra la ayuda
- `/clear` — limpia el viewport
- `/tasks` / `/notes` — cambia de modo (`Tab` también alterna)
- `/list` — vuelve a renderizar la lista del modo actual
- `/quit` — sale de la app (también `Ctrl+C`)

### Tareas (`T001`, subtareas `T001.1`)
- `/add <texto>`
- `/sub <T001> <texto>`
- `/edit <id> <texto>`
- `/del <id>`
- `/done <id>` / `/undone <id>`
- `/history` — lista de tareas completadas, ordenadas por fecha
- `/clean` — oculta de la lista las tareas completadas (siguen en `/history`)

### Notas (`N001`)
- `/new <título>` — abre el editor de cuerpo (multi-línea)
- `/open <N001>` — muestra el cuerpo completo
- `/edit <N001>` — edita título y cuerpo en el editor
- `/del <N001>`
- `/search <texto>` — busca en título y cuerpo

### Editor de notas
- `Enter` — añade la línea al cuerpo
- `:save` — guarda
- `:cancel` — descarta los cambios

## Atajos de teclado
- `↑` / `↓` — historial de comandos
- `Tab` — alternar modo tareas/notas
- `Ctrl+C` — salir
- Toda la app es **solo teclado**: no hay interacción con el ratón.

## Estructura

```
src/
├── index.tsx       Entry: instancia DB y monta Ink
├── App.tsx         Layout, estado y wiring de eventos
├── components.tsx  Chrome, Header, Prompt, StatusBar
├── lines.tsx       Renderers de cada tipo de línea del buffer
├── commands.tsx    Lógica de los comandos /add, /done, etc.
├── db.ts           Capa SQLite (schema, CRUD, seed)
├── theme.ts        Paleta Nord
├── format.ts       Helpers de fechas
└── types.ts
```

## Notas técnicas

- La base de datos vive en `./data/tui_nt.db` (relativo al `cwd`). Modo WAL.
- Los identificadores de tarea (`TNNN`) y nota (`NNNN`) usan contadores
  monotónicos en la tabla `meta`; los de subtarea siguen el patrón
  `<padre>.<n>` con `n = max(existente) + 1`.
- `/clean` no borra nada: marca tareas completadas como ocultas. `/undone`
  sobre una tarea oculta la vuelve a mostrar.
