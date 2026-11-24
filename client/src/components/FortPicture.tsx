import { CASTLE_FLAG, CASTLE_LAYOUT, SLOT_COUNT } from "@shared/fort/fort";

const BW = 52; // brick width
const BH = 27; // brick height
const W = 520;
const H = 340;
const GROUND = 312;
const X0 = (W - 8 * BW) / 2;

const pos = (col: number, row: number) => ({ x: X0 + col * BW, y: GROUND - (row + 1) * BH });

/** Crenellated tower top spanning two bricks. */
const towerTopPath = (x: number, y: number) => {
  const w = BW * 2 - 3;
  const top = y + 9;
  const m = 15; // merlon width
  return `M${x} ${y + BH - 3} V${y} H${x + m} V${top} H${x + w / 2 - m / 2} V${y} H${x + w / 2 + m / 2} V${top} H${x + w - m} V${y} H${x + w} V${y + BH - 3} Z`;
};

/**
 * The fort as it stands now, drawn from the Castle layout. Only placed pieces are drawn — the finished
 * shape is a surprise (spec §6.4).
 */
export const FortPicture = ({ bricksPlaced }: { bricksPlaced: number }) => {
  const placed = CASTLE_LAYOUT.filter((p) => p.slot <= bricksPlaced);
  const flag = bricksPlaced >= SLOT_COUNT ? pos(CASTLE_FLAG.col, CASTLE_FLAG.row) : null;
  return (
    <svg
      className="ff-fortpic"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={bricksPlaced ? `The Snow Fort with ${bricksPlaced} of ${SLOT_COUNT} bricks placed` : "The Snow Fort has no bricks yet"}
    >
      <rect x="0" y={GROUND} width={W} height={H - GROUND} fill="var(--ff-ground)" />
      {placed.map((p) => {
        const { x, y } = pos(p.col, p.row);
        if (p.type === "towerTop") return <path key={p.slot} className="ff-piece" d={towerTopPath(x + 1.5, y + 1.5)} />;
        return <rect key={p.slot} className="ff-piece" x={x + 1.5} y={y + 1.5} width={BW - 3} height={BH - 3} rx={6} />;
      })}
      {flag && (
        <g>
          <line x1={flag.x + BW / 2} y1={flag.y + BH} x2={flag.x + BW / 2} y2={flag.y - 26} stroke="var(--ff-ink)" strokeWidth="4" />
          <path className="ff-flag" d={`M${flag.x + BW / 2 + 2} ${flag.y - 26} L${flag.x + BW / 2 + 52} ${flag.y - 16} L${flag.x + BW / 2 + 2} ${flag.y - 4} Z`} />
        </g>
      )}
    </svg>
  );
};

export default FortPicture;
