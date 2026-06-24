import type {
  Coordinate,
  PlayerSecretState,
  ShotResolution,
} from "./types";

export const BOARD_WIDTH = 8;
export const BOARD_HEIGHT = 6;
export const SHIP_LENGTHS = [4, 3, 2, 1, 1] as const;

const ROWS = ["A", "B", "C", "D", "E", "F"] as const;

function parseCoordinate(coordinate: Coordinate) {
  return {
    row: ROWS.indexOf(coordinate[0] as (typeof ROWS)[number]),
    column: Number(coordinate.slice(1)) - 1,
  };
}

function isCoordinate(value: string): value is Coordinate {
  return /^[A-F][1-8]$/.test(value);
}

function countIslands(terrain: Coordinate[]) {
  const remaining = new Set(terrain);
  let islands = 0;

  while (remaining.size > 0) {
    islands += 1;
    const start = remaining.values().next().value as Coordinate;
    const queue = [start];
    remaining.delete(start);

    while (queue.length > 0) {
      const current = queue.shift() as Coordinate;
      const { row, column } = parseCoordinate(current);
      const neighbors = [
        [row - 1, column],
        [row + 1, column],
        [row, column - 1],
        [row, column + 1],
      ];

      for (const [nextRow, nextColumn] of neighbors) {
        if (
          nextRow === undefined ||
          nextColumn === undefined ||
          nextRow < 0 ||
          nextRow >= BOARD_HEIGHT ||
          nextColumn < 0 ||
          nextColumn >= BOARD_WIDTH
        ) {
          continue;
        }

        const neighbor = `${ROWS[nextRow]}${nextColumn + 1}` as Coordinate;
        if (remaining.delete(neighbor)) queue.push(neighbor);
      }
    }
  }

  return islands;
}

function isStraightContiguous(coordinates: Coordinate[]) {
  if (coordinates.length === 1) return true;
  const points = coordinates.map(parseCoordinate);
  const sameRow = points.every(({ row }) => row === points[0]?.row);
  const sameColumn = points.every(({ column }) => column === points[0]?.column);
  if (!sameRow && !sameColumn) return false;

  const values = points
    .map(({ row, column }) => (sameRow ? column : row))
    .sort((a, b) => a - b);

  return values.every((value, index) => index === 0 || value === values[index - 1]! + 1);
}

export function validatePlacement(state: PlayerSecretState) {
  const errors = new Set<string>();
  const terrain = state.terrain.filter(isCoordinate);

  if (terrain.length !== 12 || new Set(terrain).size !== 12) {
    errors.add("terrain_count");
  }
  if (countIslands(terrain) > 2) errors.add("terrain_islands");

  const terrainSet = new Set(terrain);
  const fortCoordinates = state.forts.map((fort) => fort.coordinate);
  if (
    state.forts.length !== 3 ||
    new Set(fortCoordinates).size !== 3 ||
    fortCoordinates.some((coordinate) => !terrainSet.has(coordinate))
  ) {
    errors.add("fort_placement");
  }

  const lengths = state.ships.map((ship) => ship.coordinates.length).sort((a, b) => b - a);
  if (JSON.stringify(lengths) !== JSON.stringify([...SHIP_LENGTHS])) {
    errors.add("fleet_shape");
  }

  const occupied = new Set<Coordinate>();
  for (const ship of state.ships) {
    if (!isStraightContiguous(ship.coordinates)) errors.add("fleet_shape");
    for (const coordinate of ship.coordinates) {
      if (!isCoordinate(coordinate) || occupied.has(coordinate) || terrainSet.has(coordinate)) {
        errors.add("piece_overlap");
      }
      occupied.add(coordinate);
    }
  }

  return { valid: errors.size === 0, errors: [...errors] };
}

export function calculateFirepower(state: PlayerSecretState) {
  const livingForts = state.forts.filter((fort) => !fort.destroyed).length;
  return 1 + livingForts + state.reserveAmmo;
}

export function validateDistribution(targetIds: string[], livingOpponentIds: string[]) {
  if (targetIds.some((targetId) => !livingOpponentIds.includes(targetId))) return false;
  if (livingOpponentIds.length === 0) return targetIds.length === 0;

  const counts = livingOpponentIds.map(
    (opponentId) => targetIds.filter((targetId) => targetId === opponentId).length,
  );
  return Math.max(...counts) - Math.min(...counts) <= 1;
}

export function resolveShot(
  defender: PlayerSecretState,
  coordinate: Coordinate,
): ShotResolution {
  const fort = defender.forts.find(
    (candidate) => candidate.coordinate === coordinate && !candidate.destroyed,
  );
  if (fort) {
    fort.destroyed = true;
    return { coordinate, result: "HIT" };
  }

  const ship = defender.ships.find((candidate) => candidate.coordinates.includes(coordinate));
  if (ship) {
    if (ship.hits.includes(coordinate)) {
      return { coordinate, result: "WRECK", shipId: ship.id };
    }

    ship.hits.push(coordinate);
    const sunk = ship.coordinates.every((cell) => ship.hits.includes(cell));
    return { coordinate, result: sunk ? "SUNK" : "HIT", shipId: ship.id };
  }

  if (defender.terrain.includes(coordinate)) {
    defender.reserveAmmo += 1;
    return { coordinate, result: "LAND_SALVAGED" };
  }

  return { coordinate, result: "WATER" };
}

function transformCoordinate(
  coordinate: Coordinate,
  mirrorHorizontal: boolean,
  mirrorVertical: boolean,
) {
  const { row, column } = parseCoordinate(coordinate);
  const nextRow = mirrorVertical ? BOARD_HEIGHT - row - 1 : row;
  const nextColumn = mirrorHorizontal ? BOARD_WIDTH - column - 1 : column;
  return `${ROWS[nextRow]}${nextColumn + 1}` as Coordinate;
}

export function generateRandomPlacement(random: () => number = Math.random): PlayerSecretState {
  const mirrorHorizontal = random() >= 0.5;
  const mirrorVertical = random() >= 0.5;
  const transform = (coordinate: Coordinate) =>
    transformCoordinate(coordinate, mirrorHorizontal, mirrorVertical);

  const terrain = [
    "A1", "A2", "A3", "A4", "B1", "B2",
    "E5", "E6", "E7", "F5", "F6", "F7",
  ].map((coordinate) => transform(coordinate as Coordinate));

  const shipCoordinates: Coordinate[][] = [
    ["C1", "C2", "C3", "C4"],
    ["D1", "D2", "D3"],
    ["E1", "E2"],
    ["C8"],
    ["F1"],
  ].map((ship) => ship.map((coordinate) => transform(coordinate as Coordinate)));

  return {
    terrain,
    forts: [terrain[0]!, terrain[4]!, terrain[11]!].map((coordinate, index) => ({
      id: `fort-${index + 1}`,
      coordinate,
      destroyed: false,
    })),
    ships: shipCoordinates.map((coordinates, index) => ({
      id: `ship-${SHIP_LENGTHS[index]}-${index}`,
      coordinates,
      hits: [],
    })),
    reserveAmmo: 0,
  };
}
