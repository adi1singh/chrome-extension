import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
const report={mode:'Native extension APIs with intercepted synthetic pages; no real applications',checks:[]};
let context;
try {
 context=await chromium.launchPersistentContext('',{channel:'chromium',headless:true,timeout:20000,args:[`--disable-extensions-except=${path.resolve('dist')}`,`--load-extension=${path.resolve('dist')}`]});
 context.setDefaultTimeout(10000);
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker',{timeout:10000});
 report.runtime=await worker.evaluate(()=>({id:chrome.runtime.id,version:chrome.runtime.getManifest().version,storage:!!chrome.storage?.local}));
 if(!report.runtime.storage)throw new Error('Native storage missing');
 await worker.evaluate(()=>chrome.storage.local.set({seek_job_123:{job_url_id:'123',job_title:'Fixture',company:'Fixture',description:'Fixture'}}));
 const blocked=[];
 await context.route('**/*',route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.protocol==='chrome-extension:')return route.continue();
  if(url.hostname==='www.seek.com.au'&&request.method()==='GET'){
   const child=url.searchParams.has('child'),other=url.pathname.includes('/999/');
   const body=`<html><body><div aria-current="step">Review and submit</div><button type="button" data-testid="review-submit-application">Submit</button>${!child&&!other?'<iframe src="https://www.seek.com.au/job/123/apply/review?child=1"></iframe>':''}<script>window.submitClicks=0;document.querySelector('button').onclick=()=>window.submitClicks++;</script></body></html>`;
   return route.fulfill({contentType:'text/html',body});
  }
  blocked.push({method:request.method(),host:url.hostname});return route.abort();
 });
 async function prepare(url){
  const page=await context.newPage(),cdp=await context.newCDPSession(page),worlds=[];
  cdp.on('Runtime.executionContextCreated',event=>worlds.push(event.context));
  await cdp.send('Runtime.enable');await page.goto(url,{waitUntil:'load'});
  const frameId=(await cdp.send('Page.getFrameTree')).frameTree.frame.id;
  const find=()=>worlds.filter(world=>world.origin===`chrome-extension://${report.runtime.id}`||world.name.includes('JobGen'));
  await expect.poll(()=>find().length,{timeout:10000}).toBeGreaterThanOrEqual(url.includes('/123/')?2:1);
  const selected=find();
  return {page,cdp,worlds:selected,main:selected.find(world=>world.auxData?.frameId===frameId)};
 }
 async function evaluate(target,world,expression){
  const result=await target.cdp.send('Runtime.evaluate',{expression,contextId:world.id,awaitPromise:true,returnByValue:true});
  if(result.exceptionDetails)throw new Error(result.exceptionDetails.text+': '+JSON.stringify(result.exceptionDetails.exception?.description));
  return result.result.value;
 }
 const origin=await prepare('https://www.seek.com.au/job/123/apply/review');
 const other=await prepare('https://www.seek.com.au/job/999/apply/review');
 report.contexts={origin:origin.worlds.length,other:other.worlds.length};
 if(!origin.main)throw new Error('Origin extension context not identified');
 for(const target of [origin,other])for(const world of target.worlds){
  await evaluate(target,world,"globalThis.nativeTestCount=0;chrome.runtime.onMessage.addListener(message=>{if(message.action==='AUTOFILL_FRAME')globalThis.nativeTestCount++;});true;");
 }
 await other.page.bringToFront();
 const response=await evaluate(origin,origin.main,"new Promise(resolve=>chrome.runtime.sendMessage({action:'BROADCAST_AUTOFILL',data:{action:'autofill'}},resolve))");
 report.broadcast=response;
 if(!response.success||response.framesContacted!==2||response.framesAcknowledged!==2)throw new Error('Native frame broadcast was not acknowledged by both frames');
 await origin.page.waitForTimeout(1000);
 const counts=[];
 for(const world of origin.worlds)counts.push(await evaluate(origin,world,'globalThis.nativeTestCount'));
 const otherCounts=[];
 for(const world of other.worlds)otherCounts.push(await evaluate(other,world,'globalThis.nativeTestCount'));
 if(counts.some(count=>count!==1)||otherCounts.some(count=>count!==0))throw new Error('Misrouted or duplicated native autofill message');
 report.checks.push({name:'Originating tab and iframe each receive one native message while another tab is focused',status:'PASS',originCounts:counts,otherCounts});
 const clicks=[];
 for(const frame of origin.page.frames())clicks.push(await frame.evaluate(()=>window.submitClicks));
 if(clicks.some(count=>count!==0))throw new Error('Manual autofill clicked a fixture final-submit control');
 report.checks.push({name:'Manual autofill in native main/iframe contexts never submits',status:'PASS',clicks});
 const invalid=await evaluate(origin,origin.main,"new Promise(resolve=>chrome.runtime.sendMessage({action:'BROADCAST_AUTOFILL',data:{action:'invalid'}},resolve))");
 if(invalid.success!==false)throw new Error('Invalid native command was accepted');
 report.checks.push({name:'Native background rejects unsupported commands',status:'PASS'});
 report.blockedRequestCount=blocked.length;
} catch(error){report.failure=error.message;process.exitCode=1;}
finally{
 await context?.close();await fs.mkdir('audit/hardening',{recursive:true});
 await fs.writeFile('audit/hardening/native-routing.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
}
