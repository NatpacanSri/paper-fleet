import type {
  BotDifficulty,
  Coordinate,
  FireOrder,
  IntelMark,
  Row,
} from "./types";

const ROWS: Row[] = ["A", "B", "C", "D", "E", "F"];
const COORDINATES = ROWS.flatMap((row) =>
  Array.from({ length: 8 }, (_, index) => `${row}${index + 1}` as Coordinate),
);

interface ChooseBotOrdersInput {
  attackerId: string;
  difficulty: BotDifficulty;
  firepower: number;
  opponentIds: string[];
  intel: IntelMark[];
  random?: () => number;
}

function adjacent(coordinate: Coordinate) {
  const row = ROWS.indexOf(coordinate[0] as Row);
  const column = Number(coordinate.slice(1)) - 1;
  return [
    [row - 1, column],
    [row + 1, column],
    [row, column - 1],
    [row, column + 1],
  ].flatMap<Coordinate>(([nextRow, nextColumn]) => {
    if (
      nextRow === undefined ||
      nextColumn === undefined ||
      nextRow < 0 ||
      nextRow >= 6 ||
      nextColumn < 0 ||
      nextColumn >= 8
    ) {
      return [];
    }
    return [`${ROWS[nextRow]}${nextColumn + 1}` as Coordinate];
  });
}

function pickCoordinate(
  difficulty: BotDifficulty,
  targetId: string,
  intel: IntelMark[],
  used: Set<Coordinate>,
  random: () => number,
) {
  const known = intel.filter((mark) => mark.targetId === targetId);
  const knownCoordinates = new Set(known.map((mark) => mark.coordinate));

  if (difficulty !== "EASY") {
    const candidates = known
      .flatMap((mark) => adjacent(mark.coordinate))
      .filter((coordinate) => !knownCoordinates.has(coordinate) && !used.has(coordinate));
    if (candidates.length > 0) return candidates[Math.floor(random() * candidates.length)]!;
  }

  const available = COORDINATES.filter(
    (coordinate) => !knownCoordinates.has(coordinate) && !used.has(coordinate),
  );
  const hardCandidates = difficulty === "HARD"
    ? available.filter((coordinate) => {
      const row = ROWS.indexOf(coordinate[0] as Row);
      const column = Number(coordinate.slice(1)) - 1;
      return (row + column) % 2 === 0;
    })
    : available;
  const pool = hardCandidates.length > 0 ? hardCandidates : available;
  return pool[Math.floor(random() * pool.length)] ?? COORDINATES[0]!;
}

export function chooseBotOrders({
  attackerId,
  difficulty,
  firepower,
  opponentIds,
  intel,
  random = Math.random,
}: ChooseBotOrdersInput): FireOrder[] {
  if (opponentIds.length === 0 || firepower <= 0) return [];

  const targetOrder = [...opponentIds].sort(() => random() - 0.5);
  const usedByTarget = new Map<string, Set<Coordinate>>();

  return Array.from({ length: firepower }, (_, index) => {
    const targetId = targetOrder[index % targetOrder.length]!;
    const used = usedByTarget.get(targetId) ?? new Set<Coordinate>();
    usedByTarget.set(targetId, used);
    const coordinate = pickCoordinate(difficulty, targetId, intel, used, random);
    used.add(coordinate);
    return {
      id: `bot-${attackerId}-${index}-${coordinate}`,
      attackerId,
      targetId,
      coordinate,
    };
  });
}
