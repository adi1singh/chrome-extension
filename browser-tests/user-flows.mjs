import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,headless:true,timeout:15000});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
let failHistory=false;
const results=[]; const errors=[]; const requests=[];
await context.route('**/*',async route=>{
 const url=new URL(route.request().url());
 if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,OPTIONS'}});
 if(url.hostname.includes('jobgen')) requests.push(url.pathname);
 if(url.pathname.endsWith('/jobgen_history')&&failHistory)return route.fulfill({status:503,headers:{'access-control-allow-origin':'*'},body:'Unavailable'});
 if(url.hostname==='extension.test') {
  const file=path.resolve('dist',url.pathname.slice(1));
  if(!file.startsWith(path.resolve('dist')+path.sep))return route.abort();
  try{return route.fulfill({body:await fs.readFile(file),contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'image/png',headers:{'access-control-allow-origin':'*'}});}catch{return route.abort();}
 }
 if(url.hostname==='www.seek.com.au')return route.fulfill({contentType:'text/html',body:'<html><body><h1 data-automation="job-detail-title">Fixture Engineer</h1><span data-automation="advertiser-name">Example</span><span data-automation="job-detail-location">Sydney</span><div data-automation="jobAdDetails">Fixture role description</div></body></html>'});
 return route.fulfill({headers:{'access-control-allow-origin':'*'},contentType:'application/json',body:JSON.stringify({status:'success',response:{status:'200',job_id:'123',job_found:true,job_data:'{"Job Match Score":80}',history:[]}})});
});
await context.addInitScript(()=>{
 const listeners=[]; const messages=[];const data={};
 const changed=(changes)=>listeners.forEach(fn=>fn(changes,'local'));
 const local={
 get(keys,cb){const r=keys==null?{...data}:Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(k=>[k,data[k]]));cb?.(r);return Promise.resolve(r);},
 set(values,cb){const changes={};for(const[k,v]of Object.entries(values)){changes[k]={oldValue:data[k],newValue:v};data[k]=v;}changed(changes);cb?.();return Promise.resolve();},
 remove(keys,cb){const changes={};for(const k of Array.isArray(keys)?keys:[keys]){changes[k]={oldValue:data[k]};delete data[k];}changed(changes);cb?.();return Promise.resolve();},
 clear(cb){return local.remove(Object.keys(data),cb);}
 };
 window.chrome={runtime:{getURL:p=>'https://extension.test/'+p,onMessage:{addListener:f=>messages.push(f),removeListener:f=>messages.splice(messages.indexOf(f),1)},sendMessage:(m,cb)=>cb?.({success:false,error:'Fixture: no authenticated session'})},storage:{local,onChanged:{addListener:f=>listeners.push(f),removeListener:f=>listeners.splice(listeners.indexOf(f),1)}}};
});
const page=await context.newPage();page.setDefaultTimeout(7000);page.on('pageerror',e=>errors.push(e.message));
async function check(name,run){try{await run();results.push({name,status:'PASS'});}catch(e){console.log('FAILED DOM',await page.locator('#jobgen-react-app').innerText());results.push({name,status:'FAIL',error:e.message.slice(0,1200)});}}
try{
 await page.goto('https://www.seek.com.au/job/123');
 await page.addStyleTag({url:'https://extension.test/content.css'});
 await page.addScriptTag({url:'https://extension.test/content.jsx.js',type:'module'});
 await page.waitForTimeout(1500);
 await check('Built UI loads without runtime exceptions',async()=>{await expect(page.locator('#jobgen-react-app')).toBeAttached();assertNoErrors();});
 await check('Signed-out users see login, not application actions',async()=>{await expect(page.getByRole('button',{name:'Sign in free',exact:true})).toBeVisible();await expect(page.locator('#applyButton')).not.toBeVisible();});
 await check('Minimise and reopen the login panel',async()=>{await page.getByRole('button',{name:'Minimise JobGen'}).filter({visible:true}).click();await expect(page.getByRole('button',{name:'Sign in free',exact:true})).not.toBeVisible();await page.getByRole('button',{name:'Open JobGen',exact:true}).click();await expect(page.getByRole('button',{name:'Sign in free',exact:true})).toBeVisible();});
 await check('Keyboard activates sign-in and opens the correct login URL',async()=>{const login=page.getByRole('button',{name:'Sign in free',exact:true});await login.focus();const popupPromise=page.waitForEvent('popup');await page.keyboard.press('Enter');const popup=await popupPromise;await popup.waitForLoadState();await expect(popup).toHaveURL('https://candidates.jobgen.ai/sign-up?ext_login=1');await popup.close();});
 await check('Signed-in fixture unlocks the main panel',async()=>{await page.evaluate(()=>chrome.storage.local.set({jobgen_session_token:'uat-fixture-token'}));await expect(page.locator('#jobgen-react-app').getByRole('button',{name:'Job Match',exact:true})).toBeVisible();});
 await check('Recent applications tab opens',async()=>{await page.getByRole('button',{name:'Recent',exact:true}).click();await expect(page.getByText(/No recent activity|No job applications found/)).toBeVisible();});

 await check('Signed-in panel minimises and reopens',async()=>{await page.getByRole('button',{name:'Minimise JobGen'}).filter({visible:true}).click();await page.getByRole('button',{name:'Open JobGen',exact:true}).click();await expect(page.getByRole('button',{name:'Recent',exact:true})).toBeVisible();});
 await check('Save updates the button and sends one save request',async()=>{await page.getByRole('button',{name:'Job Match',exact:true}).click();await page.getByRole('button',{name:'Save',exact:true}).click();await expect(page.getByRole('button',{name:'Saved',exact:true})).toBeVisible();if(requests.filter(p=>p.endsWith('/jobgen_save')).length!==1)throw new Error('Save request count mismatch');});
 await check('History errors offer a working retry',async()=>{failHistory=true;await page.getByRole('button',{name:'Recent',exact:true}).click();await expect(page.getByRole('button',{name:'Retry',exact:true})).toBeVisible();await page.screenshot({path:'audit/user-tests/history-error.png'});failHistory=false;await page.getByRole('button',{name:'Retry',exact:true}).click();await expect(page.getByText(/No recent activity|No job applications found/)).toBeVisible();});
 await page.screenshot({path:'audit/user-tests/signed-in.png'});
 await check('Desktop panel remains within the viewport at 1024px',async()=>{await page.setViewportSize({width:1024,height:900});const buttons=page.getByRole('button',{name:'Minimise JobGen'}).filter({visible:true});const box=await buttons.boundingBox();if(!box||box.x<0||box.x+box.width>1024)throw new Error('Header control outside viewport');});
 await check('Session removal returns to login',async()=>{await page.evaluate(()=>chrome.storage.local.remove('jobgen_session_token'));await expect(page.getByRole('button',{name:'Sign in free',exact:true})).toBeVisible();});
 await check('No browser runtime errors across journeys',async()=>assertNoErrors());
 await page.screenshot({path:'audit/user-tests/browser-initial.png'});
 function assertNoErrors(){if(errors.length)throw new Error(errors.join('\n'));}
}finally{
 await fs.writeFile('audit/user-tests/results.json',JSON.stringify({mode:'Built browser app with Chrome/API fixtures; extension installation unverified',browser:browser.version(),results,errors},null,2));
 await browser.close();
}
console.log(JSON.stringify(results,null,2));
if(results.some(result=>result.status==='FAIL'))process.exitCode=1;
