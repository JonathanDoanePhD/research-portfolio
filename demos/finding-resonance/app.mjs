import {createDiscovery} from './discovery.mjs';
import {createThread} from './thread.mjs';
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const thread=createThread();let discovery;
function render(entry){
 const r=entry.results[entry.position];discovery.markShown(r.id);
 const paragraphs=r.text.length>500?r.text.split(/(?<=\.) (?=Jesus would)/):[r.text];
 $(`story-${entry.id}`).innerHTML=`<div class="response-heading"><p class="story-label">${r.connectionType==='explicit'?'JESUS EXPLICITLY NAMED':'THEMATIC REFLECTION'}</p><span class="response-number">${entry.results.length===1?'1 story':`${entry.position+1} / ${entry.results.length}`}</span></div><h2 id="story-title-${entry.id}" class="story-title">${esc(r.title)}</h2><p class="byline">${esc(r.name.replace(/ NDE$/,''))} · Personal account excerpt</p><blockquote class="story-text">${paragraphs.map(p=>`<p>${esc(p)}</p>`).join('')}</blockquote><details class="why"><summary>Why this <mark>fits</mark><span class="theme-note">${r.themes.slice(0,2).map(esc).join(' · ')}</span></summary><p>${esc(r.matchExplanation)}</p></details><div class="source-credit"><div><span>Shared by ${esc(r.name.replace(/ NDE$/,''))} · <abbr title="Near-Death Experience Research Foundation">NDERF</abbr></span><a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">Read the original account</a><a href="${esc(r.source)}" target="_blank" rel="noopener noreferrer">View the source list</a></div><p class="source-note">Public-domain excerpt. The linked full account may contain more intense material.</p></div>${entry.results.length>1?`<nav class="variants" aria-label="Similar stories for prompt ${entry.id}"><span>Similar stories</span><button data-action="previous" data-entry="${entry.id}" aria-label="Previous story for prompt ${entry.id}" ${entry.position===0?'disabled':''}>‹</button><span class="variant-count" aria-live="polite">${entry.position+1} / ${entry.results.length}</span><button data-action="next" data-entry="${entry.id}" aria-label="Next story for prompt ${entry.id}" ${entry.position===entry.results.length-1?'disabled':''}>›</button></nav>`:''}`;
}
function jump(id){const turn=$(`turn-${id}`);if(turn){$('jump-to-prompt').value=String(id);turn.scrollIntoView({behavior:'instant',block:'start'});const title=$(`story-title-${id}`);title.setAttribute('tabindex','-1');title.focus({preventScroll:true})}}
function search(query){
 if(!discovery)return [];
 try{
  const results=discovery.recommend(query),entry=thread.append(query.trim(),results);
  const turn=document.createElement('section');turn.className='conversation-turn';turn.id=`turn-${entry.id}`;turn.setAttribute('aria-label',`Prompt ${entry.id}`);
  turn.innerHTML=`<div class="question"><span>${esc(entry.query)}</span></div><article id="story-${entry.id}" class="story-response" aria-labelledby="story-title-${entry.id}"></article>`;
  $('thread').append(turn);render(entry);
  const option=document.createElement('option');option.value=String(entry.id);option.textContent=`${entry.id}. ${entry.query}`;$('jump-to-prompt').append(option);$('jump-to-prompt').value=String(entry.id);$('thread-navigation').hidden=thread.entries.length<2;
  $('welcome').hidden=true;$('examples').hidden=true;$('main').classList.add('reading-mode');$('reading').hidden=false;$('status').textContent='';$('prompt').value='';$('prompt').placeholder='What else is on your heart?';
  jump(entry.id);return results;
 }catch(e){$('status').textContent=e.message;return []}
}
$('search-form').addEventListener('submit',e=>{e.preventDefault();search($('prompt').value)});
document.querySelectorAll('[data-example]').forEach(b=>b.addEventListener('click',()=>search(b.dataset.example)));
$('thread').addEventListener('click',e=>{const button=e.target.closest('[data-action]');if(!button||button.disabled)return;const entry=thread.get(Number(button.dataset.entry));if(!entry)return;thread.select(entry.id,entry.position+(button.dataset.action==='next'?1:-1));render(entry);const replacement=$(`story-${entry.id}`).querySelector(`[data-action="${button.dataset.action}"]`);replacement?.focus({preventScroll:true})});
$('jump-to-prompt').addEventListener('change',e=>jump(Number(e.target.value)));
$('home').addEventListener('click',()=>{if(thread.entries.length){jump(1)}else{$('prompt').focus()}});
$('sources-button').addEventListener('click',()=>$('sources').showModal());$('close-sources').addEventListener('click',()=>$('sources').close());
async function loadJSON(url){const r=await fetch(url);if(!r.ok)throw new Error('Unable to load stories');return r.json()}
try{const [corpus,model]=await Promise.all(['corpus.json','model.json'].map(loadJSON));discovery=createDiscovery(corpus,model);$('submit').disabled=false;$('status').textContent='';
 if(document.modelContext?.registerTool){const life=new AbortController();window.addEventListener('pagehide',()=>life.abort(),{once:true});Promise.resolve(document.modelContext.registerTool({name:'discover_experience_excerpts',title:'Find a Jesus-centered story',description:'Find reviewed story excerpts and append the first recommendation to the conversation.',inputSchema:{type:'object',properties:{query:{type:'string',minLength:1,maxLength:1200}},required:['query'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute(input){if(!input||typeof input.query!=='string'||Object.keys(input).some(k=>k!=='query'))throw new Error('Invalid query');const r=search(input.query);return {count:r.length,results:r.map(x=>({id:x.id,title:x.title,reason:x.matchExplanation}))}}},{signal:life.signal})).catch(()=>{});}
}catch(e){$('status').textContent='The stories could not load. Please refresh to try again.';$('submit').textContent='Try refreshing'}
