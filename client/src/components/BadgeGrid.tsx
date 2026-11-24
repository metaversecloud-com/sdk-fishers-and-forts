import { useMemo } from "react";
import type { BadgeView } from "@shared/types";

/**
 * Topia-standard badges UI: four across, name only, description as a tooltip (spec §9).
 * Badges arrive already sorted by the catalog's metadata.sortOrder; groups appear in that same order.
 */
export const BadgeGrid = ({ badges }: { badges: BadgeView[] }) => {
  // Each badge image pops in at a random moment within the first 0.3s (matches Trivia).
  const delays = useMemo(() => badges.map(() => `${(Math.random() * 0.3).toFixed(2)}s`), [badges]);
  const groups = useMemo(() => [...new Set(badges.map((b) => b.group))], [badges]);

  return (
    <div>
      {groups.map((group) => {
        const items = badges.map((b, i) => ({ b, i })).filter(({ b }) => b.group === group);
        return (
          <section key={group} className="ff-badge-group" aria-labelledby={`ff-group-${group}`}>
            <h2 id={`ff-group-${group}`} className="ff-mono-label ff-badge-group__title">
              {group}
            </h2>
            <ul className="ff-badge-grid" role="list">
              {items.map(({ b, i }) => {
                const tipId = `ff-tip-${i}`;
                return (
                  <li key={b.name}>
                    <div
                      className={`ff-badge ${b.earned ? "is-earned" : "is-locked"}`}
                      data-group={group}
                      aria-describedby={tipId}
                      aria-label={`${b.name}, ${b.earned ? "earned" : "locked"}`}
                    >
                      <span className="ff-badge__icon" style={{ ["--d" as string]: delays[i] }} aria-hidden="true">
                        {b.icon && <img src={b.icon} alt="" />}
                      </span>
                      <span className="ff-badge__name" aria-hidden="true">
                        {b.name}
                      </span>
                      <span id={tipId} role="tooltip" className="ff-tooltip">
                        {b.description}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
};

export default BadgeGrid;
