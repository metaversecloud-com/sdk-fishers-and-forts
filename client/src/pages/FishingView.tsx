import { useContext, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { DrillResponse, FishingState, LakeKind } from "@shared/types";

// components
import {
  Banner,
  Counters,
  FortStrip,
  Lake,
  LockIcon,
  PageContainer,
  PillSwitch,
  ResultCard,
  TournamentStrip,
} from "@/components";

// context
import { GlobalDispatchContext, GlobalStateContext } from "@/context/GlobalContext";
import { ErrorType } from "@/context/types";

// utils
import { backendAPI, firstOpen, playSfx, setErrorMessage, setGameState } from "@/utils";

/** The Fishing drawer (spec §5), route `/` (key asset). */
export const FishingView = () => {
  const navigate = useNavigate();
  const { search } = useLocation();
  // Keep the interactive params in the query string when switching drawers.
  const onOpenFort = () => navigate({ pathname: "/fort", search });
  const dispatch = useContext(GlobalDispatchContext);
  const { fishing, hasInteractiveParams } = useContext(GlobalStateContext);

  const [isLoading, setIsLoading] = useState(!fishing);
  const [kind, setKind] = useState<LakeKind>(fishing?.lake.kind || "daily");
  const [lakeKey, setLakeKey] = useState(0); // remounts the lake (fade-in) when a new lake loads
  const [pendingHole, setPendingHole] = useState<number | null>(null);
  const [newlyMarked, setNewlyMarked] = useState<number[]>([]);
  const [notice, setNotice] = useState("");
  const inFlight = useRef(false);
  const fishingRef = useRef(fishing);
  fishingRef.current = fishing;

  const load = async (nextKind: LakeKind) => {
    try {
      const res = await backendAPI.get("/game-state", { params: { kind: nextKind, open: firstOpen("fishing") } });
      const data: FishingState = res.data.data;
      setGameState(dispatch, { fishing: data, isAdmin: data.isAdmin });
      setKind(data.lake.kind);
      setNewlyMarked([]);
      setLakeKey((k) => k + 1);
    } catch (err) {
      setErrorMessage(dispatch, err as ErrorType);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (hasInteractiveParams) load(kind);
    // Load once when the interactive params arrive; later loads are user-driven.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasInteractiveParams]);

  const selectKind = (index: number) => {
    const next: LakeKind = index === 0 ? "daily" : "tournament";
    if (next === "tournament" && !fishing?.tournament.unlocked) {
      setNotice("Finish today's Daily Lake first.");
      return;
    }
    setNotice("");
    if (next !== kind) load(next);
  };

  const drill = async (hole: number) => {
    if (inFlight.current || !fishing) return;
    inFlight.current = true;
    setPendingHole(hole);
    playSfx("drill");
    try {
      const res = await backendAPI.post("/lake/drill", { kind, hole });
      const data: DrillResponse = res.data.data;
      const current = fishingRef.current!;
      setGameState(dispatch, {
        fishing: {
          ...current,
          lake: data.lake,
          fort: data.fort ?? current.fort,
          tournament: data.tournament ?? current.tournament,
          dailyRank: data.dailyRank !== undefined ? data.dailyRank : current.dailyRank,
        },
      });
      setNewlyMarked(data.newlyMarked);
      playSfx(data.caughtSpecial ? "specialFish" : data.caughtFish ? "fish" : "number");
      if (data.justFinished) {
        playSfx(data.lake.result?.perfect ? "perfectLake" : "lakeFinished");
        if (data.addedBrick) playSfx("brickPlaced");
      }
    } catch (err) {
      // 409 = a raced double tap; the lake is unchanged, so ignore it.
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status !== 409) setErrorMessage(dispatch, err as ErrorType);
    } finally {
      inFlight.current = false;
      setPendingHole(null);
    }
  };

  const playTournament = () => {
    setNotice("");
    load("tournament");
  };

  const lake = fishing?.lake;
  const tournament = fishing?.tournament;

  return (
    <PageContainer
      isLoading={isLoading || !fishing}
      headerImage={{ src: "/assets/fishers.png", alt: "Fishers & Forts" }}
      showAdminGear
    >
      {fishing && lake && tournament && (
        <>
          <PillSwitch
            label="Choose a lake"
            activeIndex={kind === "daily" ? 0 : 1}
            onSelect={selectKind}
            options={[
              { key: "daily", label: "Daily Lake" },
              {
                key: "tournament",
                locked: !tournament.unlocked,
                ariaLabel: tournament.unlocked
                  ? "Tournament"
                  : "Tournament, locked until today's Daily Lake is finished",
                label: (
                  <>
                    {!tournament.unlocked && <LockIcon />}
                    Tournament
                  </>
                ),
              },
            ]}
          />
          {notice && (
            <p className="ff-status" role="status">
              {notice}
            </p>
          )}

          <Banner>{lake.label}</Banner>
          <Counters
            drillsLeft={lake.drillsLeft}
            drillsTotal={lake.drillsTotal}
            fishCaught={lake.fishCaught}
            fishTotal={lake.fishTotal}
          />
          <Lake
            key={lakeKey}
            holes={lake.holes}
            newlyMarked={newlyMarked}
            pendingHole={pendingHole}
            disabled={lake.finished}
            onDrill={drill}
          />
          <p className="ff-copy ff-reminder">
            Tap a hole to drill it. A number shows how many fish are in the 8 holes around it.
          </p>

          {lake.finished && lake.result && (
            <ResultCard
              kind={lake.kind}
              result={lake.result}
              fishTotal={lake.fishTotal}
              dailyRank={fishing.dailyRank}
              outOfLakes={tournament.outOfLakes}
              lakesPerDay={tournament.lakesPerDay}
              onPlayTournament={playTournament}
            />
          )}

          <TournamentStrip tournament={tournament} />
          <FortStrip fort={fishing.fort} />
          <button type="button" className="btn ff-btn ff-btn--outline" onClick={onOpenFort}>
            See the Snow Fort
          </button>
        </>
      )}
    </PageContainer>
  );
};

export default FishingView;
