import fs from 'node:fs';
fs.mkdirSync('dist/market-state',{recursive:true});
for(const name of ['market-current.json','market-observations.jsonl','refresh-delta.json','market-candidates.json','market-stats.json']){
  if(fs.existsSync('data/'+name))fs.copyFileSync('data/'+name,'dist/market-state/'+name);
}
console.log('Exported market state');
