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
 * Nivel de factores que corresponde a un porcentaje de enganche.
 * Se valida primero contra el min/max del esquema: motonómina arranca su
 * primer nivel en 0 pero no acepta menos de 5% de enganche.
 */
export function nivelPara(esquemaId, enganchePct) {
  const esquema = esquemaPara(esquemaId);
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
  const enganchePct = (enganche / precio) * 100;
  const plazoMax = plazoMaximo(esquemaId);
  const factor = nivelPara(esquemaId, enganchePct).m[plazoMax];
  const montoACredito = precio - enganche;
  const pago = parcialidad({ esquemaId, montoACredito, enganchePct, plazo: plazoMax });

  return {
    precioEfectivo: precio,
    enganchePct,
    plazoMax,
    factor,
    parcialidad: pago,
    montoFinanciado: pago * plazoMax,
  };
}
