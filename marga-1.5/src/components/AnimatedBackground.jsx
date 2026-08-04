/**
 * Subtle animated background: a few slow-drifting radial "blobs" plus a faint
 * grid. Pure CSS (no JS loop) so it stays cheap; frozen for prefers-reduced-motion
 * via the global rule in index.css. Sits behind all content and never intercepts
 * pointer events.
 */
export default function AnimatedBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-navy-900"
    >
      <div className="absolute -left-[10%] -top-[15%] h-[55vmax] w-[55vmax] rounded-full bg-sky2/10 blur-3xl animate-drift" />
      <div
        className="absolute -right-[12%] top-[20%] h-[45vmax] w-[45vmax] rounded-full bg-gold/[0.06] blur-3xl animate-drift"
        style={{ animationDelay: '-8s', animationDuration: '32s' }}
      />
      <div
        className="absolute bottom-[-20%] left-[25%] h-[50vmax] w-[50vmax] rounded-full bg-navy-500/25 blur-3xl animate-drift"
        style={{ animationDelay: '-16s', animationDuration: '38s' }}
      />
      {/* faint grid overlay for depth */}
      <div
        className="absolute inset-0 opacity-[0.4]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(56,189,248,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,0.04) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(ellipse at center, black 40%, transparent 85%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, black 40%, transparent 85%)',
        }}
      />
    </div>
  );
}
