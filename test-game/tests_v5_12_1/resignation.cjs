const assert=require('node:assert/strict');
const {loadGame}=require('./harness.cjs');
const {BrowserWorker}=require('../reckless_work/tests/worker-class.cjs');
const fs=require('fs');
const report=JSON.parse(fs.readFileSync('upload/capablanca-2026-09-23T13-17-22-540Z.json'));

(async()=>{
 let g=loadGame(undefined,{Worker:BrowserWorker}),a=g.api,e=g.elements;
 try{
  // The recorded match reaches king alone after 150 plies; this is not mate.
  const kingAlone=report.moves[149].afterFen;
  e.get('mode').value='two';a.setPosition(kingAlone,'both');a.render();
  assert.equal(a.checkGameEnd(),false);
  assert.equal(a.snapshot().gameOver,false);
  assert.equal(e.get('resignGame').hidden,false);
  assert.equal(e.get('resignGame').disabled,false);
  e.get('resignGame').click();
  assert.equal(a.gameReport().endReason,'resignation');
  assert.equal(a.gameReport().resignation.side,'r');
  assert.equal(a.gameReport().result,'0-1');
  assert.equal(a.gameReport().moves.length,0,'resignation adds no fictional move');
  assert.equal(e.get('resignGame').disabled,true);
  assert.equal(a.resign('r'),false,'no second resignation');
  console.log('PASS two players: king alone remains playable; voluntary resignation records 0-1');

  a.reset();a.setPosition('9k/10/10/10/10/10/10/K9 b - - 0 1','classic');
  a.render();e.get('resignGame').click();
  assert.equal(a.gameReport().result,'1-0');
  assert.equal(a.gameReport().resignation.side,'g');
  console.log('PASS either human side may resign');

  a.reset();e.get('mode').value='ai';e.get('humanSide').value='g';
  a.setPosition(kingAlone,'both');a.render();
  assert.equal(e.get('resignGame').disabled,true,'human cannot resign for computer');
  const base={engine:'stockfish',generation:a.snapshot().generation,variant:'both',side:'r',fen:a.stateToFen()};
  assert.equal(a.shouldEngineResign({...base,analysis:{depth:12,score:{unit:'cp',value:-3000,perspective:'side-to-move'}}}),false);
  assert.equal(a.shouldEngineResign({...base,analysis:{depth:3,score:{unit:'mate',value:-11,perspective:'side-to-move'}}}),false);
  assert.equal(a.shouldEngineResign({...base,analysis:{depth:12,score:{unit:'mate',value:-11,perspective:'side-to-move'}}}),true);
  console.log('PASS engine does not resign for material deficit or unproven score');

  a.setPosition(report.moves[160].beforeFen,'both');
  a.setStrength(36);
  await a.aiTurn();
  const outcome=a.gameReport();
  assert.equal(outcome.endReason,'resignation',JSON.stringify(outcome.engineStatus));
  assert.equal(outcome.resignation.initiator,'engine');
  assert.equal(outcome.resignation.engine,'Fairy-Stockfish');
  assert.equal(outcome.result,'0-1');
  assert.equal(outcome.moves.length,0);
  console.log('PASS real Fairy-Stockfish resigns when lone king has proven mate against it');
  e.get('engineSelect').value='reckless';a.reset();
  e.get('mode').value='ai';e.get('humanSide').value='g';
  a.setPosition(report.moves[160].beforeFen,'both');a.setStrength(36);
  await a.aiTurn();
  const reckless=a.gameReport();
  assert.equal(reckless.endReason,'resignation');
  assert.equal(reckless.resignation.engine,'Reckless');
  assert.equal(reckless.result,'0-1');
  assert.equal(reckless.moves.length,0);
  console.log('PASS real Reckless resigns when lone king has proven mate against it');
 }finally{g.close()}
 let confirmed=false;
 g=loadGame(undefined,{Worker:BrowserWorker,confirm:()=>confirmed});a=g.api;e=g.elements;
 try{
  a.render();e.get('resignGame').click();
  assert.equal(a.snapshot().gameOver,false,'cancel leaves game running');
  confirmed=true;e.get('resignGame').click();
  assert.equal(a.gameReport().result,'0-1');
  console.log('PASS confirmation cancel and accept');
 }finally{g.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
