// Shared mutable game state (avoids import cycles)
export const G = {
  scene: null,
  camera: null,
  player: null,
  combatants: [],
  corpses: [],
  teamSize: 1,
  mode: 'classic',
  time: 0,
  storm: null,
  events: { kill: () => {}, playerHurt: () => {}, hitmarker: () => {} },
};
