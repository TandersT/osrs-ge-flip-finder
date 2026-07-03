import { describe, expect, it } from 'vitest';
import type { FlipRow } from './rows';
import { describeAlert, evaluateAlerts, metricValue, type PriceAlert } from './alerts';

function row(margin: number, buyAt = 1_000, sellAt = 1_100): FlipRow {
  return {
    id: 4151,
    flip: { buyAt, sellAt, tax: 22, marginPerItem: margin, roi: margin / buyAt, feasibleQtyPer4h: 10, profitPer4h: margin * 10, gpPerHour: null },
  } as FlipRow;
}

const alert = (over: Partial<PriceAlert>): PriceAlert => ({
  id: 'a1',
  itemId: 4151,
  itemName: 'Abyssal whip',
  icon: null,
  metric: 'margin',
  op: 'gte',
  threshold: 50,
  createdAt: 0,
  firedAt: null,
  ...over,
});

describe('evaluateAlerts', () => {
  it('fires when the condition holds', () => {
    const fired = evaluateAlerts([alert({})], new Map([[4151, row(80)]]));
    expect(fired.map((a) => a.id)).toEqual(['a1']);
    expect(evaluateAlerts([alert({})], new Map([[4151, row(20)]]))).toHaveLength(0);
  });

  it('supports lte and the buy/sell metrics', () => {
    const cheap = alert({ metric: 'buy', op: 'lte', threshold: 900 });
    expect(evaluateAlerts([cheap], new Map([[4151, row(50, 850)]]))).toHaveLength(1);
    expect(evaluateAlerts([cheap], new Map([[4151, row(50, 1_000)]]))).toHaveLength(0);
    const sellHigh = alert({ metric: 'sell', op: 'gte', threshold: 1_100 });
    expect(evaluateAlerts([sellHigh], new Map([[4151, row(50, 1_000, 1_150)]]))).toHaveLength(1);
  });

  it('skips fired (un-rearmed) alerts and unknown/priceless items', () => {
    expect(evaluateAlerts([alert({ firedAt: 123 })], new Map([[4151, row(80)]]))).toHaveLength(0);
    expect(evaluateAlerts([alert({})], new Map())).toHaveLength(0);
    const noFlip = { id: 4151, flip: null } as FlipRow;
    expect(evaluateAlerts([alert({})], new Map([[4151, noFlip]]))).toHaveLength(0);
  });

  it('metricValue and describeAlert read correctly', () => {
    expect(metricValue(row(80), 'margin')).toBe(80);
    expect(metricValue(row(80, 900), 'buy')).toBe(900);
    expect(describeAlert(alert({}))).toBe('Abyssal whip: post-tax margin ≥ 50 gp');
  });
});
