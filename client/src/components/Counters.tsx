import { useEffect, useRef, useState } from "react";

const Counter = ({ label, value, total }: { label: string; value: number; total: number }) => {
  const prev = useRef(value);
  const [bumpKey, setBumpKey] = useState(0);
  useEffect(() => {
    if (prev.current !== value) setBumpKey((k) => k + 1);
    prev.current = value;
  }, [value]);

  return (
    <div className="ff-counter">
      <span className="ff-counter__label" aria-hidden="true">
        {label}
      </span>
      <span key={bumpKey} className={`ff-counter__value ${bumpKey ? "is-bump" : ""}`} aria-hidden="true">
        {value}
      </span>
      <span className="ff-counter__total" aria-hidden="true">
        /{total}
      </span>
      <span className="ff-sr-only">{`${label}: ${value} of ${total}`}</span>
    </div>
  );
};

export const Counters = ({ drillsLeft, drillsTotal, fishCaught, fishTotal }: { drillsLeft: number; drillsTotal: number; fishCaught: number; fishTotal: number }) => (
  <div className="ff-counters">
    <Counter label="DRILLS" value={drillsLeft} total={drillsTotal} />
    <Counter label="FISH" value={fishCaught} total={fishTotal} />
  </div>
);

export default Counters;
