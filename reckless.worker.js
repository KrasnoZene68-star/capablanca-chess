/* Reckless Capablanca 1.0, AGPL-3.0. Corresponding source: reckless-source-v1.0.zip */
'use strict';
let engine=null,initializing=null,lastGeneration=null;const RULES={classic:0,kingKnight:1,escape:2,both:3};
function canonical(fen){const a=fen.trim().split(/\s+/);if(a[3]!=='-')a[3]=(a[3].match(/[a-j](?:10|[1-9])/g)||[]).sort().join('');return a.join(' ')}
async function initialize(){
 if(engine)return;if(initializing)return initializing;
 initializing=(async()=>{
  importScripts('./reckless.js?v=5.11.0');await wasm_bindgen({module_or_path:'./reckless.wasm?v=5.11.0'});engine=new wasm_bindgen.Engine();
  const probes=[['9k/10/10/10/4K5/10/10/10 w - - 0 1',1,16],['r8k/10/10/10/10/2b7/10/KN8 w - - 0 1',2,1],['rr7k/10/10/10/10/2b7/10/KN8 w - - 0 1',2,0],['r8k/10/10/10/3n6/2b7/10/KN8 w - - 0 1',3,1],['9k/10/10/10/10/10/10/10/P9/5K4 w - - 0 1 t2,2',0,8]];
  for(const[fen,rule,n]of probes){engine.set_position(fen,rule,'');if(engine.perft(1)!==n)throw new Error('Reckless не пройшов перевірку правил')}
 })();
 try{await initializing}catch(e){if(engine){engine.free();engine=null}initializing=null;throw e}
}
function chooseMove(level){const best=engine.last_bestmove();if(level>=15)return best;
 const list=engine.candidates().split(' ').filter(Boolean).map(s=>{const[move,score]=s.split(':');return{move,score:Number(score)}});if(list.length<2)return best;
 const top=Math.max(...list.map(x=>x.score));if(Math.abs(top)>30000)return best;
 // Training profiles use searched alternatives. Never weaken a forced mate.
 const temperature=20+(15-level)*22,maxLoss=80+(15-level)*42,candidates=list.filter(x=>top-x.score<=maxLoss&&Math.abs(x.score)<30000),weights=candidates.map(x=>Math.exp((x.score-top)/temperature));let sample=Math.random()*weights.reduce((a,b)=>a+b,0);
 for(let i=0;i<candidates.length;i++){sample-=weights[i];if(sample<=0)return candidates[i].move}return best;
}
self.onmessage=async event=>{const q=event.data||{};try{
 await initialize();if(q.type==='init'){self.postMessage({id:q.id,engine:'reckless-capablanca-1.0'});return}
 if(!Object.prototype.hasOwnProperty.call(RULES,q.variant))throw new Error('Невідомі правила гри');
 if(q.generation!==lastGeneration){engine.reset();lastGeneration=q.generation}
 const text=String(q.position||'');if(!text.startsWith('position fen '))throw new Error('Неповний запис позиції');const parts=text.slice(13).split(' moves ');engine.set_position(parts[0],RULES[q.variant],parts[1]||'');
 if(canonical(engine.fen())!==canonical(q.fen))throw new Error('Позиція Reckless не збігається з шахівницею');
 const level=Math.max(1,Math.min(48,Number(q.level)||1));engine.search(Math.max(1,Math.min(10000,Number(q.time)||60)),Math.max(0,Math.min(64,Number(q.depth)||0)),level);
 const move=chooseMove(level),lines=engine.take_output().trim().split('\n');
 const line=lines.filter(l=>l.includes(' pv '+move+' ')||l.endsWith(' pv '+move)).at(-1)||'',pv=line.match(/ pv (.+)$/),score=line.match(/ score (cp|mate) (-?\d+)/),time=line.match(/ time (\d+)/);
 self.postMessage({id:q.id,move,analysis:{engine:'Reckless Capablanca 1.0',evaluation:'Capablanca classical',depth:engine.last_depth(),nodes:Number(engine.last_nodes()),timeMs:time?Number(time[1]):null,score:score?{unit:score[1],value:Number(score[2]),perspective:'side-to-move'}:null,pv:pv?pv[1].split(' '):[],trainingChoice:move!==engine.last_bestmove()}});
 }catch(e){self.postMessage({id:q.id,error:String(e&&e.message||e)})}};
