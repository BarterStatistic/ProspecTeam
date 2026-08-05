import { UserRound } from 'lucide-react';

/**
 * Circular profile picture for the user who registered a record.
 *
 * `fallback` decides what happens when there is no photo yet:
 *   'none' (default) → renders nothing, so lists and boards stay exactly as
 *                      they look for users who never uploaded one.
 *   'icon'           → generic silhouette, used inside the profile modal.
 *
 * The ring uses the user's accent colour, so photo and colour reinforce each
 * other instead of competing.
 */
export default function Avatar({
  photo,
  name = '',
  color = '#64748B',
  size = 20,
  fallback = 'none',
  className = '',
}) {
  if (!photo && fallback === 'none') return null;

  const box = {
    width: size,
    height: size,
    // Scale the ring with the avatar: hairline on cards, visible on the modal.
    boxShadow: `0 0 0 ${size >= 64 ? 3 : 1.5}px ${color}`,
  };
  const label = name ? `Foto de perfil de ${name}` : 'Foto de perfil';

  if (!photo) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center rounded-full ${className}`}
        style={{ ...box, backgroundColor: `${color}26`, color }}
        title={name}
        role="img"
        aria-label={name ? `${name}, sin foto de perfil` : 'Sin foto de perfil'}
      >
        <UserRound size={Math.round(size * 0.55)} />
      </span>
    );
  }

  return (
    <img
      src={photo}
      alt={label}
      title={name}
      loading="lazy"
      className={`shrink-0 rounded-full object-cover ${className}`}
      style={box}
    />
  );
}
