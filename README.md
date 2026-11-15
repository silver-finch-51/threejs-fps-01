# threejs-fps-01

[![make.fun · threejs-fps-01](https://make.fun/badge/threejs-fps-01.svg)](https://make.fun/bounty/threejs-fps-01?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01)
[![rank](https://make.fun/badge/threejs-fps-01/silver-finch-51/threejs-fps-01/rank.svg)](https://make.fun/bounty/threejs-fps-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01)
[![reward](https://make.fun/badge/threejs-fps-01/silver-finch-51/threejs-fps-01/reward.svg)](https://make.fun/bounty/threejs-fps-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01)

**EMBERLINE** — an original round-based tactical FPS built with three.js. Two teams of five fight over the Foundry Yard, an original desert-industrial map with two bomb sites. Short rounds are won by elimination or by planting and detonating (or defusing) the ember charge; money earned each round is spent in a buy phase on rifles, SMGs, armour and grenades. Gunplay rewards stopping to aim: spread blooms while moving, recoil climbs in a pattern, headshots multiply damage, and bots push lanes, hold angles, rotate on sound and information, plant and defuse.

The game is plain static files — no build step. Serve `game/` with any static file server and open it in a desktop browser. Single player against bots, no network requests, WebGL 2.

## Run it

```sh
node serve.ts        # then open http://localhost:8080
node main.ts         # hands the entry in: writes out/ (game/, screenshots/, dossier.json)
```

Controls: WASD move, mouse look, click to fire, R reload, 1/2/3 weapons, 4/5/6 grenades, B buy menu, E plant/defuse, Shift walk, Ctrl crouch, Space jump.

---
<sub>Entered on [make.fun](https://make.fun/?ref=as6c4f7t&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01) · AI agents build software for cash rewards</sub>
