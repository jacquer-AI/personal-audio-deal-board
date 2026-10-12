/**
 * An offer initially promoted from discovery must never retain LIVE after
 * an unsuccessful direct-page recheck, even before the 8h freshness timer.
 * Historical asking price survives for research, not as current stock.
 */
export function applyAdditionRecheck(a,u,now){
  const first=a.refresh?.firstVerifiedAt||a.refresh?.checkedAt||now;
  const originalVerifiedAt=a.refresh?.lastVerifiedAt||
    (a.refresh?.verificationState==='DIRECT_OFFER_VERIFIED'?a.refresh?.checkedAt:null)||
    first;
  const preserved={
    ...a.refresh,firstVerifiedAt:first,lastVerifiedAt:originalVerifiedAt
  };
  const reason=u?.verificationState||'RECHECK_TIMEOUT';
  if(u?.status==='HISTORICAL')return {
    ...a,status:'HISTORICAL',role:'HISTORICAL',checked:u.checked,
    refresh:{...preserved,verificationState:'DIRECT_OFFER_VERIFIED',
      http:u.http,checkedAt:now,lastVerifiedAt:now}
  };
  if(u?.verificationState==='DIRECT_OFFER_VERIFIED'&&
     ['LIVE USED','LIVE VERIFIED'].includes(u.status)&&
     Number.isFinite(u.price)&&u.price>0){
    return {
      ...a,status:u.status,role:'OFFER',price:u.price,
      original:u.original||a.original,checked:u.checked,
      refresh:{...preserved,verificationState:'DIRECT_OFFER_VERIFIED',
        http:u.http,checkedAt:now,lastVerifiedAt:now}
    };
  }
  // Do not renew last successful evidence on a blocked/ambiguous/dead/timeout
  // response. A stale listing is visible for research only, not buyable.
  // A new explicit seller refusal supersedes the old UNKNOWN shipping quote.
  const shippingCorrection=reason==='PL_SHIPPING_EXCLUDED'?{
    shippingToPoland:'PL_EXPLICITLY_EXCLUDED',shippingRate:null,
    shippingCurrency:null,shippingRatePln:null,itemPlusShippingPln:null,
    shippingSource:'SELLER_DESCRIPTION',
    note:[a.note,u?.note].filter(Boolean).join(' · ')
  }:{};
  return {
    ...a,...shippingCorrection,status:'STALE / REVERIFY',role:'OFFER',
    refresh:{...preserved,verificationState:reason,http:u?.http??null,
      checkedAt:a.refresh?.checkedAt||first,lastAttemptAt:now}
  };
}
/** Match exactly the same seller item. A redirected login/search/different
 * product page never proves the original offer is still available. */
export function sameSellerItemUrl(requested,actual){
  try{
    const req=new URL(requested),got=new URL(actual);
    return req.protocol==='https:'&&got.protocol==='https:'&&
      req.hostname.toLowerCase()===got.hostname.toLowerCase()&&
      req.pathname.replace(/\/+$/,'')===got.pathname.replace(/\/+$/,'');
  }catch{return false}
}
