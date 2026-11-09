import {createEngine,tokenize} from './engine.mjs';
const intents=[
 {name:'Acceptance',pattern:/accept|belong|lonel|reject|loved|unlov|worthy|worthless|enough|shame|ashamed/i,themes:['Acceptance','Belonging','Reassurance','Grace']},
 {name:'Hope',pattern:/hope|chance|fresh|start|again|failure|failed|mistake|future/i,themes:['Hope','Second chances']},
 {name:'Reflection',pattern:/purpose|meaning|choice|reflect|review|decision|regret|kind|impact|action/i,themes:['Reflection','Purpose','Choices']},
 {name:'Love',pattern:/love|care|compassion|gentle|tender|forgiv|peace|calm|comfort|worr|anxious|anxiety|afraid/i,themes:['Love','Gentleness','Acceptance','Reassurance']},
 {name:'Relationships',pattern:/family|wife|husband|marriage|partner|relationship/i,themes:['Family']},
 {name:'Connection',pattern:/connect|jesus|christ|faith|god|presence/i,themes:['Connection','Love','Grace']}
];
const features={
 '7795-god':'Katie describes Jesus holding her hand, reviewing her life, and meeting her with love and acceptance.',
 '7880-love':'Rick connects being in Jesus’ presence with accepting love and a deeper love for his wife.',
 '8854-love':'Sarah recalls Jesus telling her she was loved.',
 '9089-love':'Kevin describes Jesus’ love as giving him a second chance.',
 '6274-love':'Jill reflects on how deeply she felt loved by Jesus.',
 '6820-love':'Mukurarinda describes Jesus showing love through touch and conversation.',
 '6538-love':'Gene describes overwhelming love in Jesus’ presence.',
 '6339-lifereview':'Odell recalls reviewing moments from his life with Jesus and reflecting on his actions.'
};
export function createDiscovery(corpus,model){
 const engine=createEngine(corpus,model);
 const shown=new Map();let turn=0;
 const markShown=id=>{if(corpus.some(r=>r.id===id))shown.set(id,++turn)};
 return {markShown,recommend(query){
  if(typeof query!=='string'||query.trim().length<1||query.length>1200)throw new Error('Please enter between 1 and 1,200 characters.');
  const requested=intents.filter(i=>i.pattern.test(query));
  const ranked=engine.search(query,{mode:'hybrid',limit:200,allowLoose:true});const scores=new Map(ranked.map(r=>[r.id,r.score]));
  const words=tokenize(query).filter(w=>!model.stopwords.includes(w)&&!['thinking','reminder','could','use','need','seeking'].includes(w));
  const looseMatch=!requested.length&&!corpus.some(r=>words.some(w=>tokenize(r.text).includes(w)));
  const explicitRequest=/\b(jesus|christ)\b/i.test(query);
  const eligible=explicitRequest?corpus.filter(r=>r.connectionType==='explicit'):corpus;
  const choices=eligible.map((r,index)=>{
   const matched=requested.filter(i=>i.themes.some(t=>r.themes.includes(t)));
   const score=(scores.get(r.id)||0)+.35*matched.length+(r.words>=30?.25:0);
   const specific=matched.filter(i=>i.name!=='Connection').map(i=>i.name.toLowerCase());
   const text=r.text.toLowerCase();
   const focus=/forgiv/.test(text)?'forgiveness':/accept/.test(text)?'being accepted':/life|review/.test(text)&&r.themes.includes('Reflection')?'the effect of our choices':/wife|family|husband/.test(text)?'love in our relationships':/connect|one with|oneness/.test(text)?'a sense of connection':/peace/.test(text)?'peace':/compassion/.test(text)?'compassion':r.themes.slice(0,2).join(' and ').toLowerCase();
   const explanation=features[r.id]||r.name.replace(/ NDE$/,'')+' shares a reflection on '+focus+'.';
   return {...r,score,looseMatch,matchExplanation:explanation,order:index};
  }).sort((a,b)=>b.score-a.score||a.order-b.order);
  if(!choices.length)return [];
  const pool=choices.filter(r=>r.score>=choices[0].score-.45);
  pool.sort((a,b)=>(shown.has(a.id)?1:0)-(shown.has(b.id)?1:0)||(shown.get(a.id)||0)-(shown.get(b.id)||0)||b.score-a.score);
  const primary=pool[0];
  const count=looseMatch?1:Math.min(5,pool.length);
  const remaining=choices.filter(r=>r.id!==primary.id&&r.score>=choices[0].score-.45);
  return [primary,...remaining.slice(0,count-1)];
 }};
}
