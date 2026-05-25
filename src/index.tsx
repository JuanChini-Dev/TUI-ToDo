import 'dotenv/config';
import React from 'react';
import { render } from 'ink';
import { App } from './App.js';
import { Store } from './store.js';
import { createSupabaseClient } from './supabase.js';

async function main() {
  let store: Store;
  try {
    const sb = createSupabaseClient();
    store = new Store(sb);
    await store.ready();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(`\n[tui-notes-tasks] no se pudo iniciar: ${msg}\n\n`);
    process.exit(1);
  }

  const app = render(<App db={store} />, { exitOnCtrlC: true });
  await app.waitUntilExit();
  process.exit(0);
}

main();
