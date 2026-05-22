// Paleta Nord-inspirada (idéntica a la del prototipo HTML).
export const theme = {
  bg0: '#1f242e',
  bg1: '#252b36',
  bg2: '#2c333f',
  bg3: '#353d4b',
  line: '#3b4252',
  fgDim: '#6b7280',
  fgMute: '#8a93a3',
  fg: '#d8dee9',
  fgBright: '#eceff4',
  accent: '#88c0d0',   // frost cyan — prompt, modo tasks
  accent2: '#81a1c1',  // frost blue — ids
  accent3: '#b48ead',  // aurora purple — modo notes
  ok: '#a3be8c',
  warn: '#ebcb8b',
  err: '#bf616a',
  info: '#d08770',
} as const;

export type Theme = typeof theme;
