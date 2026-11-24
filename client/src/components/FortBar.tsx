export const FortBar = ({ value, max, label }: { value: number; max: number; label: string }) => {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="ff-bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.min(value, max)}>
      <div className="ff-bar__fill" style={{ width: `${pct}%` }} />
    </div>
  );
};

export default FortBar;
