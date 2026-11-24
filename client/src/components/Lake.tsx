import { KeyboardEvent, useEffect, useRef, useState } from "react";
import type { HoleView } from "@shared/types";

// components
import { FishIcon } from "@components/Icons";

const SIZE = 7;

const describe = (h: HoleView, i: number) => {
  const where = `Row ${Math.floor(i / SIZE) + 1}, column ${(i % SIZE) + 1}`;
  switch (h.s) {
    case "ice":
      return `${where}: undrilled. Press to drill.`;
    case "marked":
      return `${where}: marked empty`;
    case "num":
      return `${where}: ${h.n} fish nearby${h.clue ? ", starter clue" : ""}`;
    case "fish":
      return `${where}: ${h.special ? "special fish" : "fish"} caught`;
    case "missed":
      return `${where}: missed fish`;
  }
};

const holeClass = (h: HoleView) => {
  switch (h.s) {
    case "num":
      return `ff-hole--num${h.clue ? " ff-hole--clue" : ""}${h.n === 0 ? " ff-hole--zero" : ""}`;
    case "fish":
      return `ff-hole--fish${h.special ? " ff-hole--special" : ""}`;
    default:
      return `ff-hole--${h.s}`;
  }
};

/**
 * The lake: one connected sheet of square holes (spec §5.2, §11). Every hole is a real button for
 * keyboard + screen reader play; arrow keys move between holes (roving tabindex).
 */
export const Lake = ({
  holes,
  newlyMarked,
  pendingHole,
  disabled,
  onDrill,
}: {
  holes: HoleView[];
  newlyMarked: number[];
  pendingHole: number | null;
  disabled: boolean;
  onDrill: (hole: number) => void;
}) => {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const prev = useRef<HoleView[]>(holes);
  const [active, setActive] = useState(() => Math.max(0, holes.findIndex((h) => h.s === "ice")));
  const [settled, setSettled] = useState(false);

  // Holes whose state changed since the previous render get the reveal animation.
  const changed = new Set<number>();
  holes.forEach((h, i) => {
    if (prev.current[i] && prev.current[i].s !== h.s) changed.add(i);
  });
  useEffect(() => {
    prev.current = holes;
  }, [holes]);

  // After the opening fade-in, stop it so later class changes don't replay it.
  useEffect(() => {
    const t = setTimeout(() => setSettled(true), 49 * 9 + 340);
    return () => clearTimeout(t);
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -SIZE, ArrowDown: SIZE };
    if (!(e.key in moves)) return;
    e.preventDefault();
    const col = active % SIZE;
    if ((e.key === "ArrowLeft" && col === 0) || (e.key === "ArrowRight" && col === SIZE - 1)) return;
    const next = active + moves[e.key];
    if (next < 0 || next >= holes.length) return;
    setActive(next);
    refs.current[next]?.focus();
  };

  return (
    <div className={`ff-lake ${settled ? "is-settled" : ""}`} role="group" aria-label="Frozen lake, 7 by 7 holes" onKeyDown={onKeyDown}>
      {holes.map((h, i) => {
        const drillable = h.s === "ice" && !disabled;
        const isNew = changed.has(i);
        const markIdx = newlyMarked.indexOf(i);
        return (
          <button
            key={i}
            ref={(el) => (refs.current[i] = el)}
            type="button"
            className={`ff-hole ${holeClass(h)} ${isNew ? "is-new" : ""} ${pendingHole === i ? "is-pressing" : ""}`}
            style={{ ["--i" as string]: i, ["--m" as string]: Math.max(markIdx, 0) }}
            tabIndex={i === active ? 0 : -1}
            aria-label={describe(h, i)}
            aria-disabled={!drillable}
            onFocus={() => setActive(i)}
            onClick={() => drillable && onDrill(i)}
          >
            {h.s === "num" && <span aria-hidden="true">{h.n}</span>}
            {(h.s === "fish" || h.s === "missed") && <FishIcon />}
          </button>
        );
      })}
    </div>
  );
};

export default Lake;
