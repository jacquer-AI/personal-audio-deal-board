import {describe,it,expect} from 'vitest';
import {toNumber,toPln} from '../../scripts/sources/common.mjs';

describe('localized direct-seller price parsing',()=>{
  it('parses EU and US thousands, spaces, decimals and currency decorations',()=>{
    expect(toNumber('1.234,56 €')).toBe(1234.56);
    expect(toNumber('€ 1.234,56')).toBe(1234.56);
    expect(toNumber('$1,234.56')).toBe(1234.56);
    expect(toNumber('1 234,56 zł')).toBe(1234.56);
    expect(toNumber('1.999')).toBe(1999);
    expect(toNumber('1,999')).toBe(1999);
    expect(toNumber('999,00')).toBe(999);
    expect(toNumber('9310.38')).toBe(9310.38);
    expect(toNumber('1.234.567')).toBe(1234567);
    expect(toNumber(12.34)).toBe(12.34);
  });
  it('rejects empty or malformed values and never guesses unknown FX',()=>{
    expect(toNumber('')).toBeNull();
    expect(toNumber('error')).toBeNull();
    expect(toNumber(0)).toBeNull();
    expect(toNumber(-1)).toBeNull();
    expect(toNumber(Infinity)).toBeNull();
    expect(toPln(100,'JPY',{EUR:4})).toBeNull();
  });
});
