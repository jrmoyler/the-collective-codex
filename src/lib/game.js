export const INITIAL_LANES = [
  { id: "Vanguard", player: [], opponent: [] },
  { id: "Conduit", player: [], opponent: [] },
  { id: "Flank", player: [], opponent: [] }
];

export function createMatchState() {
  return {
    turn: 1,
    activePlayer: "player",
    coreIntegrity: { player: 20, opponent: 20 },
    resources: { command: 3, insight: 2, essence: 1 },
    lanes: structuredClone(INITIAL_LANES),
    log: ["Match initialized. Sovereign systems concealed."]
  };
}

export function canAfford(resources, card) {
  return resources.command >= card.command
    && resources.insight >= card.insight
    && resources.essence >= card.essence;
}

export function spend(resources, card) {
  if (!canAfford(resources, card)) return resources;
  return {
    command: resources.command - card.command,
    insight: resources.insight - card.insight,
    essence: resources.essence - card.essence
  };
}

export function playCard(state, card, laneIndex) {
  if (!canAfford(state.resources, card)) {
    return { ...state, log: [`Insufficient resources for ${card.canonicalName}.`, ...state.log] };
  }
  if (laneIndex < 0 || laneIndex >= state.lanes.length) return state;
  const lane = state.lanes[laneIndex];
  if (lane.player.length >= 3) {
    return { ...state, log: [`${lane.id} lane is full.`, ...state.log] };
  }

  const lanes = state.lanes.map((current, index) =>
    index === laneIndex
      ? { ...current, player: [...current.player, { card, health: card.power + 3, exhausted: true }] }
      : current
  );

  return {
    ...state,
    resources: spend(state.resources, card),
    lanes,
    log: [`Played ${card.canonicalName} to ${lane.id}.`, ...state.log]
  };
}

export function endTurn(state) {
  const nextTurn = state.turn + 1;
  const refreshedLanes = state.lanes.map((lane) => ({
    ...lane,
    player: lane.player.map((unit) => ({ ...unit, exhausted: false }))
  }));
  return {
    ...state,
    turn: nextTurn,
    resources: {
      command: Math.min(10, 3 + Math.floor(nextTurn / 2)),
      insight: Math.min(10, 2 + Math.floor(nextTurn / 3)),
      essence: Math.min(10, 1 + Math.floor(nextTurn / 4))
    },
    lanes: refreshedLanes,
    log: [`Turn ${nextTurn} begins.`, ...state.log]
  };
}
