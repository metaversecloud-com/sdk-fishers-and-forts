import type { LakeKind, LakeResult } from "@shared/types";

/** Result card under a finished lake (spec §5.5). */
export const ResultCard = ({
  kind,
  result,
  fishTotal,
  dailyRank,
  outOfLakes,
  lakesPerDay,
  onPlayTournament,
}: {
  kind: LakeKind;
  result: LakeResult;
  fishTotal: number;
  dailyRank: number | null;
  outOfLakes: boolean;
  lakesPerDay: number | null;
  onPlayTournament: () => void;
}) => {
  const { snow, perfect, fishCaught } = result;
  return (
    <section className="ff-card ff-result" role="status" aria-live="polite">
      <h2 className={`ff-result__title ${perfect ? "is-perfect" : ""}`}>
        {perfect ? `Perfect lake! You caught ${fishCaught} of ${fishTotal} fish` : `You caught ${fishCaught} of ${fishTotal} fish`}
      </h2>
      <ul className="ff-result__lines">
        <li className="ff-result__line">
          <span>Fish</span>
          <span>+{snow.fish}</span>
        </li>
        {result.specialCaught !== null && (
          <li className="ff-result__line">
            <span>{result.specialCaught ? "Special fish caught" : "Special fish (missed)"}</span>
            <span>+{snow.special}</span>
          </li>
        )}
        {snow.perfectBonus > 0 && (
          <li className="ff-result__line">
            <span>Perfect lake bonus</span>
            <span>+{snow.perfectBonus}</span>
          </li>
        )}
        <li className="ff-result__line ff-result__line--total">
          <span>Snow for the fort</span>
          <span>+{snow.total}</span>
        </li>
      </ul>
      <p className="ff-copy ff-result__note">
        {result.fortComplete ? "The flag is up on the Keep!" : `${result.snowUntilNextBrick.toLocaleString("en-US")} snow until the next brick.`}
      </p>
      {kind === "daily" && dailyRank !== null && (
        <p className="ff-result__rank">
          <strong>You're #{dailyRank}</strong> on today's Daily Lake. Next lake at 12:00 am ET.
        </p>
      )}
      <button type="button" className="btn ff-btn" onClick={onPlayTournament} disabled={outOfLakes}>
        Play a tournament lake
      </button>
      {outOfLakes && (
        <p className="ff-result__out">
          You've fished all {lakesPerDay ?? ""} tournament lakes today. A new tournament starts at 12:00 am ET.
        </p>
      )}
    </section>
  );
};

export default ResultCard;
