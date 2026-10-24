/** BuildMates mark: two blocks resting on each other – two people building together. */
export function LogoMark({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="var(--primary)" />
      <rect x="28" y="13" width="23" height="19" rx="4.5" fill="var(--marigold)" />
      <rect x="13" y="32" width="23" height="19" rx="4.5" fill="var(--surface)" />
    </svg>
  );
}

export default function Logo({ size = 30 }) {
  return (
    <span className="logo">
      <LogoMark size={size} />
      <span>Build<span className="logo-accent">Mates</span></span>
    </span>
  );
}
