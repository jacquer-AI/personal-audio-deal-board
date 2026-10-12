export type PagesRunReceipt={
  name?:string|null;
  display_title?:string|null;
  created_at:string;
  status:string;
  conclusion:string|null;
  head_commit?:{message?:string|null}|null;
};

/** Do not report refresh success from an unrelated Pages build.
 * The deployed commit must be the data commit created by THIS market scan. */
export function pagesForMarketRun<T extends PagesRunReceipt>(
  pages:T[], market:{id:number;created_at:string}
):T|undefined{
  const started=Date.parse(market.created_at);
  if(!Number.isFinite(started)||!Number.isSafeInteger(market.id)||market.id<=0)return undefined;
  const title=new RegExp('^data: market refresh (?:quick|full|deep) \\('+market.id+'\\)(?:\\n|$)');
  return pages.find(p=>p.name==='Verify and deploy audio board'&&
    Number.isFinite(Date.parse(p.created_at))&&Date.parse(p.created_at)>=started&&
    title.test(p.head_commit?.message||''));
}
