import type { LeaderboardRow, LeaderboardView } from "@shared/types";

const Row = ({ row, index, label }: { row: LeaderboardRow; index: number; label?: string }) => (
  <li className={`ff-list__row ff-lb-row ${row.isYou ? "is-you" : ""}`} style={{ ["--i" as string]: index }}>
    <span className="ff-lb-row__left">
      <span className={`ff-rank-chip ${row.rank <= 3 && !row.isYou ? "ff-rank-chip--top" : ""}`} aria-label={`Rank ${row.rank}`}>
        {row.rank}
      </span>
      <span className="ff-lb-row__name">{label ?? row.name}</span>
    </span>
    <span className="ff-lb-row__score">{row.score}</span>
  </li>
);

/** One outlined card, 2px lines between rows, top 25 then the player's own row (spec §8, §11). */
export const LeaderboardList = ({ board, emptyText }: { board: LeaderboardView; emptyText: string }) => {
  if (!board.rows.length) return <p className="ff-list ff-empty">{emptyText}</p>;
  return (
    <ol className="ff-list" aria-label="Leaderboard">
      {board.rows.map((row, i) => (
        <Row key={`${row.rank}-${row.name}`} row={row} index={i} />
      ))}
      {board.you && (
        <>
          <li className="ff-list__row ff-lb-gap" aria-hidden="true">
            · · ·
          </li>
          <Row row={board.you} index={board.rows.length + 1} label="You" />
        </>
      )}
    </ol>
  );
};

export default LeaderboardList;
