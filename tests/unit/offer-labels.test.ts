import {describe,it,expect} from 'vitest';
import {conditionLabel,offerStatusLabel} from '../../src/lib/offerLabels';

describe('condition vs availability language',()=>{
  it('always distinguishes physical state from seller verification',()=>{
    expect(conditionLabel('NEW')).toBe('NOWE');
    expect(conditionLabel('USED')).toBe('UŻYWANE');
    expect(conditionLabel('B-STOCK')).toContain('ZWROCIE');
    expect(conditionLabel('OPEN-BOX')).toBe('OTWARTE OPAKOWANIE');
    expect(conditionLabel('usato')).toBe('UŻYWANE');
    expect(conditionLabel(undefined)).toBe('STAN NIEUSTALONY');
    expect(conditionLabel('something vague')).toBe('STAN NIEUSTALONY');
    expect(offerStatusLabel('LIVE USED',true)).toBe('OFERTA POTWIERDZONA');
    expect(offerStatusLabel('LIVE USED',false)).toBe('AKTUALNOŚĆ NIEPOTWIERDZONA');
    expect(offerStatusLabel('LEAD ONLY',false)).toBe('TROP DO SPRAWDZENIA');
  });
});
