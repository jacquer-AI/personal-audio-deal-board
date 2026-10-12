import {describe,it,expect} from 'vitest';
import {marketplaces,watchMarketplaces,additionalWatchModels,uniqueWatchModels,trackedModelCount} from '../../src/lib/marketSearch';

describe('market breadth without invented offers',()=>{
  it('opens eight distinct marketplace searches with Unicode model names',()=>{
    expect(marketplaces.map(m=>m.id)).toEqual(['hifishark','vinted','olx','allegro','subito','marktplaats','ebay','kleinanzeigen']);
    for(const m of marketplaces){
      const url=new URL(m.url('Beyerdynamic DT 880'));
      expect(url.protocol).toBe('https:');
      expect(url.href).toContain('Beyerdynamic');
      expect(url.href).toContain('DT');
    }
    expect(marketplaces[1].url('')).toContain('s%C5%82uchawki');
    expect(marketplaces[0].url('Sony MDR-SA5000')).toContain('Sony%20MDR-SA5000');
    expect(watchMarketplaces.map(m=>m.id)).toEqual(['hifishark','vinted','subito','marktplaats']);
    expect(marketplaces.find(m=>m.id==='subito')!.url('DT 48 25 Ω')).toContain('25%20%CE%A9');
    expect(marketplaces.find(m=>m.id==='marktplaats')!.url('DT 48 25 Ω')).toContain('25%20%CE%A9');
  });
  it('does not count search-only models as offers or duplicate registered ones',()=>{
    expect(additionalWatchModels).toContain('Sony MDR-SA5000');
    expect(additionalWatchModels[0]).toBe('Beyerdynamic DT 48 25 Ohm');
    expect(additionalWatchModels).toContain('Etymotic ER4SR');
    expect(additionalWatchModels).toContain('Sennheiser HD 800 S');
    expect(trackedModelCount).toBe(56);
    for(const model of ['Beyerdynamic DT 48 25 Ohm','Sony MDR-CD900ST','Sony MDR-M1','Austrian Audio Hi-X65','Austrian Audio Hi-X60','Neumann NDH 30','Audio-Technica ATH-M70x','Focal Clear OG']){
      expect(additionalWatchModels).toContain(model);
    }
    expect(new Set(additionalWatchModels).size).toBe(trackedModelCount);
    const rest=uniqueWatchModels(['Sony MDR-SA5000','Beyerdynamic DT 880']);
    expect(rest).not.toContain('Sony MDR-SA5000');
    expect(rest).not.toContain('Beyerdynamic DT 880');
    expect(new Set(rest).size).toBe(rest.length);
  });
});
