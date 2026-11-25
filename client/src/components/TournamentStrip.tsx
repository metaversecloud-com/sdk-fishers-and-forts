import type { TournamentSummary } from "@shared/types";

/** Dark tournament strip under the lake, whichever lake is showing. */
export const TournamentStrip = ({ tournament }: { tournament: TournamentSummary }) => {
  const { rank, rankDelta, fish, lakesLeft, lakesPerDay } = tournament;
  const delta = rankDelta ? (rankDelta > 0 ? `▲${rankDelta}` : `▼${Math.abs(rankDelta)}`) : "";
  const deltaLabel = rankDelta ? `, ${rankDelta > 0 ? "up" : "down"} ${Math.abs(rankDelta)}` : "";
  return (
    <section className="ff-tstrip" aria-label="Fishing tournament">
      <div className="ff-tstrip__row">
        <span className="ff-tstrip__title">Fishing Tournament</span>
        <span className="ff-tstrip__rank">
          {rank ? (
            <>
              <span aria-hidden="true">
                Rank #{rank}
                {delta && <span className="ff-tstrip__delta">{delta}</span>}
              </span>
              <span className="ff-sr-only">{`Rank ${rank}${deltaLabel}`}</span>
            </>
          ) : (
            "Not entered"
          )}
        </span>
      </div>
      <div className="ff-tstrip__row ff-tstrip__meta">
        <span>
          {fish} fish{lakesPerDay !== null && lakesLeft !== null ? ` · ${lakesLeft} of ${lakesPerDay} lakes left` : ""}
        </span>
        <span>Ends 12:00 am ET</span>
      </div>
    </section>
  );
};

export default TournamentStrip;
