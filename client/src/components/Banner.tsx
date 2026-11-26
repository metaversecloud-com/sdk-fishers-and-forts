export const Banner = ({ children, first = false }: { children: string; first?: boolean }) => (
  <div className={`ff-banner ${first ? "ff-banner--first" : ""}`}>{children}</div>
);

export default Banner;
