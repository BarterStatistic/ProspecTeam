import { useMemo } from 'react';
import { Flame } from 'lucide-react';
import { useData } from '../../context/DataContext.jsx';
import { sellerColor } from '../../lib/constants.js';
import { duracionCorta } from '../../lib/seguimiento.js';
import { resumenRezagados } from '../../../supabase/functions/_shared/rezagadosLogic.js';
import Card from '../ui/Card.jsx';
import Avatar from '../ui/Avatar.jsx';

/**
 * Resumen del admin: leads calientes de Alex que nadie ha tocado en 24 h o
 * más, por vendedor (`createdBy`). Es el estado de hoy, no depende del filtro
 * de fechas del Panel. La misma regla manda el push de inicio de guardia.
 */
export default function LeadsSinTocarCard() {
  const { clients, sellerColors, sellerAvatars } = useData();
  const filas = useMemo(() => resumenRezagados(clients), [clients]);
  const total = filas.reduce((n, f) => n + f.total, 0);
  const tope = Math.max(1, ...filas.map((f) => f.total));

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <Flame size={18} className={total > 0 ? 'text-state-danger' : 'text-ink-faint'} />
        <h3 className="text-sm font-semibold text-ink">Leads calientes sin tocar 24 h o más</h3>
        <span className="m-chip bg-white/5 text-ink-muted">{total}</span>
      </div>
      <p className="-mt-1 mb-3 text-xs text-ink-faint">
        Prospectos de Alex listos para comprar a los que nadie les ha escrito, por vendedor. Cada
        vendedor lo recibe como aviso al empezar su guardia (9 am y 4 pm).
      </p>
      {filas.length === 0 ? (
        <p className="rounded-xl bg-navy-900/40 px-3 py-4 text-center text-xs text-ink-faint">
          Todos los calientes están atendidos.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {filas.map((f) => {
            const color = sellerColor(f.vendedor, sellerColors);
            return (
              <li key={f.vendedor} className="flex items-center gap-3">
                <Avatar photo={sellerAvatars[f.vendedor]} name={f.vendedor} color={color} size={24} />
                <span className="w-32 shrink-0 truncate text-sm text-ink">{f.vendedor}</span>
                <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(f.total / tope) * 100}%`, background: color }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right text-sm font-semibold tabular-nums text-ink">
                  {f.total}
                </span>
                <span className="w-20 shrink-0 text-right text-[11px] text-ink-faint">
                  el más viejo {duracionCorta(f.masViejoMs)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
