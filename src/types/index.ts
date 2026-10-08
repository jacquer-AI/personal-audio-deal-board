export type Condition='NEW'|'USED'|'B-STOCK'|'OPEN-BOX'; export type Status='LIVE VERIFIED'|'LIVE USED'|'LEAD ONLY'|'HISTORICAL'|'NON-EU / TLC'|'STALE / REVERIFY'|'MARKET COMP'|'OFFICIAL';
export interface Offer {id:string;model:string;category:string;quality:string;fit:number|null;condition:Condition;rrp:number|null;newMarket:number|null;sameMarket:number|null;price:number|null;seller:string;country:string;region:'Polska'|'UE'|'non-EU / TLC';status:Status;original:string;url:string;note:string;role:string;checked:string;refresh?:{verificationState?:string;checkedAt?:string|null;http?:number|null;firstVerifiedAt?:string|null}}
export interface Filters {search:string;category:string;conditions:string[];region:string;status:string;liveOnly:boolean;history:boolean;sort:string}
export interface Product {model:string;offers:Offer[];best:Offer}

