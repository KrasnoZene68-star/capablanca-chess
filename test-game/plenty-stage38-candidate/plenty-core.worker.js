/* Actual core only; keep separate from the old prototype worker.
 * Cancellation: terminate this worker and create a fresh instance.
 * A stop message cannot interrupt a synchronous WASM call. */
'use strict';
let ready;
let queue = Promise.resolve();
onmessage = ({data: request}) => {
  queue = queue.then(async () => {
    const id = request && request.id;
    try {
      if (!request || request.type !== 'search') throw new Error('Expected search request');
      if (!ready) {
        importScripts('core-dist/plenty-core.js');
        ready = PlentyCore({locateFile: name => new URL('core-dist/' + name, self.location.href).href});
      }
      const m = await ready;
      const call = (name, ret, types = [], args = []) => m.ccall('pc_' + name, ret, types, args);
      const {height, flags, fen, moves = '', depth = 4, milliseconds = 250, nodes = 0} = request;
      if (![height, flags, depth, milliseconds, nodes].every(Number.isInteger) || typeof fen !== 'string' || typeof moves !== 'string')
        throw new Error('Invalid request fields');
      if (![8,10].includes(height) || flags < 0 || flags > 3 || depth < 0 || depth > 248 || milliseconds < 0 || milliseconds > 86400000 || nodes < 0 || nodes > 2147483647)
        throw new Error('Request out of range');
      if (!call('variant', 'number', ['number','number'], [height,flags]) ||
          !call('position','number',['string','string'],[fen,moves])) throw new Error(call('error','string'));
      const move = call('search','string',['number','number','number'],[depth,milliseconds,nodes]);
      if (!move) throw new Error(call('error','string'));
      const completed = !!call('completed','number');
      postMessage({id, type:'result', engine:'PlentyChess-original-core-experimental', evaluator:call('evaluator','string'), move,
        completed, terminal:!!call('terminal','number'), depth:call('depth','number'),
        score:completed ? call('score','number') : null, scorePerspective:'side-to-move',
        nodes:call('nodes','number'), pv:call('pv','string'), fen:call('fen','string')});
    } catch (e) { postMessage({id, type:'error', error:String(e.message || e)}); }
  });
};
