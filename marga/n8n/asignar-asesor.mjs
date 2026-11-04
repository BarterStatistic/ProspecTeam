// Turno del vendedor que atiende a un cliente de Alex (hora de Saltillo).
// Fuente de verdad del código que se pega en el nodo "Asignar Asesor" del flujo
// ALEX 3.2 en n8n: al pegarlo allá se quita solo la palabra `export`.
//
//   Lunes a viernes: Alejandro 9:00–16:00, Emmanuel 16:00–22:00.
//   Sábado: todo el día Emmanuel (Alejandro descansa).
//   Domingo: todo el día Alejandro (Emmanuel descansa).
//   Fuera de horario (22:00–9:00): conversación par → Alejandro, impar → Emmanuel,
//   salvo sábado (siempre Emmanuel) y domingo (siempre Alejandro).

export function asignarAsesor(tsSegundos, conversationId) {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Monterrey',
    weekday: 'short',
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(new Date(tsSegundos * 1000));
  const dia = partes.find((p) => p.type === 'weekday').value; // Mon … Sun
  const hora = Number(partes.find((p) => p.type === 'hour').value);

  let asesor;
  let fueraDeHorario = false;
  if (dia === 'Sat') {
    asesor = 'emmanuel';
  } else if (dia === 'Sun') {
    asesor = 'alejandro';
  } else if (hora >= 9 && hora < 16) {
    asesor = 'alejandro';
  } else if (hora >= 16 && hora < 22) {
    asesor = 'emmanuel';
  } else {
    fueraDeHorario = true;
    asesor = Number(conversationId) % 2 === 0 ? 'alejandro' : 'emmanuel';
  }

  // Sábado y domingo no hay horario partido: solo "fuera de horario" si es de noche/madrugada.
  if ((dia === 'Sat' || dia === 'Sun') && (hora < 9 || hora >= 22)) fueraDeHorario = true;

  const username = asesor === 'alejandro' ? 'Alejandro Acosta' : 'Emmanuel Bernal';
  return { asesor, username, fueraDeHorario };
}
