// Matemática del cotizador: de moto + esquema + enganche a la parcialidad y el
// monto financiado. Puro y determinista — sin React, sin store, sin fechas.
//
// "Monto financiado" es la suma de TODOS los pagos del crédito al plazo más
// largo del esquema (la parcialidad más baja), que es la base sobre la que se
// calcula la comisión. No es el precio de la moto ni el saldo a crédito.

import { SCHEMES, motoPorNombre } from './motos.js';

/** Precio de lista más el servicio preventivo cuando va incluido. */
export function precioEfectivo(moto, incluyeServicio) {
  return moto.precio + (incluyeServicio ? moto.servicio : 0);
}

function esquemaPara(esquemaId) {
  const esquema = SCHEMES[esquemaId];
  if (!esquema) throw new Error(`Esquema de crédito desconocido: "${esquemaId}".`);
  return esquema;
}

/**
 * Porcentaje de enganche redondeado a 2 decimales. Las bandas del catálogo
 * tienen huecos ([0, 24.99] / [25, 29.99]): un enganche capturado en pesos da
 * un porcentaje como 29.9968% que no cae en ninguna. El cotizador vigente
 * (Cotizadores/cotizador-pt) redondea igual: Math.round(dp * 100) / 100.
 */
export function redondearPct(pct) {
  return Math.round(pct * 100) / 100;
}

/**
 * Nivel de factores que corresponde a un porcentaje de enganche.
 * Se valida primero contra el min/max del esquema: motonómina arranca su
 * primer nivel en 0 pero no acepta menos de 5% de enganche.
 * El porcentaje se redondea a 2 decimales antes de validar y de buscar nivel.
 */
export function nivelPara(esquemaId, pct) {
  const esquema = esquemaPara(esquemaId);
  const enganchePct = redondearPct(pct);
  if (enganchePct < esquema.min || enganchePct > esquema.max) {
    throw new RangeError(
      `${esquema.label} acepta enganches entre ${esquema.min}% y ${esquema.max}%; ` +
        `se recibió ${enganchePct.toFixed(2)}%.`,
    );
  }
  const nivel = esquema.levels.find(
    ({ range }) => enganchePct >= range[0] && enganchePct <= range[1],
  );
  if (!nivel) {
    throw new RangeError(
      `${esquema.label} no tiene un nivel de factores para ${enganchePct.toFixed(2)}%.`,
    );
  }
  return nivel;
}

/** Plazo más largo del esquema — el que produce la parcialidad más baja. */
export function plazoMaximo(esquemaId) {
  return esquemaPara(esquemaId).terms.at(-1);
}

/** Pago por periodo para un saldo a crédito, a un plazo dado. */
export function parcialidad({ esquemaId, montoACredito, enganchePct, plazo }) {
  const factor = nivelPara(esquemaId, enganchePct).m[plazo];
  if (factor === undefined) {
    throw new RangeError(`El plazo ${plazo} no existe en ${esquemaId}.`);
  }
  return montoACredito * factor;
}

/**
 * Cálculo completo para una venta facturada.
 * `enganche` es un MONTO EN PESOS, no un porcentaje.
 */
export function calcularFinanciamiento({
  motoNombre,
  incluyeServicio,
  esquemaId,
  enganche,
}) {
  const moto = motoPorNombre(motoNombre);
  if (!moto) throw new Error(`La moto "${motoNombre}" no está en el catálogo.`);

  const precio = precioEfectivo(moto, !!incluyeServicio);
  // Redondeado aquí para que el porcentaje devuelto sea el mismo que eligió el nivel.
  const enganchePct = redondearPct((enganche / precio) * 100);
  const plazoMax = plazoMaximo(esquemaId);
  const factor = nivelPara(esquemaId, enganchePct).m[plazoMax];
  const montoACredito = precio - enganche;
  // Redondeada al peso entero, como la publica la tabla oficial de Dinamo y el
  // cotizador vigente (Math.round(fin * lvl.m[t])): el monto financiado —y por
  // tanto la comisión— sale de la misma cifra que ve el cliente.
  const pago = Math.round(
    parcialidad({ esquemaId, montoACredito, enganchePct, plazo: plazoMax }),
  );

  return {
    precioEfectivo: precio,
    enganchePct,
    plazoMax,
    factor,
    parcialidad: pago,
    montoFinanciado: pago * plazoMax,
  };
}
