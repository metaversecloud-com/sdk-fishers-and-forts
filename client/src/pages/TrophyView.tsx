import { useContext, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { LeaderboardKey } from "@shared/types";

// components
import { Banner, BadgeGrid, ConfirmationModal, LeaderboardList, PageContainer, PillSwitch } from "@/components";

// context
import { GlobalDispatchContext, GlobalStateContext } from "@/context/GlobalContext";
import { ErrorType } from "@/context/types";

// utils
import { backendAPI, firstOpen, setErrorMessage, setGameState, shortDay } from "@/utils";

const BOARDS: { key: LeaderboardKey; label: string }[] = [
  { key: "tournament", label: "Tournament" },
  { key: "dailyLake", label: "Daily Lake" },
  { key: "fortBuilders", label: "Fort Builders" },
];

/** The Trophy drawer, route `/trophy`: Leaderboards and Badges. */
export const TrophyView = () => {
  const dispatch = useContext(GlobalDispatchContext);
  const { trophy, hasInteractiveParams } = useContext(GlobalStateContext);
  const [searchParams] = useSearchParams();
  const forceRefreshInventory = searchParams.get("forceRefreshInventory") === "true";

  const [isLoading, setIsLoading] = useState(!trophy);
  const [tab, setTab] = useState<"leaderboards" | "badges">("leaderboards");
  const [board, setBoard] = useState<LeaderboardKey>("tournament");
  const [day, setDay] = useState<"today" | "yesterday">("today");
  const [showReset, setShowReset] = useState(false);
  const viewed = useRef(new Set<LeaderboardKey>(["tournament"]));

  const load = () =>
    backendAPI
      .get("/trophy", { params: { open: firstOpen("trophy"), forceRefreshInventory } })
      .then((res) => setGameState(dispatch, { trophy: res.data.data, isAdmin: res.data.data.isAdmin }))
      .catch((err) => setErrorMessage(dispatch, err as ErrorType))
      .finally(() => setIsLoading(false));

  useEffect(() => {
    if (hasInteractiveParams) load();
    // Load once when the interactive params arrive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasInteractiveParams]);

  const selectBoard = (key: LeaderboardKey) => {
    setBoard(key);
    setDay("today");
    // Opening the Trophy counts as viewing Tournament; the others fire once per drawer session.
    if (!viewed.current.has(key)) {
      viewed.current.add(key);
      backendAPI.post("/leaderboard-view", { board: key }).catch(() => undefined);
    }
  };

  const resetBuilders = async () => {
    try {
      await backendAPI.post("/admin/reset-leaderboard");
      await load();
    } catch (err) {
      setErrorMessage(dispatch, err as ErrorType);
    }
  };

  const lb = trophy?.leaderboards;
  const daily = board !== "fortBuilders";
  const showingYesterday = daily && day === "yesterday";
  const view = !lb
    ? null
    : board === "fortBuilders"
      ? lb.fortBuilders
      : showingYesterday
        ? lb[board].yesterday
        : lb[board].today;

  const banner = showingYesterday
    ? `FINAL STANDINGS • ${trophy?.yesterdayDayKey ? shortDay(trophy.yesterdayDayKey) : ""}`
    : daily
      ? "RESETS 12:00 AM ET"
      : "ALL TIME • THIS WORLD";

  const description = {
    tournament: `Total fish caught in tournament lakes ${showingYesterday ? "that day" : "today"}.${trophy?.lakesPerDay ? ` You get ${trophy.lakesPerDay} lakes a day.` : ""}`,
    dailyLake: "Same lake for everyone, one try. Most fish wins; drills left breaks ties.",
    fortBuilders: "Snow added to the fort in this world, all time.",
  }[board];

  const earned = trophy?.badges.filter((b) => b.earned).length ?? 0;

  return (
    <PageContainer isLoading={isLoading || !trophy}>
      {trophy && (
        <>
          <img className="ff-logo" src="/assets/logo.png" alt="Fishers & Forts" />
          <PillSwitch
            label="Trophy sections"
            asTabs
            activeIndex={tab === "leaderboards" ? 0 : 1}
            onSelect={(i) => setTab(i === 0 ? "leaderboards" : "badges")}
            options={[
              { key: "leaderboards", label: "Leaderboards" },
              { key: "badges", label: "Badges" },
            ]}
          />

          {tab === "leaderboards" ? (
            <div role="tabpanel" aria-label="Leaderboards" className="grid gap-2">
              <Banner>{banner}</Banner>
              <div className="ff-pills" role="group" aria-label="Leaderboard">
                {BOARDS.map((b) => (
                  <button
                    key={b.key}
                    type="button"
                    className="ff-pill"
                    aria-pressed={board === b.key}
                    onClick={() => selectBoard(b.key)}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
              {daily && (
                <div className="ff-pills ff-pills--end mt-3" role="group" aria-label="Day">
                  {(["today", "yesterday"] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      className="ff-pill ff-pill--dark ff-pill--small"
                      aria-pressed={day === d}
                      onClick={() => setDay(d)}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              )}
              <p className="ff-copy ff-lb-desc">{description}</p>
              {view ? (
                <LeaderboardList
                  key={`${board}-${day}`}
                  board={view}
                  emptyText={board === "fortBuilders" ? "No one has added snow yet." : "No one has fished yet."}
                />
              ) : (
                <p className="ff-list ff-empty">No standings from yesterday yet.</p>
              )}
              {board === "fortBuilders" && trophy.isAdmin && (
                <button type="button" className="btn ff-btn ff-btn--danger mt-5" onClick={() => setShowReset(true)}>
                  Reset leaderboard
                </button>
              )}
            </div>
          ) : (
            <div role="tabpanel" aria-label="Badges">
              <Banner>{`${earned} OF ${trophy.badges.length} BADGES`}</Banner>
              <BadgeGrid badges={trophy.badges} />
            </div>
          )}

          {showReset && (
            <ConfirmationModal
              title="Reset Fort Builders?"
              message="Every player's Fort Builders score goes back to zero. The fort, World Snow and badges are not affected."
              cancelLabel="Cancel"
              confirmLabel="Reset"
              danger
              handleOnConfirm={resetBuilders}
              handleToggleShowConfirmationModal={() => setShowReset(false)}
            />
          )}
        </>
      )}
    </PageContainer>
  );
};

export default TrophyView;
