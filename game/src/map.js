// map.js — the Foundry Yard: an original desert-industrial yard, two bomb sites, three lanes.
// This file is data plus the graph built from it. world.js turns SOLIDS into meshes; physics.js
// collides against them; bots.js walks the waypoint graph. One definition feeds all three, so
// what you see is exactly what you collide with and what the bots path through.
//
// Coordinates: metres, x east, z south, ground at y = 0. Ember attacks from the south spawn,
// Ward defends the two northern sites. Every solid is an axis-aligned box standing on the
// ground: { x, z, w, d, h, kind } — centre, footprint, height, and a material kind.

export const SOLIDS = [
  // Perimeter walls.
  { x: 0, z: -38.5, w: 79, d: 1, h: 6, kind: 'wall' },
  { x: 0, z: 38.5, w: 79, d: 1, h: 6, kind: 'wall' },
  { x: -38.5, z: 0, w: 1, d: 79, h: 6, kind: 'wall' },
  { x: 38.5, z: 0, w: 1, d: 79, h: 6, kind: 'wall' },

  // South (Ember) yard: containers on the flanks, low barriers with a centre gap.
  { x: -14, z: 28, w: 7, d: 2.6, h: 2.6, kind: 'container' },
  { x: 14, z: 28, w: 7, d: 2.6, h: 2.6, kind: 'container' },
  { x: -3, z: 21, w: 4, d: 0.8, h: 1.0, kind: 'barrier' },
  { x: 3, z: 21, w: 4, d: 0.8, h: 1.0, kind: 'barrier' },
  { x: -20, z: 22, w: 2.4, d: 2.4, h: 1.2, kind: 'crate' },
  { x: 20, z: 22, w: 2.4, d: 2.4, h: 2.4, kind: 'crate' },

  // West and east lanes: long walls with a mid doorway on the inner side.
  { x: -15.5, z: 6, w: 1, d: 26, h: 4.5, kind: 'wall' },
  { x: 15.5, z: 6, w: 1, d: 26, h: 4.5, kind: 'wall' },
  { x: -6.5, z: 16, w: 1, d: 6, h: 4.5, kind: 'wall' },
  { x: -6.5, z: -2, w: 1, d: 4, h: 4.5, kind: 'wall' },
  { x: 6.5, z: 16, w: 1, d: 6, h: 4.5, kind: 'wall' },
  { x: 6.5, z: -2, w: 1, d: 4, h: 4.5, kind: 'wall' },
  // Lane head walls, each with a doorway gap over the lane node.
  { x: -14.5, z: -7, w: 3, d: 1, h: 4.5, kind: 'wall' },
  { x: -8, z: -7, w: 4, d: 1, h: 4.5, kind: 'wall' },
  { x: 14.5, z: -7, w: 3, d: 1, h: 4.5, kind: 'wall' },
  { x: 8, z: -7, w: 4, d: 1, h: 4.5, kind: 'wall' },
  // Crates inside the lanes, tucked against the walls so the lane line (x = ±11) stays
  // walkable: cover you fight around, not cover that blocks the route.
  { x: -13.4, z: 11, w: 2.4, d: 2.4, h: 1.2, kind: 'crate' },
  { x: 13.4, z: 0, w: 2.4, d: 2.4, h: 2.4, kind: 'crate' },
  { x: -13.4, z: -3, w: 2.4, d: 2.4, h: 1.2, kind: 'crate' },
  { x: 13.4, z: 12, w: 2.4, d: 2.4, h: 1.2, kind: 'crate' },

  // Mid: two blocks leave a narrow centre door; a crate stack watches it from the side.
  { x: -3.4, z: -2, w: 2.8, d: 8, h: 3, kind: 'wall' },
  { x: 3.4, z: -2, w: 2.8, d: 8, h: 3, kind: 'wall' },
  { x: 3.2, z: 10, w: 2.4, d: 2.4, h: 2.4, kind: 'crate' },

  // North yard walls and the nexus block between the sites.
  { x: -11, z: -14, w: 6, d: 1, h: 4, kind: 'wall' },
  { x: 11, z: -14, w: 6, d: 1, h: 4, kind: 'wall' },
  { x: 0, z: -24, w: 6, d: 4, h: 3.6, kind: 'wall' },
  { x: -7.5, z: -27, w: 2.4, d: 2.4, h: 1.2, kind: 'crate' },
  { x: 7.5, z: -27, w: 2.4, d: 2.4, h: 1.2, kind: 'crate' },
  { x: 0, z: -29, w: 2.4, d: 2.4, h: 1.2, kind: 'crate' },

  // Site dividers (east edge of A, west edge of B), set back so the yard entries stay open.
  { x: -14, z: -28, w: 1, d: 10, h: 4.5, kind: 'wall' },
  { x: 14, z: -28, w: 1, d: 10, h: 4.5, kind: 'wall' },

  // Site A — the Foundry: furnace blocks, a back wall, crate cover. The main furnace
  // stands at the site's north edge so the plant circle around (-24, -24) stays open.
  { x: -25, z: -29.5, w: 9, d: 7, h: 3.4, kind: 'furnace' },
  { x: -18.5, z: -31, w: 4, d: 3.5, h: 2.4, kind: 'furnace' },
  { x: -24, z: -34.5, w: 14, d: 1, h: 4, kind: 'wall' },
  { x: -33, z: -19, w: 2.4, d: 2.4, h: 1.2, kind: 'crate' },
  { x: -33.5, z: -15, w: 2.4, d: 2.4, h: 2.4, kind: 'crate' },
  { x: -23, z: -14, w: 2.4, d: 2.4, h: 1.2, kind: 'crate' },

  // Site B — the Depot: two containers crossed, crate cover, a back wall.
  { x: 25, z: -28, w: 10, d: 3, h: 2.6, kind: 'container' },
  { x: 20, z: -21.5, w: 3, d: 8, h: 2.6, kind: 'container' },
  { x: 24, z: -34.5, w: 14, d: 1, h: 4, kind: 'wall' },
  { x: 33, z: -18, w: 2.4, d: 2.4, h: 1.2, kind: 'crate' },
  { x: 17.5, z: -30, w: 2.4, d: 2.4, h: 2.4, kind: 'crate' },
  { x: 31, z: -31, w: 2.4, d: 2.4, h: 1.2, kind: 'crate' },
];

export const SITES = {
  A: { id: 'A', name: 'Foundry', x: -24, z: -24, r: 6 },
  B: { id: 'B', name: 'Depot', x: 24, z: -24, r: 6 },
};

export const SPAWNS = {
  ember: [
    { x: -4, z: 34 }, { x: -2, z: 35 }, { x: 0, z: 34 }, { x: 2, z: 35 }, { x: 4, z: 34 },
  ],
  ward: [
    { x: -4, z: -34 }, { x: -2, z: -35 }, { x: 0, z: -34 }, { x: 2, z: -35 }, { x: 4, z: -34 },
  ],
};

// Waypoint graph. tags: spawn / lane / mid / siteA / siteB / holdA / holdB — the bot planner
// picks routes and holding spots by tag. Hold nodes are positions with cover near a site.
export const NODES = {
  e_spawn: { x: 0, z: 33.5, tags: ['spawn'] },
  e_yard_w: { x: -10, z: 24, tags: [] },
  e_yard_e: { x: 10, z: 24, tags: [] },
  a_link_s: { x: -11, z: 15, tags: ['lane'] },
  b_link_s: { x: 11, z: 15, tags: ['lane'] },
  mid_s: { x: 0, z: 14, tags: ['mid'] },
  a_link: { x: -11, z: 5, tags: ['lane'] },
  b_link: { x: 11, z: 5, tags: ['lane'] },
  mid: { x: 0, z: 3, tags: ['mid'] },
  a_link_n: { x: -11, z: -9, tags: ['lane'] },
  b_link_n: { x: 11, z: -9, tags: ['lane'] },
  mid_n: { x: 0, z: -9, tags: ['mid'] },
  a_conn: { x: -19, z: -13, tags: [] },
  b_conn: { x: 19, z: -13, tags: [] },
  w_yard_w: { x: -8, z: -20, tags: [] },
  w_yard_e: { x: 8, z: -20, tags: [] },
  a_entry: { x: -17, z: -17, tags: ['siteA'] },
  b_entry: { x: 17, z: -17, tags: ['siteB'] },
  a_west: { x: -30, z: -21, tags: ['siteA'] },
  b_east: { x: 30, z: -13, tags: ['siteB'] },
  a_hold1: { x: -31, z: -28, tags: ['holdA'] },
  a_hold2: { x: -17, z: -21, tags: ['holdA'] },
  a_hold3: { x: -28, z: -15, tags: ['holdA'] },
  b_hold1: { x: 31, z: -28, tags: ['holdB'] },
  b_hold2: { x: 17, z: -24, tags: ['holdB'] },
  b_hold3: { x: 28, z: -15, tags: ['holdB'] },
  w_spawn: { x: 0, z: -33.5, tags: ['spawn'] },
};

export const EDGES = [
  ['e_spawn', 'e_yard_w'], ['e_spawn', 'e_yard_e'], ['e_spawn', 'mid_s'],
  ['e_yard_w', 'a_link_s'], ['e_yard_e', 'b_link_s'],
  ['a_link_s', 'a_link'], ['b_link_s', 'b_link'],
  ['mid_s', 'mid'], ['a_link', 'mid'], ['b_link', 'mid'],
  ['a_link', 'a_link_n'], ['b_link', 'b_link_n'],
  ['mid', 'mid_n'], ['a_link_n', 'mid_n'], ['b_link_n', 'mid_n'],
  ['a_link_n', 'a_conn'], ['b_link_n', 'b_conn'],
  ['mid_n', 'a_conn'], ['mid_n', 'b_conn'],
  ['mid_n', 'w_yard_w'], ['mid_n', 'w_yard_e'],
  ['a_conn', 'a_entry'], ['b_conn', 'b_entry'],
  ['a_conn', 'w_yard_w'], ['b_conn', 'w_yard_e'],
  ['w_yard_w', 'w_yard_e'], ['w_yard_w', 'w_spawn'], ['w_yard_e', 'w_spawn'],
  ['w_yard_w', 'a_west'], ['w_yard_e', 'b_east'],
  ['a_entry', 'a_west'], ['b_entry', 'b_east'],
  ['a_entry', 'a_hold2'], ['b_entry', 'b_hold2'],
  ['a_west', 'a_hold1'], ['b_east', 'b_hold1'],
  ['a_west', 'a_hold3'], ['b_east', 'b_hold3'],
  ['a_entry', 'a_hold3'], ['b_entry', 'b_hold3'],
];

// Adjacency built once from EDGES: id -> array of neighbour ids.
export const ADJACENCY = (() => {
  const adj = {};
  for (const id of Object.keys(NODES)) adj[id] = [];
  for (const [a, b] of EDGES) {
    adj[a].push(b);
    adj[b].push(a);
  }
  return adj;
})();

export function nearestNode(x, z) {
  let best = null;
  let bestD = Infinity;
  for (const [id, n] of Object.entries(NODES)) {
    const d = (n.x - x) * (n.x - x) + (n.z - z) * (n.z - z);
    if (d < bestD) {
      bestD = d;
      best = id;
    }
  }
  return best;
}

export function nodesWithTag(tag) {
  return Object.entries(NODES)
    .filter(([, n]) => n.tags.includes(tag))
    .map(([id]) => id);
}

// Breadth-first path between two node ids, as a list of ids including both ends.
export function findPath(fromId, toId) {
  if (fromId === toId) return [fromId];
  const prev = { [fromId]: null };
  const queue = [fromId];
  while (queue.length > 0) {
    const cur = queue.shift();
    for (const next of ADJACENCY[cur]) {
      if (prev[next] !== undefined) continue;
      prev[next] = cur;
      if (next === toId) {
        const path = [toId];
        let p = cur;
        while (p !== null) {
          path.unshift(p);
          p = prev[p];
        }
        return path;
      }
      queue.push(next);
    }
  }
  return [fromId];
}

export function siteAt(x, z) {
  for (const site of Object.values(SITES)) {
    const dx = x - site.x;
    const dz = z - site.z;
    if (dx * dx + dz * dz <= site.r * site.r) return site;
  }
  return null;
}
