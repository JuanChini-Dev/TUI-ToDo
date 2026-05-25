# tui · notes & tasks

Aplicación de consola para llevar **notas** y **tareas**, basada en el diseño
TUI Notes and Tasks (paleta Nord oscura, JetBrains Mono, comandos slash).

Implementada con [Ink](https://github.com/vadimdemedes/ink) (React para
terminal) + [Supabase](https://supabase.com) (Postgres gestionado) como
backend de persistencia.

## Requisitos

- Node.js ≥ 18 (recomendado 20+)
- pnpm
- Un proyecto de Supabase (gratuito) con su `SUPABASE_URL` y `SUPABASE_ANON_KEY`.
- Una terminal con soporte de colores 24-bit (la mayoría: iTerm2, Alacritty,
  WezTerm, kitty, Terminal.app reciente, etc.). Para JetBrains Mono, instala la
  fuente y configúrala en tu emulador de terminal.
- Conexión a internet: la app requiere acceso a Supabase para arrancar y para
  cada escritura.

## Configuración

1. Creá un proyecto en Supabase (si no lo hiciste).
2. Abrí el **SQL editor** y ejecutá una sola vez el contenido de
   [`db/schema.sql`](./db/schema.sql). Esto crea las tablas (`meta`, `tasks`,
   `subtasks`, `notes`, `hidden`) y deshabilita RLS (uso personal).
3. Copiá las credenciales del proyecto (Settings → API) y creá un `.env` en la
   raíz a partir de `.env.example`:

   ```bash
   cp .env.example .env
   # editar .env con SUPABASE_URL y SUPABASE_ANON_KEY
   ```

## Instalación y arranque

```bash
pnpm install
pnpm start
```

La primera vez que la app arranca contra un Supabase vacío, escribe datos seed
(5 tareas y 3 notas). Para empezar de cero, borrá las filas de las tablas en el
dashboard de Supabase.

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
├── index.tsx       Entry: instancia Store, hidrata desde Supabase, monta Ink
├── App.tsx         Layout, estado y wiring de eventos
├── components.tsx  Chrome, Header, Prompt, StatusBar
├── lines.tsx       Renderers de cada tipo de línea del buffer
├── commands.tsx    Lógica de los comandos /add, /done, etc.
├── store.ts        Cache en memoria con API síncrona; persiste en Supabase
├── supabase.ts     Cliente de @supabase/supabase-js
├── theme.ts        Paleta Nord
├── format.ts       Helpers de fechas
└── types.ts
db/
└── schema.sql      DDL para ejecutar una vez en Supabase
```

## Notas técnicas

- El `Store` hidrata todas las tablas desde Supabase al arranque y mantiene
  un cache en memoria. Las lecturas son síncronas (cache); las escrituras
  actualizan el cache de forma optimista y se envían a Supabase en background.
  Si una escritura falla, queda logueada en `stderr`.
- Los identificadores de tarea (`TNNN`) y nota (`NNNN`) usan contadores
  monotónicos en la tabla `meta`; los de subtarea siguen el patrón
  `<padre>.<n>` con `n = max(existente) + 1`.
- `/clean` no borra nada: marca tareas completadas como ocultas. `/undone`
  sobre una tarea oculta la vuelve a mostrar.
