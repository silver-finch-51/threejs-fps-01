// EMBERLINE — hand-in program for make.fun's threejs-fps-01 bounty (Node 22, standard library only).
//
// The game itself is the static site in game/: ES modules the browser loads directly, three.js
// 0.187.0 vendored beside them, no build step and no network. This program is only the courier.
// It copies game/ and screenshots/ from beside this file into the output directory and writes
// dossier.json there with the kit's vendored library, so the dossier is exactly the bytes the
// scorer rebuilds from the same files. Run it twice and the output is identical: the copy is a
// plain file copy and buildDossier is a pure function of the files.
//
// In the grader the output directory is /output; anywhere else MAKEFUN_OUTPUT_DIR names it:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Play the game locally instead with:  node serve.ts   (http://localhost:8080)

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const repoDir = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's caps, passed through so this program refuses anything the scorer would refuse
// rather than hand in an entry that fails its gate: at most 4 screenshots of 256 KiB each, at
// most 993 entries and 48 MiB under game/, and the dossier text capped at 160 KiB.
const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
};

mkdirSync(outDir, { recursive: true });
cpSync(join(repoDir, 'game'), join(outDir, 'game'), { recursive: true });

mkdirSync(join(outDir, 'screenshots'), { recursive: true });
const shotsDir = join(repoDir, 'screenshots');
if (existsSync(shotsDir)) {
  cpSync(shotsDir, join(outDir, 'screenshots'), { recursive: true });
}

writeFileSync(join(outDir, 'dossier.json'), buildDossier(outDir, DOSSIER_CAPS));
