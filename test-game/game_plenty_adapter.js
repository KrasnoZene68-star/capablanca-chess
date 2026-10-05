// Inserted inside the game's IIFE; functions run after game initialization.
let plentyClient=null,plentyLastSearchOk=null,plentyFailureReason='';
function discardPlenty(){if(plentyClient)plentyClient.cancel();plentyClient=null;}
function canonicalPlentyFen(fen){
 if(typeof fen!=='string')return null;
 const fields=fen.trim().split(/\s+/);
 if(fields.length<6||fields.length>7)return null;
 if(fields[3]!=='-'){
  if(!/^(?:[a-j](?:10|[1-9])){1,2}$/.test(fields[3]))return null;
  fields[3]=fields[3].match(/[a-j](?:10|[1-9])/g).sort().join('');
 }
 return fields.join(' ');
}
function validatePlentyReply(reply,request){
 if(!reply||reply.engine!=='PlentyChess-original-core-experimental')throw new Error('Невідповідна версія PlentyChess');
 if(reply.evaluator!=='handcrafted-tapered-v1')throw new Error('Невідповідна збірка оцінки PlentyChess');
 if(canonicalPlentyFen(request.fen)===null||canonicalPlentyFen(reply.fen)!==canonicalPlentyFen(request.fen))throw new Error('Позиція PlentyChess не збігається з шахівницею');
 if(typeof reply.completed!=='boolean'||typeof reply.terminal!=='boolean'||
    !Number.isInteger(reply.depth)||reply.depth<0||!Number.isFinite(reply.nodes)||reply.nodes<0||
    typeof reply.pv!=='string'||typeof reply.move!=='string'||
    (reply.completed?!Number.isFinite(reply.score):reply.score!==null)||reply.scorePerspective!=='side-to-move')
  throw new Error('Некоректний звіт PlentyChess');
 if(reply.terminal!== (reply.move==='0000'))throw new Error('Неузгоджене завершення PlentyChess');
 const pv=reply.pv.trim().split(/\s+/).filter(Boolean);
 if(!reply.terminal&&pv.length&&pv[0]!==reply.move)throw new Error('Варіант PlentyChess не відповідає обраному ходу');
}
async function plentyBestMove(request){
 if(!currentAiRequest(request)||settleClock())return null;
 try{
  if(!plentyClient)plentyClient=new PlentyCoreClient('./plenty-stage38-candidate/plenty-core.worker.js');
  const match=request.position.match(/^position fen (.+?)(?: moves (.*))?$/);
  if(!match)throw new Error('Некоректна історія позиції');
  const moveTime=clock.running?Math.max(1,Math.min(request.strength.moveTime,Math.floor(clock[turn]/20),Math.floor(clock[turn]-30))):request.strength.moveTime;
  const flags={classic:0,kingKnight:1,escape:2,both:3}[request.variant];
  const reply=await plentyClient.search({height:request.rows,flags,fen:match[1],moves:match[2]||'',
   depth:request.strength.searchDepth||0,milliseconds:moveTime},moveTime+10000);
  if(!currentAiRequest(request))return null;
  validatePlentyReply(reply,request);
  if(reply.terminal){request.plentyTerminal=true;throw new Error('Рушій визначив завершення: потрібна перевірка правил гри');}
  const move=uciToMove(reply.move);
  if(!move)throw new Error('PlentyChess повернув нелегальний хід');
  request.engineName='PlentyChess experimental';
  // Raw evaluation is deliberately excluded from the mate/cp autosurrender API.
  request.analysis={depth:reply.depth,nodes:reply.nodes,pv:reply.pv,completed:reply.completed,
   rawScore:reply.score,scorePerspective:reply.scorePerspective,evaluator:reply.evaluator,rootFen:reply.fen};
  request.actualLimits={depth:request.strength.searchDepth||0,timeMs:moveTime,level:request.strength.level,calibrated:false};
  plentyLastSearchOk=true;plentyFailureReason='';updateStrengthStatus();return move;
 }catch(e){
  if(currentAiRequest(request)){plentyLastSearchOk=false;plentyFailureReason=String(e.message||e);discardPlenty();updateStrengthStatus();}
  return null;
 }
}
