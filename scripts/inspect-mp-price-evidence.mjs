const pages=[
'https://www.marktplaats.nl/v/audio-tv-en-foto/koptelefoons/m2448250086-beyerdynamic-dt-1990-pro',
'https://www.marktplaats.nl/v/audio-tv-en-foto/koptelefoons/m2452042682-hifiman-ananda-nano',
'https://www.marktplaats.nl/v/audio-tv-en-foto/koptelefoons/m2450767765-hifiman-edition-xs-zgan'
];
const terms=['priceModel','modelType','askingPrice','priceType','priceCents','"FIXED"','"BID"','"MIN_BID"','bidding','Bieden','Vaste prijs','Vraagprijs','priceInfo','__NEXT_DATA__','__APOLLO_STATE__'];
for(const url of pages){
  try{
    const r=await fetch(url,{signal:AbortSignal.timeout(12000),
      headers:{'user-agent':'Mozilla/5.0 (compatible; PersonalAudioDealBoard/1.0)','accept':'text/html','accept-language':'nl-NL,nl;q=0.9'}});
    const body=(await r.text()).slice(0,2200000);
    const counts=Object.fromEntries(terms.map(t=>[t,body.toLowerCase().split(t.toLowerCase()).length-1]));
    // Print key-value enums, no user names, addresses, titles or descriptions.
    const enumHints=[...body.matchAll(/(?:"|&quot;)(?:priceType|modelType)(?:"|&quot;)\s*:\s*(?:"|&quot;)([\w -]{1,32})(?:"|&quot;)/gi)]
      .slice(0,30).map(m=>m[1]);
    const bids=[...body.matchAll(/(?:"|&quot;)(?:priceType|modelType|priceModel)(?:"|&quot;)\s*[:=]/gi)].length;
    const priceTypeAt=body.indexOf('"priceType"');
    const priceInfoAt=body.indexOf('"priceInfo"');
    const itemIds=[...body.matchAll(/"itemId"\s*:\s*"(m\d+)"/gi)].map(m=>({id:m[1],offset:m.index}));
    const compactShape=priceInfoAt>=0?body.slice(priceInfoAt,priceInfoAt+75):null;
    const dataFields=Object.fromEntries(['priceCents','askingPrice','priceType','itemId','listingId','adId'].map(k=>{
      const pattern=new RegExp('"'+k+'"\\s*:\\s*(?:"([^"]{1,80})"|([0-9]{1,12}))','i');
      const match=body.match(pattern);
      return [k,match?.[1]||match?.[2]||null];
    }));
    console.log('MP_PRICE_SCHEMA',JSON.stringify({path:new URL(url).pathname,priceTypeAt,priceInfoAt,itemIds:itemIds.slice(0,10),compactShape,dataFields}));
    console.log('MP_PUBLIC_PRICE_EVIDENCE',JSON.stringify({path:new URL(url).pathname,http:r.status,bytes:body.length,counts,enumHints,bids,
      itemIdFromUrl:new URL(url).pathname.match(/\/(m\d+)/)?.[1]||null}));
  }catch(e){console.log('MP_PUBLIC_PRICE_EVIDENCE',JSON.stringify({path:new URL(url).pathname,error:String(e).slice(0,60)}));}
}
