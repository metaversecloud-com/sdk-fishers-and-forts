import { useContext, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

// components
import { Banner, FortBar, FortPicture, PageContainer } from "@/components";

// context
import { GlobalDispatchContext, GlobalStateContext } from "@/context/GlobalContext";
import { ErrorType } from "@/context/types";

// utils
import { backendAPI, firstOpen, fmt, setErrorMessage, setGameState } from "@/utils";

/** The Snow Fort drawer, route `/fort`. */
export const FortView = () => {
  const navigate = useNavigate();
  const { search } = useLocation();
  const onGoFishing = () => navigate({ pathname: "/", search });
  const dispatch = useContext(GlobalDispatchContext);
  const { fort: view, hasInteractiveParams } = useContext(GlobalStateContext);
  const [isLoading, setIsLoading] = useState(!view);

  useEffect(() => {
    if (!hasInteractiveParams) return;
    backendAPI
      .get("/fort", { params: { open: firstOpen("fort") } })
      .then((res) => setGameState(dispatch, { fort: res.data.data }))
      .catch((err) => setErrorMessage(dispatch, err as ErrorType))
      .finally(() => setIsLoading(false));
  }, [dispatch, hasInteractiveParams]);

  const fort = view?.fort;

  return (
    <PageContainer isLoading={isLoading || !view} headerImage={{ src: "/assets/forts.png", alt: "Fishers & Forts" }}>
      {view && fort && (
        <div className="ff-stack">
          <Banner first>{fort.complete ? "FORT COMPLETE!" : `SNOW FORT • ${fort.bricksPlaced} OF 50 BRICKS`}</Banner>
          <p className="ff-copy ff-copy--ink">
            {fort.complete
              ? "Everyone in this world built this fort together, by fishing."
              : "Everyone in this world is building this fort together. Every fish caught in Ice Fishing adds snow."}
          </p>

          <FortPicture bricksPlaced={fort.bricksPlaced} />

          <div className="ff-fort-progress">
            <p className="ff-fort-progress__amount">
              {fmt(fort.worldSnow)} of {fmt(fort.goal)} snow
            </p>
            <FortBar value={fort.worldSnow} max={fort.goal} label="Snow Fort progress" />
            <p className="ff-copy">
              {fort.complete
                ? "The flag is up on the Keep!"
                : `${fmt(fort.snowUntilNextBrick)} snow until the next brick.`}
            </p>
          </div>

          <div className="ff-card ff-card--flat ff-you-card mb-2">
            <p className="ff-you-card__main">You've added {fmt(view.youAdded)} snow.</p>
            <p className="ff-copy">
              Builders: {fmt(view.builderCount)} {view.builderCount === 1 ? "player has" : "players have"} helped.
            </p>
          </div>

          <ul className="ff-list" aria-label="Fort sections">
            {view.sections.map((s) => (
              <li key={s.key} className="ff-list__row">
                <span>
                  <span className="ff-section__name">{s.name}</span>
                  <span className="ff-section__count">{s.bricks} bricks</span>
                </span>
                {s.reached ? (
                  <span className="ff-chip-reached">REACHED</span>
                ) : (
                  <span className="ff-togo">{fmt(s.snowToGo)} TO GO</span>
                )}
              </li>
            ))}
          </ul>

          <button type="button" className="btn ff-btn" onClick={onGoFishing}>
            Go fishing
          </button>
        </div>
      )}
    </PageContainer>
  );
};

export default FortView;
