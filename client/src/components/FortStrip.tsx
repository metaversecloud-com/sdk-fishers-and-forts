import type { FortSummary } from "@shared/types";

// components
import { FortBar } from "@/components";

// utils
import { fmt } from "@/utils";

/** Snow Fort progress strip in the Fishing drawer (spec §5.1.5). Display-only; the "See the Snow Fort" button opens the drawer. */
export const FortStrip = ({ fort }: { fort: FortSummary }) => (
  <div className="ff-fortstrip">
    <div className="ff-fortstrip__head">
      <span className="ff-fortstrip__title">Snow Fort</span>
      <span className="ff-fortstrip__amount">
        {fmt(fort.worldSnow)} of {fmt(fort.goal)} snow
      </span>
    </div>
    <FortBar value={fort.worldSnow} max={fort.goal} label="Snow Fort progress" />
    <p className="ff-copy">
      Every fish you catch adds snow. Everyone in this world is building the fort together.
    </p>
  </div>
);

export default FortStrip;
