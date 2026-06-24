import { useEffect, useMemo, useState } from "react";
import {
  generateRandomPlacement,
  SHIP_LENGTHS,
  validatePlacement,
} from "@paper-fleet/game-core";
import type {
  Coordinate,
  PlayerSecretState,
  Row,
} from "@paper-fleet/game-core";

interface Props {
  value: PlayerSecretState;
  onChange: (value: PlayerSecretState) => void;
  onRandomize?: () => void;
}

type Tool = "terrain" | "fort" | "ship";
const rows: Row[] = ["A", "B", "C", "D", "E", "F"];
const coordinates = rows.flatMap((row) =>
  Array.from({ length: 8 }, (_, index) => `${row}${index + 1}` as Coordinate),
);

export function SetupEditor({ value, onChange, onRandomize }: Props) {
  const [draft, setDraft] = useState(value);
  const [tool, setTool] = useState<Tool>("terrain");
  const [shipLength, setShipLength] = useState<number>(4);
  const [orientation, setOrientation] = useState<"horizontal" | "vertical">("horizontal");
  const [hoveredCell, setHoveredCell] = useState<Coordinate | null>(null);

  useEffect(() => setDraft(value), [value]);

  const validation = useMemo(() => validatePlacement(draft), [draft]);
  const usedLengths = draft.ships.map((ship) => ship.coordinates.length);
  const preview = hoveredCell
    ? getPreview(draft, tool, hoveredCell, shipLength, orientation)
    : { cells: [] as Coordinate[], valid: false };

  const commit = (next: PlayerSecretState) => {
    setDraft(next);
    onChange(next);
  };

  const editCell = (coordinate: Coordinate) => {
    if (tool === "terrain") {
      const hasTerrain = draft.terrain.includes(coordinate);
      if (!hasTerrain && draft.terrain.length >= 12) return;
      if (
        !hasTerrain &&
        draft.ships.some((ship) => ship.coordinates.includes(coordinate))
      ) {
        return;
      }
      commit({
        ...draft,
        terrain: hasTerrain
          ? draft.terrain.filter((cell) => cell !== coordinate)
          : [...draft.terrain, coordinate],
        forts: hasTerrain
          ? draft.forts.filter((fort) => fort.coordinate !== coordinate)
          : draft.forts,
      });
      return;
    }

    if (tool === "fort") {
      if (!draft.terrain.includes(coordinate)) return;
      const existing = draft.forts.find((fort) => fort.coordinate === coordinate);
      if (!existing && draft.forts.length >= 3) return;
      commit({
        ...draft,
        forts: existing
          ? draft.forts.filter((fort) => fort.id !== existing.id)
          : [
              ...draft.forts,
              { id: `fort-${coordinate}`, coordinate, destroyed: false },
            ],
      });
      return;
    }

    const hitShip = draft.ships.find((ship) => ship.coordinates.includes(coordinate));
    if (hitShip) {
      commit({ ...draft, ships: draft.ships.filter((ship) => ship.id !== hitShip.id) });
      return;
    }

    const allowedCount = SHIP_LENGTHS.filter((length) => length === shipLength).length;
    if (usedLengths.filter((length) => length === shipLength).length >= allowedCount) return;
    const cells = shipCells(coordinate, shipLength, orientation);
    const occupied = new Set(draft.ships.flatMap((ship) => ship.coordinates));
    if (
      cells.length !== shipLength ||
      cells.some((cell) => draft.terrain.includes(cell) || occupied.has(cell))
    ) {
      return;
    }
    commit({
      ...draft,
      ships: [
        ...draft.ships,
        { id: `ship-${shipLength}-${coordinate}`, coordinates: cells, hits: [] },
      ],
    });
  };

  const randomize = () => {
    if (onRandomize) {
      onRandomize();
      return;
    }
    commit(generateRandomPlacement());
  };

  return (
    <section className="setup-editor" aria-label="โต๊ะวาดแผน">
      <div className="tool-strip" aria-label="เครื่องมือวางแผน">
        <button className={tool === "terrain" ? "is-active" : ""} onClick={() => setTool("terrain")}>
          วาดเกาะ
        </button>
        <button className={tool === "fort" ? "is-active" : ""} onClick={() => setTool("fort")}>
          วางป้อม
        </button>
        <button className={tool === "ship" ? "is-active" : ""} onClick={() => setTool("ship")}>
          วางเรือ
        </button>
        <button onClick={randomize}>สุ่มแผน</button>
      </div>

      {tool === "ship" && (
        <div className="ship-tools">
          <span>ขนาดเรือ</span>
          {[4, 3, 2, 1].map((length) => (
            <button
              key={length}
              className={shipLength === length ? "is-active" : ""}
              onClick={() => setShipLength(length)}
            >
              {length}
            </button>
          ))}
          <button onClick={() => setOrientation((current) => current === "horizontal" ? "vertical" : "horizontal")}>
            {orientation === "horizontal" ? "แนวนอน ↔" : "แนวตั้ง ↕"}
          </button>
          <div className="ship-inventory" aria-label="จำนวนเรือแต่ละขนาด">
            {[4, 3, 2, 1].map((length) => {
              const total = SHIP_LENGTHS.filter((item) => item === length).length;
              const used = usedLengths.filter((item) => item === length).length;
              return (
                <span key={length} className={used === total ? "is-complete" : ""}>
                  เรือ {length} ช่อง {used}/{total}
                </span>
              );
            })}
          </div>
        </div>
      )}

      <div className="paper-board setup-board">
        {coordinates.map((coordinate) => {
          const terrain = draft.terrain.includes(coordinate);
          const fort = draft.forts.find((item) => item.coordinate === coordinate);
          const ship = draft.ships.find((item) => item.coordinates.includes(coordinate));
          const previewed = preview.cells.includes(coordinate);
          return (
            <button
              key={coordinate}
              aria-label={`ช่อง ${coordinate}`}
              data-terrain={terrain}
              data-preview={previewed ? (preview.valid ? "valid" : "invalid") : undefined}
              className={`board-cell ${terrain ? "is-land" : ""} ${fort ? "has-fort" : ""} ${ship ? "has-ship" : ""} ${previewed ? "is-preview" : ""}`}
              onClick={() => editCell(coordinate)}
              onMouseEnter={() => setHoveredCell(coordinate)}
              onMouseLeave={() => setHoveredCell(null)}
            >
              <small>{coordinate}</small>
              {fort && <span className="object-mark fort-mark" aria-hidden="true">⌂</span>}
              {ship && <span className="object-mark ship-mark" aria-hidden="true">▰</span>}
              {!fort && !ship && previewed && tool === "fort" && (
                <span className="object-mark preview-mark" aria-hidden="true">⌂</span>
              )}
              {!fort && !ship && previewed && tool === "ship" && (
                <span className="object-mark preview-mark" aria-hidden="true">▰</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="setup-counts">
        <span className={draft.terrain.length === 12 ? "is-complete" : ""}>
          เกาะ {draft.terrain.length}/12
        </span>
        <span className={draft.forts.length === 3 ? "is-complete" : ""}>
          ป้อม {draft.forts.length}/3
        </span>
        <span className={draft.ships.length === 5 ? "is-complete" : ""}>
          เรือ {draft.ships.length}/5
        </span>
        <strong>{validation.valid ? "แผนพร้อมรบ" : "ยังจัดแผนไม่ครบ"}</strong>
        {!validation.valid && (
          <small className="validation-hint">{validationHint(validation.errors)}</small>
        )}
      </div>
    </section>
  );
}

function getPreview(
  draft: PlayerSecretState,
  tool: Tool,
  coordinate: Coordinate,
  shipLength: number,
  orientation: "horizontal" | "vertical",
) {
  if (tool === "terrain") {
    const occupied = draft.ships.some((ship) => ship.coordinates.includes(coordinate));
    return {
      cells: [coordinate],
      valid: draft.terrain.includes(coordinate) || (!occupied && draft.terrain.length < 12),
    };
  }

  if (tool === "fort") {
    return {
      cells: [coordinate],
      valid:
        draft.terrain.includes(coordinate) &&
        (draft.forts.some((fort) => fort.coordinate === coordinate) || draft.forts.length < 3),
    };
  }

  const cells = shipCells(coordinate, shipLength, orientation);
  const occupied = new Set(draft.ships.flatMap((ship) => ship.coordinates));
  const allowedCount = SHIP_LENGTHS.filter((length) => length === shipLength).length;
  const usedCount = draft.ships.filter((ship) => ship.coordinates.length === shipLength).length;
  return {
    cells,
    valid:
      cells.length === shipLength &&
      usedCount < allowedCount &&
      cells.every((cell) => !draft.terrain.includes(cell) && !occupied.has(cell)),
  };
}

function validationHint(errors: string[]) {
  const messages: Record<string, string> = {
    terrain_count: "วาดแผ่นดินให้ครบ 12 ช่อง",
    terrain_islands: "แผ่นดินต้องติดกันและมีได้ไม่เกิน 2 เกาะ",
    fort_placement: "วางป้อม 3 แห่งบนแผ่นดิน",
    fleet_shape: "วางเรือขนาด 4, 3, 2, 1, 1 ให้ครบ",
    piece_overlap: "มีเรือหรือแผ่นดินวางทับกัน",
  };
  return messages[errors[0] ?? ""] ?? "ตรวจตำแหน่งเกาะ ป้อม และเรืออีกครั้ง";
}

function shipCells(
  start: Coordinate,
  length: number,
  orientation: "horizontal" | "vertical",
) {
  const rowIndex = rows.indexOf(start[0] as Row);
  const columnIndex = Number(start.slice(1)) - 1;
  return Array.from({ length }, (_, offset) => {
    const row = orientation === "vertical" ? rowIndex + offset : rowIndex;
    const column = orientation === "horizontal" ? columnIndex + offset : columnIndex;
    if (row >= rows.length || column >= 8) return null;
    return `${rows[row]}${column + 1}` as Coordinate;
  }).filter((coordinate): coordinate is Coordinate => coordinate !== null);
}
