import { useContext, useEffect, useState } from "react";
import { FORT_GOAL_OPTIONS, TOURNAMENT_LAKE_OPTIONS, UNIQUE_NAMES } from "@shared/constants";
import type { AdminState, FortSummary } from "@shared/types";

// components
import { Banner, ConfirmationModal, Loading } from "@/components";

// context
import { GlobalDispatchContext, GlobalStateContext } from "@/context/GlobalContext";
import { ErrorType } from "@/context/types";

// utils
import { backendAPI, fmt, setErrorMessage, setGameState } from "@/utils";

/**
 * Admin Settings (spec §7), opened from the gear in the Fishing drawer header.
 * Body replaced with the app's settings per Lina 11/20.
 */
export const AdminView = () => {
  const dispatch = useContext(GlobalDispatchContext);
  const { fishing } = useContext(GlobalStateContext);
  const [state, setState] = useState<AdminState | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    backendAPI
      .get("/admin/settings")
      .then((res) => setState(res.data.data))
      .catch((err) => setErrorMessage(dispatch, err as ErrorType));
  }, [dispatch]);

  /** Keep the Fishing drawer's fort strip in sync after admin changes. */
  const syncFort = (fort?: FortSummary) => {
    if (fort && fishing) setGameState(dispatch, { fishing: { ...fishing, fort } });
  };

  const save = async (body: Partial<AdminState["settings"]>) => {
    setIsSaving(true);
    setStatus("");
    try {
      const res = await backendAPI.post("/admin/settings", body);
      setState(res.data.data);
      syncFort(res.data.data.fort);
      setStatus("Saved.");
    } catch (err) {
      setErrorMessage(dispatch, err as ErrorType);
    } finally {
      setIsSaving(false);
    }
  };

  const startNewFort = async () => {
    try {
      const res = await backendAPI.post("/admin/start-new-fort");
      setState(res.data.data);
      syncFort(res.data.data.fort);
      setStatus("A new fort has started.");
    } catch (err) {
      setErrorMessage(dispatch, err as ErrorType);
    }
  };

  if (!state) return <Loading />;
  const { settings, missingSlots, flagMissing } = state;

  return (
    <div>
      <Banner first>ADMINS ONLY</Banner>

      {(missingSlots.length > 0 || flagMissing) && (
        <div className="ff-warning mb-5" role="alert">
          <strong>Some fort pieces are missing from this world.</strong>{" "}
          {missingSlots.length > 0 && (
            <>
              Missing blocks: {missingSlots.join(", ")}. Re-add an asset with unique name{" "}
              <code>
                {UNIQUE_NAMES.fortBlockPrefix}
                {missingSlots[0]}
              </code>{" "}
              (and so on) and it will be fixed automatically.{" "}
            </>
          )}
          {flagMissing && (
            <>
              The flag (<code>{UNIQUE_NAMES.fortFlag}</code>) is missing.
            </>
          )}
        </div>
      )}

      <section className="ff-setting" aria-labelledby="ff-goal-title">
        <h2 id="ff-goal-title" className="ff-setting__title">
          Fort goal
        </h2>
        <p className="ff-copy">How much snow finishes the fort.</p>
        <div className="ff-pills ff-pills--settings" role="group" aria-labelledby="ff-goal-title">
          {FORT_GOAL_OPTIONS.map((goal) => (
            <button
              key={goal}
              type="button"
              className="ff-pill"
              aria-pressed={settings.fortGoal === goal}
              disabled={isSaving}
              onClick={() => settings.fortGoal !== goal && save({ fortGoal: goal })}
            >
              {fmt(goal)}
            </button>
          ))}
        </div>
      </section>

      <section className="ff-setting mt-5" aria-labelledby="ff-lakes-title">
        <h2 id="ff-lakes-title" className="ff-setting__title">
          Tournament lakes per day
        </h2>
        <p className="ff-copy">How many tournament lakes each player gets.</p>
        <div className="ff-pills ff-pills--settings" role="group" aria-labelledby="ff-lakes-title">
          {TOURNAMENT_LAKE_OPTIONS.map((n) => (
            <button
              key={String(n)}
              type="button"
              className="ff-pill"
              aria-pressed={settings.tournamentLakesPerDay === n}
              disabled={isSaving}
              onClick={() => settings.tournamentLakesPerDay !== n && save({ tournamentLakesPerDay: n })}
            >
              {n === null ? "No limit" : n}
            </button>
          ))}
        </div>
      </section>

      <hr className="ff-divider" />

      <section className="ff-setting" aria-labelledby="ff-new-fort-title">
        <h2 id="ff-new-fort-title" className="ff-setting__title">
          Start a new fort
        </h2>
        <p className="ff-copy">World Snow goes back to zero and every brick disappears.</p>
        <button type="button" className="btn ff-btn ff-btn--danger" onClick={() => setShowConfirm(true)}>
          Start a new fort
        </button>
      </section>

      {status && (
        <p className="ff-status" role="status">
          {status}
        </p>
      )}

      {showConfirm && (
        <ConfirmationModal
          title="Start a new fort?"
          message="World Snow goes back to zero and every brick disappears so the world can build again. Badges and the leaderboard are not affected."
          cancelLabel="Keep Fort"
          confirmLabel="Start New Fort"
          danger
          handleOnConfirm={startNewFort}
          handleToggleShowConfirmationModal={() => setShowConfirm(false)}
        />
      )}
    </div>
  );
};

export default AdminView;
