import {describe,it,expect} from 'vitest';
import {SOURCES,parseCeneoIndex,applyRetailChecks,refreshRetail} from '../../scripts/refresh-retail-references.mjs';
import snapshot from '../../data/retail-price-references.json';
const html=(title,hero,other='')=>'<html><head><title>Ceneo</title></head><body><h1>'+title+'</h1><div>Oferty (27) <strong>'+hero+'</strong></div><h2>Wybrane oferty firm</h2>'+other+'</body></html>';
const date='2026-10-12T10:00:00+02:00';
describe('scheduled retail price index: never a confirmed retail offer',()=>{
  it('takes only the matching product header, not ads or different seller variants',()=>{
    const source=SOURCES[0];
    const t='<h2>Reklama inne słuchawki 99,00 zł</h2>'+html('Beyerdynamic DT880 PRO','699,01 zł','<p>DT 880 Pro 250 Ohm 645,00 zł</p>');
    expect(parseCeneoIndex(t,source)).toMatchObject({pricePln:699.01,method:'PRODUCT_HEADER_PLN'});
  });
  it('recognizes exact catalog names and Polish price separators',()=>{
    expect(parseCeneoIndex(html('AKG K702','679,00zł'),SOURCES[1]).pricePln).toBe(679);
    expect(parseCeneoIndex(html('HiFiMAN Edition XS','1 099,00 PLN'),SOURCES[2]).pricePln).toBe(1099);
  });
  it('rejects wrong product, blocked html, currency without PLN and unrelated numeric ad',()=>{
    expect(parseCeneoIndex(html('Beyerdynamic DT 990 PRO','699,01 zł'),SOURCES[0]).error).toBe('WRONG_PRODUCT_TITLE');
    expect(parseCeneoIndex(html('AKG K702','499 EUR'),SOURCES[1]).error).toBe('NO_PRODUCT_SCOPED_PLN_PRICE');
    expect(parseCeneoIndex('<html>captcha</html>',SOURCES[1]).error).toBe('BLOCKED_OR_EMPTY');
    expect(parseCeneoIndex(html('AKG K702','123 rata'),SOURCES[1]).error).toBe('NO_PRODUCT_SCOPED_PLN_PRICE');
  });
  it('accepts structured product prices only from matching products',()=>{
    const h='<html><body><h1>AKG K702</h1><div>Oferty firm</div>'+
      '<script type="application/ld+json">'+JSON.stringify({'@type':'Product',name:'AKG K702',
        offers:{'@type':'AggregateOffer',lowPrice:'725.00',priceCurrency:'PLN'}})+'</script></body></html>';
    expect(parseCeneoIndex(h,SOURCES[1])).toMatchObject({pricePln:725,method:'PRODUCT_JSONLD_PLN'});
    expect(parseCeneoIndex(h.replace('AKG K702","offers','AKG K701","offers'),SOURCES[1]).error)
      .toBe('NO_PRODUCT_SCOPED_PLN_PRICE');
  });
  it('updates confirmed index reads, never modifies original offer-market benchmarking',()=>{
    const before=JSON.parse(JSON.stringify(snapshot));
    const checks=new Map(SOURCES.map(s=>[s.model,{pricePln:s.model==='AKG K702'?699:700,method:'PRODUCT_HEADER_PLN'}]));
    const r=applyRetailChecks(before,checks,date);
    expect(r.changed).toBe(true);
    expect(r.doc.references.find(x=>x.model==='AKG K702').pricePln).toBe(699);
    expect(r.doc.references.find(x=>x.model==='Beyerdynamic DT 880').variant).toContain('nieustalona');
    expect(before.references.find(x=>x.model==='AKG K702').pricePln).toBe(679);
  });
  it('preserves original price and date during HTTP blocks or implausible price jumps',()=>{
    const blocked=applyRetailChecks(snapshot,new Map(SOURCES.map(s=>[s.model,{error:'HTTP_403'}])),date);
    expect(blocked.changed).toBe(false);
    expect(blocked.doc).toEqual(snapshot);
    const spike=applyRetailChecks(snapshot,new Map([['AKG K702',{pricePln:23000,method:'PRODUCT_HEADER_PLN'}]]),date);
    expect(spike.changed).toBe(false);
    expect(spike.audit.find(x=>x.model==='AKG K702').status).toBe('PRICE_ANOMALY_KEEP_OLD');
  });
  it('does not advance timestamp for identical within 24h, renews real confirmation later',()=>{
    const sample=new Map([['AKG K702',{pricePln:679,method:'PRODUCT_HEADER_PLN'}]]);
    const close=applyRetailChecks(snapshot,sample,'2026-10-12T07:40:00+02:00');
    expect(close.changed).toBe(false);
    const later=applyRetailChecks(snapshot,sample,'2026-10-14T07:40:00+02:00');
    expect(later.changed).toBe(true);
  });
  it('uses verified single page HTTP200; redirect or access denial never becomes fresh',async()=>{
    const response={url:SOURCES[0].url,status:200,headers:{get:()=> 'text/html'},text:async()=>html('Beyerdynamic DT880 PRO','699,01 zł')};
    const fetcher=async url=>url===SOURCES[0].url?response:
      {url,status:403,headers:{get:()=> 'text/html'},text:async()=>''};
    const r=await refreshRetail({fetcher,now:date,dryRun:true});
    expect(r.changed).toBe(false);
    expect(r.audit.find(x=>x.model==='Beyerdynamic DT 880').pricePln).toBe(699.01);
    expect(r.audit.filter(x=>x.status==='HTTP_403')).toHaveLength(2);
  });
});
