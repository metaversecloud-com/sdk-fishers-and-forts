import { ActionType, InitialState, SET_GAME_STATE } from "@/context/types";
import { Dispatch } from "react";

/** Merge drawer slices into global state (fishing / fort / trophy / isAdmin). */
export const setGameState = (dispatch: Dispatch<ActionType> | null, gameState: Partial<InitialState>) => {
  if (!dispatch) return;

  dispatch({
    type: SET_GAME_STATE,
    payload: { ...gameState },
  });
};
