import type { Coordinate, IntelMark, PlayerSecretState, Row } from "@paper-fleet/game-core";

interface Props {
  secret?: PlayerSecretState;
  intel?: IntelMark[];
  targetId?: string;
  selected?: Coordinate[];
  onCellClick?: (coordinate: Coordinate) => void;
  concealShips?: boolean;
}

const rows: Row[] = ["A", "B", "C", "D", "E", "F"];
const coordinates = rows.flatMap((row) =>
  Array.from({ length: 8 }, (_, index) => `${row}${index + 1}` as Coordinate),
);

export function Board({
  secret,
  intel = [],
  targetId,
  selected = [],
  onCellClick,
  concealShips = false,
}: Props) {
  return (
    <div className="paper-board">
      {coordinates.map((coordinate) => {
        const terrain = secret?.terrain.includes(coordinate);
        const fort = secret?.forts.find((item) => item.coordinate === coordinate);
        const ship = secret?.ships.find((item) => item.coordinates.includes(coordinate));
        const shipHit = ship?.hits.includes(coordinate) ?? false;
        const fortDestroyed = fort?.destroyed ?? false;
        const mark = intel.find(
          (item) => item.targetId === targetId && item.coordinate === coordinate,
        );
        const isSelected = selected.includes(coordinate);
        const damageLabel = fortDestroyed
          ? " ป้อมถูกทำลาย"
          : shipHit
            ? " เรือถูกยิง"
            : "";
        return (
          <button
            key={coordinate}
            className={[
              "board-cell",
              terrain ? "is-land" : "",
              fort ? "has-fort" : "",
              ship && !concealShips ? "has-ship" : "",
              mark ? "is-hit" : "",
              shipHit ? "is-own-hit" : "",
              fortDestroyed ? "is-fort-destroyed" : "",
              isSelected ? "is-targeted" : "",
            ].join(" ")}
            aria-label={`ช่อง ${coordinate}${damageLabel}`}
            data-damage={fortDestroyed ? "destroyed" : shipHit ? "hit" : undefined}
            onClick={() => onCellClick?.(coordinate)}
          >
            <small>{coordinate}</small>
            {mark && <span className="hit-stamp">โดน</span>}
            {!mark && fort && (
              <span className="object-mark fort-mark" aria-hidden="true">
                {fortDestroyed ? "×" : "⌂"}
              </span>
            )}
            {!mark && ship && !concealShips && (
              <span className="object-mark ship-mark" aria-hidden="true">
                {shipHit ? "✕" : "▰"}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
