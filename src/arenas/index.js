import { FortArena } from './FortArena.js';
import { CityRooftopArena } from './CityRooftopArena.js';
import { NeonEnergyArena } from './NeonEnergyArena.js';

const ARENA_CLASSES = {
  fort: FortArena,
  rooftop: CityRooftopArena,
  neon: NeonEnergyArena,
};

export function createArena(id, opts) {
  const Cls = ARENA_CLASSES[id] || FortArena;
  return new Cls(opts);
}
