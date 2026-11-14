import { useMemo } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useData } from '../../context/DataContext.jsx';
import { canSeeClient, canViewMiDia, isAdmin } from '../../lib/permissions.js';
import { contarCitasDeHoy } from '../../lib/citas.js';
import { colaDelDia, pendientesDelDia } from '../../lib/seguimiento.js';

/**
 * Contadores de la navegación, por id de destino. Solo cuenta lo que este
 * usuario puede ver (un vendedor ve únicamente sus propios cancelados).
 * `destacado` marca los que piden atención hoy (se pintan en dorado).
 */
export function useBadges() {
  const { user, role } = useAuth();
  const { clients, citas } = useData();

  return useMemo(() => {
    const badges = {};
    for (const c of clients) {
      if (!canSeeClient(role, c, user?.username)) continue;
      badges[c.section] = (badges[c.section] ?? 0) + 1;
    }
    badges.citas = contarCitasDeHoy(citas);
    if (canViewMiDia(role)) {
      badges.midia = pendientesDelDia(
        colaDelDia(clients, citas, { username: user?.username, esAdmin: isAdmin(role) }),
      );
    }
    const destacado = { citas: badges.citas > 0, midia: (badges.midia ?? 0) > 0 };
    return { badges, destacado };
  }, [clients, citas, role, user?.username]);
}
