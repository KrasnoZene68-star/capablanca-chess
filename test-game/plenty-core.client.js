// Optional transport for later game integration. Does not modify the live game.
class PlentyCoreClient {
  constructor(url='./plenty-core.worker.js', WorkerClass=globalThis.Worker) {
    this.url=url; this.WorkerClass=WorkerClass; this.worker=null; this.pending=null; this.serial=0;
  }
  cancel(reason='Search cancelled') {
    const old=this.worker;this.worker=null;
    if(old)old.terminate();
    const p=this.pending;this.pending=null;
    if(p){clearTimeout(p.timer);p.reject(new Error(reason));}
  }
  search(payload, timeoutMs=30000) {
    if(!Number.isFinite(timeoutMs)||timeoutMs<1||timeoutMs>2147483647)
      return Promise.reject(new Error('Invalid timeout'));
    // One active request; superseding a search destroys the synchronous engine.
    if(this.pending)this.cancel('Superseded search');
    return new Promise((resolve,reject)=>{
      try {
        if(!this.worker) {
          const worker=this.worker=new this.WorkerClass(this.url);
          worker.onmessage=({data})=>{
            if(this.worker!==worker||!this.pending||!data||data.id!==this.pending.id)return;
            const p=this.pending;
            if(data.type==='error'){this.cancel(data.error||'Engine error');return;}
            if(data.type!=='result'){this.cancel('Invalid engine response');return;}
            this.pending=null;clearTimeout(p.timer);p.resolve(data);
          };
          worker.onerror=e=>{if(this.worker===worker)this.cancel(e.message||'Worker failed');};
          worker.onmessageerror=()=>{if(this.worker===worker)this.cancel('Unreadable engine response');};
        }
        const id=++this.serial;
        const timer=setTimeout(()=>{if(this.pending?.id===id)this.cancel('Search timed out');},timeoutMs);
        this.pending={id,timer,resolve,reject};
        this.worker.postMessage({...payload,id,type:'search'});
      }catch(e){this.cancel(String(e.message||e));reject(e);}
    });
  }
}
if(typeof module!=='undefined')module.exports=PlentyCoreClient;
