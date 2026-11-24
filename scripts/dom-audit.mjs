import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'espree';
import { JSDOM } from 'jsdom';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const selectorCalls = new Set(['querySelector', 'querySelectorAll', 'closest', 'matches', 'waitForElement']);

export function extractSelectors(source, file) {
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true }, loc: true });
  const result = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'CallExpression') {
      const callee = node.callee;
      const method = callee.type === 'Identifier' ? callee.name : callee.property?.name;
      if (selectorCalls.has(method) && node.arguments.length) {
        const arg = node.arguments[0];
        const selector = arg.type === 'Literal' && typeof arg.value === 'string' ? arg.value :
          arg.type === 'TemplateLiteral' && arg.expressions.length === 0 ? arg.quasis[0].value.cooked : null;
        result.push({ file, line: node.loc.start.line, method, selector, dynamic: selector === null });
      }
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === 'loc') continue;
      if (Array.isArray(value)) value.forEach(visit);
      else if (value?.type) visit(value);
    }
  }
  visit(ast);
  return result;
}

export function inspectSelectors(document, entries) {
  return entries.map(entry => {
    if (entry.dynamic) return { ...entry, status: 'dynamic-not-evaluated', count: null };
    try {
      const count = document.querySelectorAll(entry.selector).length;
      return { ...entry, status: count ? 'matched' : 'unmatched', count };
    } catch { return { ...entry, status: 'invalid-or-unsupported', count: null }; }
  });
}

async function files(directory) {
  const found = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await files(target));
    else if (/\.(js|jsx)$/.test(entry.name)) found.push(target);
  }
  return found.sort();
}

export async function inventory() {
  const entries = [];
  for (const file of await files(path.join(root, 'src'))) {
    entries.push(...extractSelectors(await fs.readFile(file, 'utf8'), path.relative(root, file)));
  }
  return entries;
}

export function browserProbe(entries) {
  // No field values, text, HTML, cookies, storage or URL query strings are read.
  return `// Read-only DOM selector observations. Missing selectors are not automatically bugs.\n(() => {\nconst entries = ${JSON.stringify(entries)};\nconst report = entries.map(entry => {\n if(entry.dynamic) return {...entry,status:'dynamic-not-evaluated',count:null};\n try {const count=document.querySelectorAll(entry.selector).length;return {...entry,status:count?'matched':'unmatched',count};}\n catch {return {...entry,status:'invalid-or-unsupported',count:null};}\n});\nconsole.table(report);\nreturn report;\n})();\n`;
}

async function main() {
  const [command = 'inventory', fixture, scope = ''] = process.argv.slice(2);
  const all = await inventory();
  const entries = scope ? all.filter(entry => entry.file.includes(scope)) : all;
  if (command === 'inventory') {
    await fs.mkdir(path.join(root, 'audit/dom'), { recursive: true });
    await fs.writeFile(path.join(root, 'audit/dom/selectors.json'), JSON.stringify(all, null, 2) + '\n');
    await fs.writeFile(path.join(root, 'audit/dom/browser-probe.js'), browserProbe(all));
    console.log(`${all.length} selector call sites inventoried; ${all.filter(entry => entry.dynamic).length} dynamic calls need runtime inspection.`);
  } else if (command === 'fixture' && fixture) {
    const dom = new JSDOM(await fs.readFile(fixture, 'utf8'));
    try { console.log(JSON.stringify(inspectSelectors(dom.window.document, entries), null, 2)); }
    finally { dom.window.close(); }
  } else {
    throw new Error('Usage: node scripts/dom-audit.mjs inventory | fixture <local-html-file> [source-path-filter]');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
