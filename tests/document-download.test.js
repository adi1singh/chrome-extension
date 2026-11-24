import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { downloadPdf } from '../src/utils/documentDownload.js';
const nativeFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=nativeFetch;});

test('valid PDF signatures are accepted with a canonical upload MIME type',async()=>{
 globalThis.fetch=async()=>new Response('%PDF-1.7\nfixture',{headers:{'Content-Type':'application/octet-stream'}});
 const blob=await downloadPdf('https://example.test/resume.pdf');
 assert.equal(blob.type,'application/pdf');
 assert.match(await blob.text(),/^%PDF-/);
});
test('HTML login responses masquerading as PDF are rejected',async()=>{
 globalThis.fetch=async()=>new Response('<html>Sign in</html>',{headers:{'Content-Type':'application/pdf'}});
 await assert.rejects(downloadPdf('https://example.test/resume.pdf'),{code:'INVALID_DOCUMENT'});
});
test('empty responses and failed HTTP downloads cannot be uploaded',async()=>{
 globalThis.fetch=async()=>new Response('');
 await assert.rejects(downloadPdf('https://example.test/resume.pdf'),{code:'EMPTY_DOCUMENT'});
 globalThis.fetch=async()=>new Response('error',{status:503});
 await assert.rejects(downloadPdf('https://example.test/resume.pdf'),{code:'DOCUMENT_HTTP_ERROR'});
});
test('document size checks reject declared and actual oversized bodies',async()=>{
 globalThis.fetch=async()=>new Response('%PDF-fixture',{headers:{'Content-Length':'99'}});
 await assert.rejects(downloadPdf('https://example.test/resume.pdf',{maxBytes:10}),{code:'DOCUMENT_TOO_LARGE'});
 globalThis.fetch=async()=>new Response('%PDF-fixture');
 await assert.rejects(downloadPdf('https://example.test/resume.pdf',{maxBytes:10}),{code:'DOCUMENT_TOO_LARGE'});
});
test('document requests are not automatically retried after a timeout',async()=>{
 let calls=0;
 globalThis.fetch=async(_,options)=>{calls++;return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('abort'))));};
 await assert.rejects(downloadPdf('https://example.test/resume.pdf',{timeoutMs:10}),{code:'DOCUMENT_TIMEOUT'});
 assert.equal(calls,1);
});
test('caller cancellation interrupts a pending download',async()=>{
 const controller=new AbortController();
 globalThis.fetch=async(_,options)=>new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('abort'))));
 const pending=downloadPdf('https://example.test/resume.pdf',{signal:controller.signal});controller.abort();
 await assert.rejects(pending,{code:'CANCELLED'});
});
test('unsupported document URLs are rejected without making requests',async()=>{
 let calls=0;globalThis.fetch=async()=>{calls++;};
 for(const url of ['not a url','http://example.test/a.pdf','file:///private/file.pdf','data:text/html,no']){
  await assert.rejects(downloadPdf(url),{code:'INVALID_DOCUMENT_URL'});
 }
 assert.equal(calls,0);
});

test('oversized streams are cancelled before the rest of the body is buffered',async()=>{
 let cancelled=false;
 globalThis.fetch=async()=>new Response(new ReadableStream({
  pull(controller){controller.enqueue(new TextEncoder().encode('%PDF-large'));},
  cancel(){cancelled=true;}
 }));
 await assert.rejects(downloadPdf('https://example.test/resume.pdf',{maxBytes:12}),{code:'DOCUMENT_TOO_LARGE'});
 assert.equal(cancelled,true);
});

test('a page switch during download prevents use of the document in the new job',async()=>{
 const previous=globalThis.location;globalThis.location={href:'https://example.test/job/first'};
 globalThis.fetch=async()=>{globalThis.location.href='https://example.test/job/second';return new Response('%PDF-1.7');};
 try {await assert.rejects(downloadPdf('https://example.test/resume.pdf'),{code:'CANCELLED'});}
 finally {globalThis.location=previous;}
});

test('connection failures are reported without uploading or retrying',async()=>{
 let calls=0;globalThis.fetch=async()=>{calls++;throw new TypeError('Offline');};
 await assert.rejects(downloadPdf('https://example.test/resume.pdf'),{code:'DOCUMENT_NETWORK_ERROR'});
 assert.equal(calls,1);
});

test('the deadline also covers a response body that never finishes',async()=>{
 globalThis.fetch=async(_,options)=>new Response(new ReadableStream({
  start(controller){options.signal.addEventListener('abort',()=>controller.error(new Error('aborted')));}
 }));
 await assert.rejects(downloadPdf('https://example.test/resume.pdf',{timeoutMs:10}),{code:'DOCUMENT_TIMEOUT'});
});

test('an already cancelled document request does not start a download',async()=>{
 let calls=0;globalThis.fetch=async()=>{calls++;};
 const controller=new AbortController();controller.abort();
 await assert.rejects(downloadPdf('https://example.test/resume.pdf',{signal:controller.signal}),{code:'CANCELLED'});
 assert.equal(calls,0);
});
