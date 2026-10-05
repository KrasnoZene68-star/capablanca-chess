const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { performance } = require('node:perf_hooks');
const Stockfish = require('../capablanca_v5_12_1/stockfish.js');
const wasmBinary = fs.readFileSync(path.join(__dirname, '../capablanca_v5_12_1/stockfish.wasm'));

function loadGame(factory = () => Stockfish({ wasmBinary }), options = {}) {
  const html = fs.readFileSync(path.join(__dirname, '../capablanca_v5_12_1/index.html'), 'utf8');
  const initialStrength=html.match(/<select id="strength"[^>]*>[\s\S]*?<option value="(\d+)" selected>/)[1];
  const elements = new Map(), timers = new Set(), engines = [], downloads = [];
  function element(id) {
    if (elements.has(id)) return elements.get(id);
    const listeners = new Map(), classes = new Set();
    const el = {
      getContext(){return options.gl||null},
      id, value: ({ engineSelect:'stockfish',mobileEngineSelect:'stockfish',boardSize:'8', variant: 'classic', mode: 'two', humanSide: 'r', strength: initialStrength, viewMode: '2d', pieceSet: 'n1' })[id] || '',
      children: [], options: [{ value: 'ai', textContent: '' }], dataset: {}, style: {}, textContent: '', get innerHTML(){return this._html||''}, set innerHTML(v){this._html=v;this.children=[]},
      attrs: {}, open: false, focused: false,
      classList: {
        add(...xs) { xs.forEach(x=>classes.add(x)); },
        remove(...xs) { xs.forEach(x=>classes.delete(x)); },
        toggle(x, force) { const yes=force??!classes.has(x); yes?classes.add(x):classes.delete(x); return yes; },
        contains(x) { return classes.has(x); },
      },
      setAttribute(name,value) { this.attrs[name]=value; },
      focus() { this.focused=true; },
      click(){this.clicked=true;this.dispatch('click')},
      showModal() { this.open=true; },
      close() { this.open=false; this.dispatch('close'); },
      getBoundingClientRect() { return {left:20,top:20,right:380,bottom:700,width:360,height:680}; },
      addEventListener(name, fn) { listeners.set(name, fn); },
      dispatch(name,event={}) { return listeners.get(name)?.(event); },
      querySelectorAll(selector) { const cls=selector.slice(1),found=[];const visit=e=>{for(const child of e.children){if(String(child.className||'').split(' ').includes(cls)||child.classList.contains(cls))found.push(child);visit(child)}};visit(this);return found; },
      querySelector(selector) { return this.querySelectorAll(selector)[0]||null; },
      appendChild(child) { child.remove();this.children.push(child);child.parentElement=this; },
      remove() {if(this.parentElement){const a=this.parentElement.children;const i=a.indexOf(this);if(i>=0)a.splice(i,1);this.parentElement=null;}},
    };
    elements.set(id, el); return el;
  }
  let script = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].at(-1)[1];
  const expose = `
  globalThis.game = {
    initReckless,recklessBestMove,initSelectedEngine,
    startDuel,pauseDuel,duelStrengthForSide,engineForSide,
    duelState:()=>({running:duelRunning,epoch:duelEpoch,engines:{...duelEngines},reason:duelPauseReason}),
    selectedEngineState:()=>({activeEngine,recklessReady,recklessBusy,recklessLastSearchOk,recklessFailureReason}),stopReckless:discardReckless,

    tripleBudget, rebuildBoard, initialState, allLegalMoves, normalLegalMoves, inCheck, attacksSquare, applyMove,
    stateToFen, uciToMove, initFairy, aiTurn, reset, commitMove, checkGameEnd, resign, shouldEngineResign,
    fairyCommand, fairySend, config: FAIRY_KING_KNIGHT_CONFIG+FAIRY_BOTH_CONFIG+FAIRY_10_CONFIG,
    profiles: STRENGTH_LEVELS, strengthLevel, strengthProfile,
    gameReport, enginePositionCommand, repetitionKey, repetitionCount, cloneState, evaluate, moveOrderScore,
    qScore(root, depth=2, alpha=-Infinity, beta=Infinity){AI_DEADLINE=performance.now()+3000;AI_ABORT=false;return {score:quiescence(state,turn,alpha,beta,root,epSquare,depth),aborted:AI_ABORT}},
    setHalfmove(n){state.halfmoveClock=n},
    chooseSquare, startClock, settleClock, render, showResult, finishTurn, clockState:()=>({...clock}), elapse(ms){clock.stamp-=ms}, selection:()=>({selected,legal}), graphics:{render:renderGL,project:projectGLPoint,pick:screenToSquareGL,hit:screenToPieceGL,
      meshes:()=>PREBUILT_MESHES,ready:()=>GLReady,
      piece:makePieceGeom,view:()=>viewModeEl.value},
    setPosition(fen, rule='classic') {
      gameGeneration++; aiTurnRequest=null;
      if(fairyBusy)fairySend('stop');
      variantEl.value=mobileVariant.value=rule;
      const fields=fen.split(' ');
      ROWS=fields[0].split('/').length;boardSizeEl.value=mobileBoardSize.value=String(ROWS);rebuildBoard();
      state=fields[0].split('/').map(row=>{
        const out=[];
        for(const token of row.match(/\\d+|[a-z]/gi)) {
          if(/^\\d+$/.test(token))out.push(...Array(Number(token)).fill(null));
          else out.push({t:token.toUpperCase(),c:token===token.toUpperCase()?'r':'g',m:true});
        }
        return out;
      });
      for(const [letter,r,c] of [['K',ROWS-1,9],['Q',ROWS-1,0],['k',0,9],['q',0,0]]) {
        if(fields[2].includes(letter)) {
          if(state[r][5])state[r][5].m=false;
          if(state[r][c])state[r][c].m=false;
        }
      }
      const budget=(fields[6]||'t2,2').slice(1).split(',').map(Number);state.tripleRemaining={r:ROWS===10?budget[0]:0,g:ROWS===10?budget[1]:0};
      state.halfmoveClock=Number(fields[4]);state.fullmoveNumber=Number(fields[5]);turn=fields[1]==='w'?'r':'g';
      epSquare=null;
      if(fields[3]!=='-'){
       const targets=[...fields[3].matchAll(/([a-j])(10|[1-9])/g)].map(m=>({r:ROWS-Number(m[2]),c:FILES.indexOf(m[1])}));
       const d=turn==='r'?-1:1;
       let capR=targets[0].r-d;
       if(!state[capR]?.[targets[0].c])capR-=d;
       epSquare={...targets[0],targets,capR};
      }
      selected=null;legal=[];lastMove=null;history=[];gameOver=false;pendingPromotion=null;
      fairyLastSearchOk=null;pendingMoveRecord=null;gameResult="*";
    },
    setAi(side=turn) {modeEl.value='ai';humanSideEl.value=enemy(side)},
    setMode(v){modeEl.value=v}, setHuman(v){humanSideEl.value=v},
    setStrength(v){strengthEl.value=String(v)},
    snapshot(){return {state,turn,history,gameOver,ep:epSquare,lastMove,variant:variant(),generation:gameGeneration}},
    engineState(){return {ready:fairyReady,kingKnightReady:fairyKingKnightReady,escapeReady:fairyEscapeReady,bothReady:fairyBothReady,tenReady:fairy10Ready,selected:fairySelectedVariant,lastOk:fairyLastSearchOk,reason:fairyFailureReason}},
    engine(){return fairyEngine},
    destroy(){discardReckless();discardFairy()}
  };
  `;
  script = script.replace('// Deterministic first-load initialization:', expose + '\n// Deterministic first-load initialization:');
  const context = {
    Worker:options.Worker,atob,Blob, URL:{createObjectURL(blob){downloads.push(blob);return 'blob:test-download'},revokeObjectURL(){}}, requestAnimationFrame(fn){fn();return 1},
    document: { getElementById: element, querySelectorAll: () => [], createElement: () => element(Symbol()), body: element('body') },
    window: { addEventListener() {}, confirm: options.confirm || (()=>true) }, console: options.console || console, performance,
    setTimeout(fn, ms) { const id = setTimeout(() => { timers.delete(id); fn(); }, options.fastTimeouts && ms >= 5000 ? 30 : ms); timers.add(id); return id; },
    clearTimeout(id) { timers.delete(id); clearTimeout(id); },
    Stockfish: async () => { const e = await factory(); engines.push(e); return e; },
  };
  vm.runInNewContext(script, context, { filename: 'index.html' });
  return {
    api: context.game, elements, engines, downloads,
    close() { for (const id of timers) clearTimeout(id); context.game.destroy(); },
  };
}

async function referenceEngine(config) {
  const engine = await Stockfish({ wasmBinary });
  let pending;
  engine.addMessageListener(line => {
    if (!pending) return;
    line = String(line).trim(); pending.lines.push(line);
    if (pending.predicate(line)) {
      const p = pending; pending = null; clearTimeout(p.timer); p.resolve(p.lines);
    }
  });
  const command = (cmd, predicate, timeout = 10000) => new Promise((resolve, reject) => {
    if (pending) return reject(new Error('Overlapping reference requests'));
    pending = { predicate, resolve, lines: [], timer: setTimeout(() => { pending = null; reject(new Error('Reference timeout: ' + cmd)); }, timeout) };
    engine.postMessage(cmd);
  });
  await command('uci', l => l === 'uciok');
  engine.FS.writeFile('/test.ini', config);
  engine.postMessage('setoption name VariantPath value /test.ini');
  engine.postMessage('setoption name Threads value 1');
  engine.postMessage('setoption name Hash value 16');
  await command('isready', l => l === 'readyok');
  return {
    engine, command,
    async perft(rule, fen, depth) {
      engine.postMessage('setoption name UCI_Variant value ' + (rule.startsWith('capablanca') ? rule : rule === 'classic' ? 'capablanca' : rule === 'escape' ? 'capablanca_escape' : rule === 'both' ? 'capablanca_both' : 'capablanca_kingknight'));
      engine.postMessage('position fen ' + fen);
      const lines = await command('go perft ' + depth, l => l.startsWith('Nodes searched:'));
      return {
        total: Number(lines.find(l => l.startsWith('Nodes searched:')).split(':')[1]),
        moves: lines.filter(l => /^[a-j](?:10|[1-9])[a-j](?:10|[1-9])[qrbnac]?: /.test(l)).map(l => l.split(':')[0]).sort(),
        lines,
      };
    },
    close() { engine.terminate(); },
  };
}

module.exports = { loadGame, referenceEngine };
