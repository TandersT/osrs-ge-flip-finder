/**
 * Inventory-click combinables where BOTH directions are GE-tradeable —
 * assemble or dismantle without leaving the Grand Exchange.
 *
 * Deliberately excluded (results are NOT GE-tradeable, verified against
 * /mapping): all ornament-kit variants ((or)/(g)) and assembled nightmare
 * staves — you can only sell their parts, so there is no GE arbitrage.
 */
export interface CombineDef {
  /** GE name of the assembled item. */
  result: string;
  /** GE names of the parts (use-one-on-another; dismantle reverses it). */
  pieces: string[];
}

export const COMBINES: CombineDef[] = [
  { result: 'Armadyl godsword', pieces: ['Godsword blade', 'Armadyl hilt'] },
  { result: 'Bandos godsword', pieces: ['Godsword blade', 'Bandos hilt'] },
  { result: 'Saradomin godsword', pieces: ['Godsword blade', 'Saradomin hilt'] },
  { result: 'Zamorak godsword', pieces: ['Godsword blade', 'Zamorak hilt'] },
];
