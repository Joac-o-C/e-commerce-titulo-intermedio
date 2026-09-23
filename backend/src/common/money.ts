/**
 * Los importes viajan como string decimal (así los devuelve `pg` para las
 * columnas `decimal(10,2)`). Para sumar y comparar se pasan a centavos
 * enteros: sumar floats de JS acumula error (0.1 + 0.2 !== 0.3) y un total
 * de pedido tiene que coincidir exacto con el que cobra la pasarela.
 */
export function toCents(amount: string | number): number {
  return Math.round(Number(amount) * 100);
}

export function fromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}
