// Purely decorative — no interactivity, no client JS needed.
// Aurora orbs only render visually in dark mode (opacity-0 in light mode).
const BackgroundEffects = () => (
  <div aria-hidden="true" className="aurora-root">
    <div className="aurora-orb aurora-orb-1" />
    <div className="aurora-orb aurora-orb-2" />
    <div className="aurora-orb aurora-orb-3" />
    <div className="noise-layer" />
  </div>
);

export default BackgroundEffects;
