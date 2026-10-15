import { Sambhu } from './Sambhu.js';
import { Simba } from './Simba.js';
import { Maddy } from './Maddy.js';
import { Ghost } from './Ghost.js';
import { Blackout } from './Blackout.js';

// Character registry. To add a fighter, create a definition module shaped like
// Sambhu.js / Simba.js (stats, poses, moves, commands, model builder) and add it
// here — menus, character select, AI and HUD all read from this list.
export const CHARACTERS = [Sambhu, Simba, Maddy, Ghost, Blackout];

export const CHARACTER_MAP = Object.fromEntries(CHARACTERS.map((c) => [c.id, c]));

export function getCharacter(id) {
  return CHARACTER_MAP[id] || CHARACTERS[0];
}

// Arena registry (modules are imported by the Game; this is just display data).
export const ARENAS = [
  { id: 'fort', name: 'Fort Courtyard', blurb: 'Sandstone walls, sunset sky and the old fort gate.' },
  { id: 'rooftop', name: 'Indian City Rooftop', blurb: 'Water tanks, neon signs and the city at night.' },
  { id: 'neon', name: 'Neon Energy Arena', blurb: 'The Inverted Energy core — pure charged light.' },
];
