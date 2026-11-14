// Destinos de la navegación, compartidos por el menú lateral (computadora),
// la barra inferior y la hoja "Más" (celular) y los atajos de teclado, para
// que los tres muestren lo mismo y respeten los mismos permisos.
import {
  Sun,
  Users,
  Route,
  CalendarDays,
  CheckCircle2,
  XCircle,
  BarChart3,
  Wallet,
  UserRound,
  Calculator,
  ScanLine,
  Bike,
} from 'lucide-react';
import { canViewSection } from '../../lib/permissions.js';

export const DESTINOS = [
  { id: 'midia', label: 'Mi día', icon: Sun, grupo: 'clientes', tecla: 'M' },
  { id: 'prospectos', label: 'Prospectos', icon: Users, grupo: 'clientes', tecla: '1' },
  { id: 'procesos', label: 'Procesos', icon: Route, grupo: 'clientes', tecla: '2' },
  { id: 'citas', label: 'Citas', icon: CalendarDays, grupo: 'clientes', tecla: '3' },
  { id: 'ventas', label: 'Ventas', icon: CheckCircle2, grupo: 'clientes', tecla: '4' },
  { id: 'cancelados', label: 'Cancelados', icon: XCircle, grupo: 'clientes' },
  { id: 'admin', label: 'Panel ADMIN', icon: BarChart3, grupo: 'negocio', tecla: 'A' },
  { id: 'comisiones', label: 'Comisiones', icon: Wallet, grupo: 'negocio' },
  { id: 'usuarios', label: 'Gestor de usuarios', icon: UserRound, grupo: 'negocio' },
  { id: 'cotizador', label: 'Cotizador PT', icon: Calculator, grupo: 'herramientas', tecla: 'C' },
  { id: 'buro', label: 'Buró Automático', icon: ScanLine, grupo: 'herramientas' },
  { id: 'disponibilidad', label: 'Disponibilidad de motos', icon: Bike, grupo: 'herramientas', tecla: 'D' },
];

export const GRUPOS = [
  { id: 'clientes', label: 'Clientes' },
  { id: 'negocio', label: 'Negocio' },
  { id: 'herramientas', label: 'Herramientas' },
];

/** Destinos que este rol puede abrir, en el orden del menú. */
export function destinosDe(role) {
  return DESTINOS.filter((d) => canViewSection(role, d.id));
}

/** Los que van fijos en la barra inferior del celular (máximo cuatro). */
export function destinosDeBarra(role) {
  return destinosDe(role)
    .filter((d) => ['midia', 'prospectos', 'procesos', 'citas'].includes(d.id))
    .slice(0, 4);
}
