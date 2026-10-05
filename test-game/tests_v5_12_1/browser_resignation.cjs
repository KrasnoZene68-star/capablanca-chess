const {chromium}=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const path=require('path'),fs=require('fs'),http=require('http'),assert=require('node:assert/strict');
const root=path.resolve('capablanca_v5_12_1');
const server=http.createServer((req,res)=>{
 res.setHeader('Cross-Origin-Opener-Policy','same-origin');
 res.setHeader('Cross-Origin-Embedder-Policy','require-corp');
 res.setHeader('Cache-Control','no-store');
 const name=new URL(req.url,'http://localhost').pathname;
 if(name==='/coi-serviceworker.js'){
  res.setHeader('Content-Type','application/javascript');
  res.end('// Local test uses isolation headers');return;
 }
 const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));
 if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return}
 fs.readFile(file,(err,data)=>{
  if(err){res.writeHead(404);res.end();return}
  res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.wasm')?'application/wasm':'application/javascript');
  res.end(data);
 });
});
(async()=>{
 await new Promise(done=>server.listen(0,'127.0.0.1',done));
 const address='http://127.0.0.1:'+server.address().port+'/';
 const browser=await chromium.launch({executablePath:path.resolve('reckless_work/browser/chrome-headless-shell-linux64/chrome-headless-shell'),headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 try{
  for(const mobile of [false,true]){
   const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1366,height:900},isMobile:mobile,hasTouch:mobile});
   const page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.goto(address,{waitUntil:'networkidle'});
   assert.equal(await page.locator('#resignGame').isVisible(),true);
   page.once('dialog',dialog=>dialog.dismiss());
   await page.click('#resignGame');
   assert.equal(await page.locator('#boardOutcome').isVisible(),false);
   page.once('dialog',dialog=>dialog.accept());
   await page.click('#resignGame');
   assert.match(await page.locator('#boardOutcome').innerText(),/ЗДАЧА ПАРТІЇ · 0-1/);
   assert.equal(await page.locator('#resignGame').isDisabled(),true);
   await page.click('#resultNew');
   await page.click('#settingsOpen');
   await page.selectOption('#'+(mobile?'mobileMode':'mode'),'engines');
   await page.click('#settingsDone');
   assert.equal(await page.locator('#resignGame').isVisible(),false);
   assert.deepEqual(errors,[]);
   console.log('PASS browser',mobile?'iPhone-size':'desktop','confirm/dismiss and engine-match visibility');
   await context.close();
  }
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exitCode=1});
