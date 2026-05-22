import React from 'react';
import path from 'node:path';
import { render } from 'ink';
import { App } from './App.js';
import { Db } from './db.js';

const dbPath = path.join(process.cwd(), 'data', 'tui_nt.db');
const db = new Db(dbPath);

const app = render(<App db={db} />, {
  exitOnCtrlC: true,
});

app.waitUntilExit().then(() => {
  process.exit(0);
});
