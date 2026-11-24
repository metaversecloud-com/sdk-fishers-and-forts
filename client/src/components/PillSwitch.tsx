import { ReactNode } from "react";

/** One round outlined pill holding two options; the selected one is filled dark (spec §11). */
export const PillSwitch = ({
  label,
  options,
  activeIndex,
  onSelect,
  asTabs = false,
}: {
  label: string;
  options: { key: string; label: ReactNode; locked?: boolean; ariaLabel?: string }[];
  activeIndex: number;
  onSelect: (index: number) => void;
  asTabs?: boolean;
}) => (
  <div className="ff-switch" data-active={activeIndex} role={asTabs ? "tablist" : "group"} aria-label={label}>
    <span className="ff-switch__thumb" aria-hidden="true" />
    {options.map((opt, i) => (
      <button
        key={opt.key}
        type="button"
        className={`ff-switch__opt ${opt.locked ? "is-locked" : ""}`}
        onClick={() => onSelect(i)}
        aria-label={opt.ariaLabel}
        {...(asTabs ? { role: "tab", "aria-selected": i === activeIndex } : { "aria-pressed": i === activeIndex })}
      >
        {opt.label}
      </button>
    ))}
  </div>
);

export default PillSwitch;
