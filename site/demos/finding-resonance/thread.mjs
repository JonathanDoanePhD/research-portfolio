// In-memory conversation state. A reload starts a new thread.
export function createThread(){
 const entries=[];
 return {
  get entries(){return entries.slice()},
  append(query,results){
   if(typeof query!=='string'||!query.trim()||!Array.isArray(results)||!results.length)throw new Error('A prompt and story are required.');
   const entry={id:entries.length+1,query,results:results.slice(),position:0};entries.push(entry);return entry;
  },
  select(id,position){const entry=entries.find(x=>x.id===id);if(!entry||!Number.isInteger(position)||position<0||position>=entry.results.length)throw new Error('Story position is out of range.');entry.position=position;return entry;},
  get(id){return entries.find(x=>x.id===id)}
 };
}
