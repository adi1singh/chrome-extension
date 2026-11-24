import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
const report={date:new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Sydney'}).format(new Date()),mode:'Native installed extension; public read-only pages',checks:[],errors:[]};
let context;
try {
 context=await chromium.launchPersistentContext('',{channel:'chromium',headless:true,timeout:20000,args:[`--disable-extensions-except=${path.resolve('dist')}`,`--load-extension=${path.resolve('dist')}`]});
 report.browser=context.browser()?.version();
 context.setDefaultTimeout(10000);
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker',{timeout:10000});
 // Give Chrome the opportunity to finish registering MV3 APIs.
 const runtime=await worker.evaluate(async()=>{for(let n=0;n<30&&!chrome.storage;n++)await new Promise(r=>setTimeout(r,100));return {id:chrome.runtime?.id,storage:!!chrome.storage?.local,version:chrome.runtime?.getManifest?.().version};});
 report.runtime=runtime;
 const expectedVersion=JSON.parse(await fs.readFile('dist/manifest.json','utf8')).version;
 if(runtime.version!==expectedVersion)throw new Error('Installed extension version does not match the built manifest');
 if(!runtime.storage)throw new Error('Native extension storage API unavailable');
 report.checks.push({name:'MV3 service worker and storage APIs',status:'PASS'});
 await context.route('**/*',route=>{
  const request=route.request();
  if(!['GET','HEAD','OPTIONS'].includes(request.method()))return route.abort();
  if(new URL(request.url()).hostname.includes('jobgen'))return route.abort();
  return route.continue();
 });
 const page=await context.newPage();page.on('pageerror',error=>{const origin=error.stack?.includes('chrome-extension://')?'extension':'website-or-unattributed';if(!report.errors.some(row=>row.message===error.message&&row.origin===origin))report.errors.push({message:error.message,origin,stack:error.stack?.slice(0,800)});});
 for(const [site,url,selector] of [
  ['seek','https://au.seek.com/job/95747845','h1[data-automation="job-detail-title"]'],
  ['linkedin','https://www.linkedin.com/jobs/search/?keywords=software%20engineer&location=Sydney','h1'],
  ['indeed','https://au.indeed.com/jobs?q=software+engineer&l=Sydney+NSW','h1']
 ]) {
  try {
   const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:20000});
   await page.waitForTimeout(2500);
   const observation=await page.evaluate(selector=>({title:document.title,url:location.origin+location.pathname,root:!!document.querySelector('#jobgen-react-app'),selectors:document.querySelectorAll(selector).length,loginVisible:!![...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Sign in free')}),selector);
   report.checks.push({name:`${site} public page`,status:response?.status()===200?'OBSERVED':'ACCESS_LIMITED',httpStatus:response?.status(),...observation});
   if(site==='seek') {
    await expect(page.locator('#jobgen-react-app')).toBeAttached({timeout:10000});
    report.checks.push({name:'Native content script injects on SEEK',status:'PASS'});
    if(await page.getByRole('button',{name:'Open JobGen',exact:true}).isVisible()) await page.getByRole('button',{name:'Open JobGen',exact:true}).click();
    await expect(page.getByRole('button',{name:'Sign in free',exact:true})).toBeVisible({timeout:10000});
    await page.getByRole('button',{name:'Minimise JobGen',exact:true}).filter({visible:true}).click();
    await page.getByRole('button',{name:'Open JobGen',exact:true}).click();
    await expect(page.getByRole('button',{name:'Sign in free',exact:true})).toBeVisible();
    report.checks.push({name:'Native SEEK floating button opens login panel',status:'PASS'});
    report.seekSelectors=await page.evaluate(()=>({counts:Object.fromEntries(['h1[data-automation="job-detail-title"]','span[data-automation="advertiser-name"]','span[data-automation="jobCompany"]','a[data-automation="jobCompany"]','span[data-automation="job-detail-location"]','div[data-automation="jobAdDetails"]','[data-automation="job-detail-apply"]'].map(s=>[s,document.querySelectorAll(s).length])),signals:[...new Set([...document.querySelectorAll('[data-automation]')].map(el=>el.getAttribute('data-automation')).filter(s=>/advertiser|company|location|apply/i.test(s)))].slice(0,25)}));
   }
   await page.screenshot({path:`audit/native-public/${site}.png`});
  }catch(error){report.checks.push({name:`${site} public page`,status:'NOT_VERIFIED',reason:error.message.slice(0,600)});}
 }
} catch(error){report.failure=error.message.slice(0,1500);process.exitCode=1;}
finally {
 await context?.close();
 await fs.mkdir('audit/native-public',{recursive:true});
 await fs.writeFile('audit/native-public/results.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
}
