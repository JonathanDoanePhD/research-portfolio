// Shared by the browser demo, evaluation, and Node validation.
export const EXPANSIONS = {
 lonely:'belonging connected together included connection', disconnected:'connection connected belonging unity', isolation:'connection belonging together',
 comfort:'peace calm love acceptance', comforting:'peace calm love acceptance', grief:'family mother father loved loss', grieving:'family loved mother father',
 forgiveness:'love acceptance judged hurt choices', forgive:'acceptance judged love', kindness:'love help smile generous compassion',
 purpose:'meaning choices needed lives help', impact:'affected touched others choices action', peaceful:'peace calm contentment',
 skeptical:'uncertain understand question', skeptic:'uncertain question', christian:'Jesus Christ', empathy:'perspective others relationships felt',
 ashamed:'judged acceptance love', shame:'judged acceptance love', reunion:'family friend together loved', grandmother:'grandmother family loved',
 anxious:'peace calm comfort', anxiety:'peace calm comfort', accepting:'acceptance inclusive love', accepted:'acceptance included love'
};
export const tokenize = s => (s.toLowerCase().match(/[a-z]{2,}/g)||[]);
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const norm=a=>{const d=Math.hypot(...a)||1;return a.map(v=>v/d)};
export function createEngine(corpus, model){
 const stops=new Set(model.stopwords), vocab=model.vocabulary;
 const lengths=corpus.map(r=>tokenize(r.text).filter(w=>!stops.has(w)).length);
 const avg=lengths.reduce((a,b)=>a+b,0)/lengths.length;
 const counts=corpus.map(r=>{const c={};for(const w of tokenize(r.text))if(!stops.has(w))c[w]=(c[w]||0)+1;return c});
 const df={};for(const c of counts)for(const w of Object.keys(c))df[w]=(df[w]||0)+1;
 const queryVector=query=>{
  const freq={};for(const w of tokenize(query))if(!stops.has(w)&&vocab[w]!==undefined)freq[vocab[w]]=(freq[vocab[w]]||0)+1;
  const v=Object.entries(freq).map(([i,c])=>[+i,(1+Math.log(c))*model.idf[i]]);
  const d=Math.sqrt(v.reduce((s,[,x])=>s+x*x,0))||1;
  return norm(model.components.map(comp=>v.reduce((s,[i,x])=>s+comp[i]*x/d,0)));
 };
 function search(query,{mode='hybrid',gentle=false,lessReligion=false,short=false,liked=[],dismissed=[],limit=6,allowLoose=false}={}){
  if(typeof query!=='string'||query.trim().length<1||query.length>1200)throw new Error('Enter between 1 and 1,200 characters.');
  if(!['keyword','semantic','hybrid'].includes(mode))throw new Error('Unknown retrieval method.');
  if(!Number.isInteger(limit)||limit<1||limit>200)throw new Error('Invalid result limit.');
  const words=[...new Set(tokenize(query).filter(w=>!stops.has(w)))];
  const expanded=query+' '+words.map(w=>EXPANSIONS[w]||'').join(' ');
  const q=queryVector(expanded);
  const keyword=counts.map((c,j)=>words.reduce((sum,w)=>{const tf=c[w]||0;if(!tf)return sum;const idf=Math.log(1+(corpus.length-(df[w]||0)+.5)/((df[w]||0)+.5));return sum+idf*(tf*2.2)/(tf+1.2*(.25+.75*lengths[j]/avg));},0));
  const max=Math.max(...keyword,1e-12);
  const semantic=model.vectors.map(v=>Math.max(0,dot(q,v)));
  const likedIdx=liked.map(id=>corpus.findIndex(r=>r.id===id)).filter(i=>i>=0);
  const dismissedSet=new Set(dismissed);const candidates=[];
  for(let i=0;i<corpus.length;i++){
   const r=corpus[i]; if(dismissedSet.has(r.id)||(gentle&&r.intense)||(lessReligion&&r.religious)||(short&&r.words>80))continue;
   const bm=keyword[i]/max,sem=semantic[i];
   // No query match means abstention, even when a liked result would add a boost.
   if(!allowLoose&&(mode==='keyword'?keyword[i]===0:sem<.16&&bm===0))continue;
   const feedback=likedIdx.length?Math.max(0,...likedIdx.map(j=>dot(model.vectors[i],model.vectors[j])))*.12:0;
   const score=mode==='keyword'?bm:mode==='semantic'?sem:.4*bm+.6*sem+feedback;
   const matchingWords=words.filter(w=>counts[i][w]);
   const expandedWords=tokenize(expanded).filter(w=>!words.includes(w)&&counts[i][w]);
   const sentences=r.text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)||[r.text];
   const evidence=sentences.map(s=>({s:s.trim(),v:tokenize(s).filter(w=>words.includes(w)).length*2+tokenize(s).filter(w=>expandedWords.includes(w)).length})).sort((a,b)=>b.v-a.v)[0].s;
   candidates.push({...r,score,keywordScore:bm,semanticScore:sem,feedbackBoost:mode==='hybrid'?feedback:0,matchingWords:[...new Set(matchingWords)],expandedWords:[...new Set(expandedWords)],evidence,reason:matchingWords.length?'Matches your words: '+matchingWords.slice(0,4).join(', '):expandedWords.length?'Related wording: '+[...new Set(expandedWords)].slice(0,4).join(', '):'Related language in the corpus-trained semantic model. Review the excerpt to judge its fit.'});
  }
  candidates.sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
  // Avoid showing several excerpts from the same account in one recommendation set.
  const seen=new Set();return candidates.filter(r=>{if(seen.has(r.registry))return false;seen.add(r.registry);return true}).slice(0,limit);
 }
 return {search,corpus,model};
}
