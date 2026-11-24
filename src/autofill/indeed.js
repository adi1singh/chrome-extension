import { downloadPdf } from '../utils/documentDownload.js';
import { assertCanAdvance, FlowStop, visibleForFlow, claimSubmissionAttempt } from '../utils/flowGuard.js';
import { apiFetch } from '../services/httpClient.js';


import { mapStructuredQuestion } from "../services/infoMapping.js";
import {
  submitJobApplication,
  submitJobApplicationOutcome,
  getJWT,
  getStoredFAQData
} from "../services/apiService.js";


// ======================= 基础工具 =======================
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log("[Indeed]", ...a);



let BUSY = false;
let PAGE_ID = 0;          
let ACTIVE_RUN_ID = null; 
let APPLY_KEY = false;
let CURRENT_ID = '';
let SUCCESS_ALREADY_REPORTED = false;


function newPageId() { PAGE_ID += 1; return PAGE_ID; }
function newRunId()  { ACTIVE_RUN_ID = `${PAGE_ID}:${Date.now()}:${Math.random()}`; return ACTIVE_RUN_ID; }
function isActive(runId) { return runId && runId === ACTIVE_RUN_ID; }

// ---------- storage keys ----------
const CURRENT_ID_KEY = "jobgen:current_job_id";
const LAST_ACTION_KEY = "jobgen:last_action"; // "apply_clicked" | "auto_apply" | null
const LAST_JOB_INFO_KEY = "jobgen:last_job_info";
const STEP_FINISH_KEY = "jobgen:indeed_step_finished";

const ACTION_APPLY_CLICKED = "apply_clicked";
const ACTION_AUTO_APPLY = "auto_apply";
const ACTION_AUTOFILL = "auto_fill";

// ==== Indeed SmartApply 常驻 Progress（仅 Autofill）====
import { createProgressEmitters } from '../utils/progressBridge.js';

const prog = createProgressEmitters('indeed');

const pageTitleMap = {
  documents: 'Documents',
  contact: 'Contact info',
  questions: 'Employer questions',
  review: 'Review & Submit',
  success: 'Submitted',
  unknown: 'Working…',
};
const titleOf = (p) => pageTitleMap[p] || pageTitleMap.unknown;

function onSmartApply() {
  return /(^|\.)smartapply\.indeed\.com$/i.test(location.hostname);
}
function forceShowProgress(mode = 'autofill') {
  document.dispatchEvent(new CustomEvent('jobgen-progress-visibility', {
    detail: { site: 'indeed', visible: true, mode, _ts: Date.now() }
  }));
  
}
async function isInJobGenFlow() {
  try {
    const last = await storageGet([LAST_ACTION_KEY]);
    const act = last[LAST_ACTION_KEY];

    if (act === ACTION_AUTO_APPLY || act === ACTION_AUTOFILL) {
      return true;
    }
    return false;
  } catch (e) {
    console.warn('[Indeed] isInJobGenFlow() error:', e);
    return false;
  }
}
async function _keepFinished(message = 'Ready — click Autofill') {

  const inFlow = await isInJobGenFlow();
  if (!inFlow) {
    return;
  }

  const last = await storageGet([LAST_ACTION_KEY]);
    if (last[LAST_ACTION_KEY] === ACTION_AUTO_APPLY) {
       forceShowProgress('apply');
       prog.start('apply', 'Start applying.', 'filling', { message });
       if (!BUSY && onSmartApply()) {
          try { await runFullApplyFlow(); } catch (e) { console.error(e); }
       }
    return;
    }

  if (APPLY_KEY) return;
  if (!onSmartApply()) return;

  const _page = (typeof detectPage === 'function' ? detectPage(): 'unknown');
  const alreadyFinished = await isThisUrlFinished();

  forceShowProgress('autofill');

  if (alreadyFinished) {
    prog.start('autofill', 'Click Next to continue.', 'finished', {message: 'Finished - click Next to continue.'});
  }else {
    prog.start('autofill', 'Please click autofill.', 'finished', { message });
  }

}

// —— Autofill：进入 filling，填完回 finished
async function autofillCurrentPageWithProgress() {
  if (!onSmartApply()) return;

  const page = (typeof detectPage === 'function' ? detectPage() : 'unknown');
  const title = titleOf(page);
  prog.start('autofill', title, 'filling', { message: 'Filling current form…' });

  try {
    await fillCurrentForm(); 
    prog.update(title, 'finished', { message: 'Done. Review and click Next' });
    await markStepFinishedForCurrentUrl();
  } catch (e) {
    prog.error(e?.message || 'Autofill failed. You can edit manually.');
  }
}

// —— Next：仅帮点 Continue；切页后再次保持 finished
async function pressContinueThenIdle() {
  if (!onSmartApply()) return;

  await clearStepFinishedUrl();
  try {
    const ok = await clickPrimary('Continue from panel');
    if (!ok) {
      const form = document.querySelector('form');
      form?.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 150));
      await clickPrimary('Continue fallback');
    }
  } catch (e) {
    prog.error(e?.message || 'Failed to continue');
  }
}

async function clearStepFinishedUrl() {
  try {
    await storageSet({
      [STEP_FINISH_KEY]: ''
    });
  } catch (e) {
    console.warn('[Indeed] clearStepFinishedUrl error:', e);
  }
}
function _isTransitionUrl(href) {
  try {
    const u = new URL(href);
    const path = u.pathname.toLowerCase();
    if (/postresumeapply/i.test(path)) return true;
    return false;
  } catch {
    return false;
  }
}

async function markStepFinishedForCurrentUrl() {
  try {
    const pageName = detectPage();
    if (
      pageName === "transition" ||
      pageName === "unknown" ||
      pageName === "job" ||         
      pageName === "success"       
    ) {
      console.log("[Indeed] skip markStepFinishedForCurrentUrl for page:", pageName, location.href);
      return;
    }

    await storageSet({
      [STEP_FINISH_KEY]: pageName
    });
    console.log("[Indeed] markStepFinishedForCurrentUrl stored:", pageName, "at", location.href);
  } catch (e) {
    console.warn("[Indeed] markStepFinishedForCurrentUrl error:", e);
  }
}

async function isThisUrlFinished() {
  try {
    const st = await storageGet([STEP_FINISH_KEY]);
    const finishedPage = st[STEP_FINISH_KEY];  
    const currentPage  = detectPage();         

    if (!finishedPage) return false;

    if (
      currentPage === "transition" ||
      currentPage === "unknown"
    ) {
      return false;
    }


    const VALID_PAGES = new Set([
      "contact",
      "relevant-experience",
      "questions",
      "documents",
      "review",
      "success"
    ]);
    if (!VALID_PAGES.has(finishedPage)) {
      return false;
    }

    return finishedPage === currentPage;
  } catch (e) {
    console.warn("[Indeed] isThisUrlFinished error:", e);
    return false;
  }
}

function attachProgressLifecyle() {
  const refresh = async () => {
  if (!onSmartApply()) return;

  const inFlow = await isInJobGenFlow();
  const p = (typeof detectPage === 'function' ? detectPage() : 'unknown');

  if (p === 'success') {

    if (inFlow) {
      try {
        const mode = await getModeForSuccessPanel();
         let jobId = '';
        try {
          const cur = await storageGet([CURRENT_ID_KEY]);
          jobId = cur[CURRENT_ID_KEY] || '';
        } catch (e) {
          console.warn('[Indeed][attachProgressLifecyle.refresh] cannot read CURRENT_ID_KEY', e);
        }

        try {
          await handleSuccess(jobId);
        } catch (err) {
          console.error('[Indeed][attachProgressLifecyle.refresh] handleSuccess() failed:', err);
        }
    
        prog.start(
          mode,
          titleOf('success'),
          'submitted',
          { message: 'Application submitted!' }
        );
      } catch (e) {
        console.warn('[Indeed] prog.start failed on success page', e);
      }
    }
    return;
  }

  if (!inFlow) {
    return;
  }

  await handleSmartApplyStepChange("refresh");
};


  window.addEventListener('urlchange', refresh);
  window.addEventListener('pageshow', refresh);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      refresh();
    }
  });


  startPageRefreshWatch(refresh);

  refresh();
  setTimeout(refresh, 120);
}


window.addEventListener('jobgen-ui-autofill', () => {
  if (!onSmartApply()) return;
  autofillCurrentPageWithProgress();
});
window.addEventListener('jobgen-ui-next', () => {
  if (!onSmartApply()) return;
  pressContinueThenIdle();
});

// —— 启动：仅在 SmartApply 挂常驻进度
(function bootIndeedAutofillProgress() {
  if (onSmartApply()) attachProgressLifecyle();
})();


// ---------- 小 helper ----------
const storageSet = (obj) =>
  new Promise((res, rej) => {
    try {
      chrome?.storage?.local?.set(obj, () =>
        chrome.runtime?.lastError ? rej(chrome.runtime.lastError) : res()
      );
    } catch (e) {
      rej(e);
    }
  });

const storageGet = (keys) =>
  new Promise((res, rej) => {
    try {
      chrome?.storage?.local?.get(keys, (r) =>
        chrome.runtime?.lastError ? rej(chrome.runtime.lastError) : res(r)
      );
    } catch (e) {
      rej(e);
    }
  });

// ---- URL change (SPA) patch ----

(function ensureUrlChangeEvents() {
  if (window.__jgUrlPatched) return;
  window.__jgUrlPatched = true;

  const dispatch = () => window.dispatchEvent(new Event('urlchange'));

  const wrap = (k) => {
    const raw = history[k];
    if (typeof raw !== 'function') return;
    history[k] = function (...args) {
      const r = raw.apply(this, args);
      try { dispatch(); } catch { /* Optional operation; preserve the existing fallback. */ }
      return r;
    };
  };

  wrap('pushState');
  wrap('replaceState');
  window.addEventListener('popstate', dispatch);
  window.addEventListener('hashchange', dispatch);
})();

function startPageRefreshWatch(refreshFn) {
  let lastHref = location.href;
  let lastSig  = `${lastHref}::${(typeof detectPage === 'function' ? detectPage() : 'unknown')}`;

  const tick = () => {
    const href = location.href;
    const page = (typeof detectPage === 'function' ? detectPage() : 'unknown');
    const sig  = `${href}::${page}`;
    if (href !== lastHref || sig !== lastSig) {
      lastHref = href;
      lastSig  = sig;
      refreshFn();
    }
  };

  // DOM 结构变化也可能意味着页面切换（SmartApply）
  const mo = new MutationObserver(() => tick());
  mo.observe(document, { childList: true, subtree: true });

  // 轮询兜底（有些内嵌框架不会触发上面两个）
  const id = setInterval(tick, 500);

  window.addEventListener('beforeunload', () => {
    clearInterval(id);
    mo.disconnect();
  });

  // 首次触发一次
  tick();
}


// ---------- id helpers ----------
function getJobId() {
  try {
    const u = new URL(location.href);
    return (
      u.searchParams.get("jk") ||
      u.searchParams.get("vjk") ||
      "unknown"
    );
  } catch {
    return "unknown";
  }
}
const jdKey = (jobId) => `indeed_job_${jobId}`;
const matchKey = (jobId) => `indeed_job_${jobId}_match`;

// ---------- JD save/load ----------
async function setCurrentJobId(jobId) {
  if (!jobId) return;
  if (jobId === 'unknown' || jobId === 'undefined' || jobId === 'null') {
    log('⚠️ skip setCurrentJobId because value is', jobId);
    return;
}
  const cur = await storageGet([CURRENT_ID_KEY]);
  if (cur[CURRENT_ID_KEY] === jobId) {
    return;
}
  await storageSet({ 
    [CURRENT_ID_KEY]: jobId, 
  });
  log('🔑 current_job_id:', jobId);
}

async function saveJD(jd) {
  const id = jd?.job_url_id;
  if (!id) return;
  await storageSet({
    [jdKey(id)]: jd,
    [LAST_JOB_INFO_KEY]: jd,
  });
  log("💾 Saved JD:", id);
}

// ---------- DOM scrape (fallback) ----------
function scrapeCurrentJD() {
  const title =
    document.querySelector('[data-testid="jobsearch-JobInfoHeader-title"]')?.textContent?.trim() ||
    document.querySelector("h1")?.textContent?.trim() ||
    "";
  const company =
    document.querySelector("[data-company-name] a, [data-company-name] div")?.textContent?.trim() ||
    document.querySelector('[data-testid="inlineHeader-companyName"]')?.textContent?.trim() ||
    "";
  const desc =
    document.querySelector('[data-testid="jobsearch-JobComponent-description"]')?.innerText?.trim() ||
    document.querySelector("#jobDescriptionText")?.innerText?.trim() ||
    "";
  const jobId = getJobId();
  const jobUrl = `https://www.indeed.com/viewjob?jk=${jobId}`;
  return {
    job_title: title,
    company,
    description: desc,
    url: jobUrl,
    job_portal: "Indeed",
    job_url_id: jobId,
  };
}

// ---------- active root (iframe-aware) ----------
function getActiveRoot() {
  const localInputs = document.querySelectorAll('input, select, textarea, [contenteditable="true"]');
  if (localInputs.length >= 1) return document;

  const ifrs = Array.from(document.querySelectorAll('iframe'));
  let bestDoc = null;
  let bestCount = 0;

  for (const f of ifrs) {
    try {
      const doc = f.contentDocument || f.contentWindow?.document;
      if (!doc) continue;
      const cnt = doc.querySelectorAll('input, select, textarea, [contenteditable="true"]').length;
      if (cnt > bestCount) {
        bestCount = cnt;
        bestDoc = doc;
      }
    } catch (__) { /* Optional operation; preserve the existing fallback. */ }
  }
  return bestDoc || document;
}

// ---------- page detection ----------
function detectPage() {
  const host = location.hostname.toLowerCase();
  const path = location.pathname.toLowerCase();
  const h1h2 = (document.querySelector("h1,h2")?.textContent || "").trim();

  if (/postresumeapply/i.test(path)) return "transition";

  if (/contact-info-module/.test(path) || /profile-location/.test(path) ) return "contact";

  if (/relevant-experience/.test(path)) return "relevant-experience";

  if (/your application has been submitted/i.test(h1h2)) {
    return "success";
  }

  if (/demographic-questions/.test(path)) return "questions";

  if (
    Array.from(document.querySelectorAll('button,[role="button"]')).some((b) =>
      /Submit( your)? application/i.test((b.innerText || "").trim())
    )
  ) return "review";

  if (
    document.querySelector('input[type="file"][name*="resume" i]') ||
    document.querySelector("#resume") ||
    document.querySelector('[data-testid*="resume"]') ||
    /documents?-module/.test(path)
  ) return "documents";

  const hasForm = !!document.querySelector("form");
  const inputsCount = document.querySelectorAll("input,select,textarea,[contenteditable='true']").length;
  const smartApplyQuestionsPath =
    host.includes("smartapply.indeed.com") &&
    (/questions-module/.test(path) || /\/indeedapply\/form\/.+\/questions/.test(path));

  const isResumeModule = /\/resume-module\//.test(path);
  if (smartApplyQuestionsPath || isResumeModule || (hasForm && inputsCount >= 1)) return "questions";

  if (
    document.querySelector("#indeedApplyButton") ||
    document.querySelector('[data-tn-element="applyButton"]') ||
    document.querySelector('[data-qa="apply-button"], [data-testid*="apply"]') ||
    document.querySelector("#jobDescriptionText, [data-testid='jobsearch-JobComponent-description']")
  ) return "job";

  return "unknown";
}

// ---------- wait for step/url change ----------
async function waitForPageChange(prevPage, prevUrl, { timeout = 15000, tick = 200 } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const nowPage = detectPage();
    const nowUrl = location.href;
    if (nowPage !== prevPage || nowUrl !== prevUrl || nowPage === "success") return true;
    await sleep(tick);
  }
  return false;
}

// ---------- primary click ----------
export async function clickPrimary(hint) {
  const expectedUrl = location.href;
  const labelPattern = hint === "Apply on job page" ? /^(?:apply|apply now)$/i : /^(?:continue|next|review)\b/i;
  const sels = [
    "#indeedApplyButton",
    '[data-qa="continueButton"]',
    'button[type="submit"]',
    '[data-testid*="continue"]',
    '[data-testid*="next"]',
    '[data-testid*="review"]',
    'button[data-testid^="819de2bdfe"][data-testid*="contact-info"]',
    '[data-tn-element="submitButton"]',
    "button",
    'a[role="button"]',
  ];
  for (const sel of sels) {
    const btn = Array.from(document.querySelectorAll(sel)).find((b) =>
      visibleForFlow(b) && labelPattern.test((b.innerText || b.textContent || "").trim())
    );
    if (btn) {
      if (btn.target === "_blank") btn.target = "_self";
      btn.scrollIntoView({ behavior: "smooth", block: "center" });
      await sleep(180);
      assertCanAdvance(btn.form || getActiveRoot(), btn, { site: 'indeed', step: 'advance', expectedUrl });
      btn.click();
      log("▶️ Clicked:", hint || btn.innerText);
      return true;
    }
  }
  return false;
}

// ---------- upload resume from URL ----------
export async function uploadFromUrl(url, kind = "resume", jdForNaming = null) {
  if (!url) return false;
  const expectedUrl = location.href;
  try {
    const blob = await downloadPdf(url);

    const niceName = await buildBrandedFilename(kind, jdForNaming || {});
    console.log("[Indeed] uploadFromUrl using file name:", niceName);

    const file = new File([blob], niceName, {
      type: blob.type || "application/pdf",
    });

    const inputs = Array.from(document.querySelectorAll('input[type="file"]'));
    const target =
      inputs.find((i) => /resume|cv/i.test((i.name || i.id || ""))) ||
      (kind === "cover" &&
        inputs.find((i) => /cover|letter/i.test((i.name || i.id || "")))) ||
      inputs[0];
    if (!target) {
      console.warn("[Indeed] uploadFromUrl: no file input found");
      return false;
    }

    const dt = new DataTransfer();
    dt.items.add(file);
    if (location.href !== expectedUrl) throw new FlowStop('indeed', 'documents', 'CANCELLED');
    target.files = dt.files;
    target.dispatchEvent(new Event("change", { bubbles: true }));

    await sleep(350);
    log(`📄 Uploaded ${kind} file as ${niceName}`);
    return true;
  } catch (e) {
    console.error("uploadFromUrl error:", e);
    return false;
  }
}

// ---------- label & options helpers ----------
function getFieldLabel(node) {
  const byClosestLabel = node.closest("label")?.innerText;
  if (byClosestLabel)
    return byClosestLabel.replace(/\u00a0/g, " ").replace(/\s*\*\s*$/, "").trim();

  if (node.id) {
    const lbl = node.ownerDocument?.querySelector?.(`label[for="${CSS.escape(node.id)}"]`) || document.querySelector(`label[for="${CSS.escape(node.id)}"]`);
    if (lbl?.innerText) return lbl.innerText.replace(/\u00a0/g, " ").replace(/\s*\*\s*$/, "").trim();
  }

  const ariaLabelledby = node.getAttribute?.("aria-labelledby");
  if (ariaLabelledby) {
    const ids = ariaLabelledby.split(/\s+/);
    for (const id of ids) {
      const el = (node.ownerDocument || document).getElementById(id);
      if (el) {
        const asterisk = el.parentElement?.querySelector?.('[data-testid$="-label-asterisk"]');
        if (asterisk) asterisk.remove();
        const txt = (el.innerText || el.textContent || "").replace(/\u00a0/g, " ").replace(/\s*\*\s*$/, "").trim();
        if (txt) return txt;
      }
    }
  }

  const block =
    node.closest('.ia-Questions-item, [data-qa="question-group"], [data-testid*="question"], fieldset, .icl-Questions-item') ||
    node.closest("div");

  if (block) {
    const labelNode =
      block.querySelector?.('[data-testid$="-label"] [data-testid="rich-text"]') ||
      block.querySelector?.('[data-testid$="-label"]') ||
      block.querySelector?.("legend, h3, h4, p, span");

    const raw = (labelNode?.innerText || labelNode?.textContent || "").replace(/\u00a0/g, " ");
    const cleaned = raw.replace(/\s*\*\s*$/, "").trim();
    if (cleaned) return cleaned;
  }

  const aria = node.getAttribute?.("aria-label") || node.placeholder || node.name || node.id || "";
  return aria.trim();
}

function collectOptionsFor(node) {
  const options = {};

  if (node.type === "radio" || node.type === "checkbox") {
    const form = node.closest("form") || (node.ownerDocument || document);
    const group = Array.from(
      form.querySelectorAll(`input[type="${node.type}"][name="${node.name}"]`)
    );
    group.forEach((r) => {
      const txt = r.closest("label")?.innerText || r.getAttribute("aria-label") || r.value || "";
      if (txt) options[txt.trim()] = txt.trim();
    });
  }

  if (node.tagName === "SELECT") {
    Array.from(node.options).forEach((opt) => {
      if (opt.value) options[(opt.textContent || "").trim()] = opt.value;
    });
  }

  return options;
}

// ---------- 清空字段并覆盖填充 ----------
function clearFieldHard(el) {
  try {
    if (!el) return;

    if (el.getAttribute && el.getAttribute("contenteditable") === "true") {
      el.focus();
      el.innerHTML = "";
      el.textContent = "";
      el.dispatchEvent(new InputEvent("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.blur?.();
      return;
    }

    if (el.tagName === "SELECT") {
      el.selectedIndex = -1;
      el.value = "";
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    if (el.type === "radio" || el.type === "checkbox") {
      const form = el.closest("form") || (el.ownerDocument || document);
      const group = Array.from(form.querySelectorAll(`input[type="${el.type}"][name="${el.name}"]`));
      group.forEach(i => {
        if (i.checked) {
          i.checked = false;
          i.dispatchEvent(new Event("input", { bubbles: true }));
          i.dispatchEvent(new Event("change", { bubbles: true }));
        }
      });
      return;
    }

    el.value = "";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  } catch (e) {
    console.warn("[Indeed] clearFieldHard error:", e);
  }
}

// ---------- LLM Q&A ----------
function buildInstructions(question, type) {
  const q = (question || "").toLowerCase();
  if (type === "input") {
    if (q.includes("salary") || q.includes("pay") || q.includes("compensation"))
      return "Provide a numeric salary or range (e.g., '75000', '80k-100k', '120000 AUD'). Answer ≤ 25 chars.";
    if (/(suburb|locality|city|location)\b/.test(q))
      return "Return 'Suburb, City, State' (e.g., 'Bondi, Sydney, NSW'). Answer ≤ 25 chars.";
    if (/(phone|mobile|number)\b/.test(q))
      return "Return ONLY the local phone number (no country/area code, no '+'). Answer ≤ 25 chars.";
    if (q.includes("email"))
      return "Return a valid email like 'john.doe@example.com'. Answer ≤ 25 chars.";
    if (q.includes("notice"))
      return "Return ONLY number of weeks (e.g., '2'). Answer ≤ 25 chars.";
    if (/(availability|start)\b/.test(q))
      return "Return a start date/timeframe (e.g., 'Immediately', '2 weeks'). Answer ≤ 25 chars.";
    return "Provide a clear, specific answer. Answer ≤ 25 chars.";
  }
  if (type === "single choice")
    return "Choose EXACTLY ONE from options. Return ONLY the chosen option text verbatim.";
  if (type === "multiple choice")
    return "Select all that apply, but return ONLY the single most appropriate option text verbatim.";
  return "Choose the most appropriate option(s). Return ONLY the option text verbatim.";
}

async function askLLMStructured(userEmail, { question, type, optionsMap }) {
  try {
    const jwt = await getJWT();
    if (!jwt) return null;

    const payload = {
      email: userEmail || "",
      question,
      options: optionsMap || null,
      instructions: buildInstructions(question, type),
      full_prompt: `Question: "${question}"\n\n${
        optionsMap && Object.keys(optionsMap).length
          ? `Options:\n${Object.values(optionsMap).map((t) => `- ${t}`).join("\n")}\n\n`
          : ""
      }Instructions: ${buildInstructions(question, type)}`,
    };

    const res = await apiFetch("https://candidates.jobgen.ai/api/1.1/wf/jobgen_apply_question", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
      body: JSON.stringify(payload),
    });

    if (!res.ok) return null;
    const data = await res.json();

    if (typeof data?.answer === "string") return data.answer.trim() || null;
    if (data?.response?.answer) {
      const raw = data.response.answer;
      if (typeof raw === "string") {
        if (raw.trim().startsWith("{")) {
          try {
            return (JSON.parse(raw)?.answer || "").trim() || null;
          } catch { /* Optional operation; preserve the existing fallback. */ }
        }
        return raw.trim() || null;
      }
    }
    const legacy = data?.response?.outcome;
    if (legacy && legacy !== "Pass" && legacy !== "Fail") {
      try {
        return (JSON.parse(legacy)?.answer || "").trim() || null;
      } catch { /* Optional operation; preserve the existing fallback. */ }
    }
    return null;
  } catch (e) {
    console.error("askLLMStructured error:", e);
    return null;
  }
}


// ---------- autofill of one field ----------
export async function answerWithInfoMapping(field) {
  const norm = (s) =>
    String(s || "")
      .toLowerCase()
      .replace(/[\u200b-\u200d\uFEFF]/g, "")
      .replace(/[^\w\s]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const tokenize = (s) => norm(s).split(/\s+/).filter(Boolean);
  const core = (raw) => {
    let a = String(raw || "").trim();
    if (a.startsWith("{")) {
      try {
        const j = JSON.parse(a);
        if (j && j.answer) a = String(j.answer).trim();
      } catch { /* Optional operation; preserve the existing fallback. */ }
    }
    const quoted = a.match(/[“"]([^"”]+)[”"]/);
    if (quoted && quoted[1]) return quoted[1].trim();
    return a;
  };
  const fuzzyScore = (answerText, optionText) => {
    const a = norm(answerText);
    const b = norm(optionText);
    if (!a || !b) return 0;
    if (a.includes(b) || b.includes(a)) return Math.min(a.length, b.length) + 10;
    const at = new Set(tokenize(a));
    const bt = new Set(tokenize(b));
    let inter = 0;
    for (const t of at) if (bt.has(t)) inter++;
    return inter;
  };
  const extractIntForLabel = (rawAnswer, labelText) => {
    const isSalary =
      /\b(salary|pay|compensation|rate|wage|annual|per\s*(year|hour)|ctc|package)\b/i.test(labelText);
    const isYears =
      /\b(year|years|yrs)\b/i.test(labelText) || /\byears?\s+of\s+experience\b/i.test(labelText);
    if (!isSalary && !isYears) return null;

    const s = String(rawAnswer || "").toLowerCase();
    const m = s.match(/(\d+(?:[.,]\d+)?)(?:\s*(k|m))?/i);
    if (!m) {
      if (isYears) return "0";
      return null;
    }
    let num = parseFloat(m[1].replace(/,/g, "."));
    if (Number.isNaN(num)) return null;
    if (isSalary) {
      const suffix = (m[2] || "").toLowerCase();
      if (suffix === "k") num *= 1000;
      if (suffix === "m") num *= 1000000;
    }
    const intVal = Math.round(num);
    if (isYears && /(\d+)\s*month/i.test(s) && !/year/i.test(s)) {
      const months = parseInt(s.match(/(\d+)\s*month/i)[1], 10);
      if (!Number.isNaN(months)) return String(Math.round(months / 12));
    }
    return String(intVal);
  };

  // 题干/类型/选项收集
  let label = getFieldLabel(field);
  let baseType = "input";
  let options = {};

  if (field.tagName === "SELECT") {
    baseType = "single choice";
    options = collectOptionsFor(field);
  } else if (field.type === "radio" || field.type === "checkbox") {
    baseType = field.type === "radio" ? "single choice" : "multiple choice";
    const block = field.closest(
      '[data-qa="question-group"], fieldset, .ia-Questions-item, .icl-Questions-item'
    );
    if (block) {
      const legend = block.querySelector("legend,h3,h4,p,span");
      if (legend) label = legend.innerText.trim();
    }
    const group = Array.from(
      (field.closest("form") || (field.ownerDocument || document)).querySelectorAll(
        `input[type="${field.type}"][name="${field.name}"]`
      )
    );
    options = {};
    group.forEach((r) => {
      const txt = (r.closest("label")?.innerText || r.value || "").trim();
      if (txt) options[txt] = txt;
    });
  }

  // 先 info mapping，再兜底 LLM
  let mapped = null;
  try {
    mapped = await mapStructuredQuestion(
      { question: `${label} (optional)`, question_type: baseType, options }
    );
  } catch (e) {
    console.warn("mapStructuredQuestion failed:", e);
  }

  let finalAnswer = mapped && mapped.answer ? String(mapped.answer).trim() : null;
  if (!finalAnswer) {
    const faq = await getStoredFAQData();
    let personalInfo = faq?.personal_info || {};
    if (typeof personalInfo === "string") {
      try { personalInfo = JSON.parse(personalInfo); } catch { personalInfo = {}; }
    }
    const userEmail = typeof personalInfo?.email === "string" ? personalInfo.email.trim() : "";
    finalAnswer = await askLLMStructured(userEmail, {
      question: label,
      type: baseType,
      optionsMap: options,
    });
  }
  if (!finalAnswer) {
    log("⚠️ No answer for:", label);
    return false;
  }

  const answer = core(finalAnswer);

  // 覆盖式回填
  if (field.tagName === "SELECT") {
    clearFieldHard(field);

    let best = null;
    let bestScore = 0;
    for (const opt of Array.from(field.options)) {
      const text = (opt.textContent || opt.label || opt.value || "").trim();
      const score = fuzzyScore(answer, text);
      if (score > bestScore) {
        bestScore = score;
        best = opt;
      }
    }

    if (best) {
      field.value = best.value;
      field.selectedIndex = Array.from(field.options).indexOf(best);
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new Event("change", { bubbles: true }));
      field.style.backgroundColor = "#d4f7d4";
      log(`✅ Filled select "${label}" -> "${best.textContent.trim()}"`);
      return true;
    }

    log(`⚠️ No matching option found for "${answer}" in select "${label}"`);
    return false;
  }

  if (field.type === "radio" || field.type === "checkbox") {
    const form = field.closest("form") || (field.ownerDocument || document);
    const group = Array.from(
      form.querySelectorAll(`input[type="${field.type}"][name="${field.name}"]`)
    );

    group.forEach(i => {
      if (i.checked) {
        i.checked = false;
        i.dispatchEvent(new Event("input", { bubbles: true }));
        i.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });

    let best = null;
    let bestScore = 0;
    for (const i of group) {
      const txt = (i.closest("label")?.innerText || i.value || "").trim();
      const score = fuzzyScore(answer, txt);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }

    if (best) {
      if (!best.checked) best.click();
      const lab = best.closest("label");
      if (lab) lab.style.backgroundColor = "#d4f7d4";
      log(`✅ Checked ${field.type} "${label}" -> "${(lab?.innerText || best.value).trim()}"`);
      return true;
    }

    log(`⚠️ No option matched for "${label}" with answer "${answer}"`);
    return false;
  }

  const purified = extractIntForLabel(answer, label);
  const toFill = purified || answer;

  clearFieldHard(field);

  if (field.getAttribute && field.getAttribute("contenteditable") === "true") {
    field.focus();
    field.innerHTML = "";
    field.textContent = toFill;
    field.dispatchEvent(new InputEvent("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    field.blur?.();
  } else {
    field.value = toFill;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
  }
  field.style.backgroundColor = "#d4f7d4";
  log(`✅ Filled input "${label}" -> "${toFill}" (raw: "${answer}")`);
  return true;
}

// ---------- 分步处理 ----------

async function waitForContactReady(timeout = 6000, rootDoc = document) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const form = rootDoc.querySelector("form");
    const inputs = rootDoc.querySelectorAll('input, select, textarea, [contenteditable="true"]');
    const contBtn = Array.from(rootDoc.querySelectorAll('button,[role="button"]'))
      .find(b => /(continue|next|review)/i.test((b.innerText || b.textContent || "").trim()));
    if (form && inputs.length >= 3 && contBtn) return true; // 联系方式通常 >= 3 个字段
    await sleep(120);
  }
  return false;
}

async function handleContactInfo({ advance } = { advance: false }) {
  const root = getActiveRoot();
  await waitForContactReady(6000, root);
  const form = root.querySelector("form") || root;

  const visible = (el) => {
    const s = (root.defaultView || window).getComputedStyle(el);
    return !(s.display === "none" || s.visibility === "hidden" || s.opacity === "0") &&
           (el.offsetParent !== null || s.position === "fixed");
  };

  const fields = Array.from(form.querySelectorAll('input, select, textarea, [contenteditable="true"]'))
    .filter((el) => !el.disabled && !el.readOnly && visible(el));

  for (const f of fields) {
    try {
      await answerWithInfoMapping(f);
      await sleep(10);
    } catch (e) {
      console.warn("[Indeed] handleContactInfo fill error:", e);
    }
  }

  if (advance) {
    await sleep(200);
    await clickPrimary("Continue on contact-info");
  }
  return true;
}

async function handleExperience({ advance } = { advance: false }) {
  try {
    // 从 localStorage 获取存储的经验数据
    const faqData = await getStoredFAQData();
    const experienceData = faqData.experience;
    const parsedExperienceData = JSON.parse(experienceData);
    
    log('aaaaaaaaaaaaaaa');
    log(experienceData);
    log('bbbbbbbbbbbbbb');
    log(parsedExperienceData[0]);

    // 获取输入框
    const titleInput = document.querySelector('input[name="jobTitle"]');
    const companyInput = document.querySelector('input[name="companyName"]');

    if (!experienceData) {
      console.warn("No experience data found in localStorage");
      return;
    }

    // 填充 job title
    if (titleInput) {
      const title = parsedExperienceData[0]?.title;
      if (title) {
        titleInput.value = title;
        titleInput.dispatchEvent(new Event("input", { bubbles: true }));
        titleInput.dispatchEvent(new Event("change", { bubbles: true }));
        titleInput.style.backgroundColor = "#d4f7d4";  // 设置背景颜色为绿色
        console.log("Filled job title:", title);
      } else {
        console.warn("Experience title is missing");
      }
    } else {
      console.warn("Job title input field not found");
    }

    // 填充 company name
    if (companyInput) {
      const companyName = parsedExperienceData[0]?.company_name;
      if (companyName) {
        companyInput.value = companyName;
        companyInput.dispatchEvent(new Event("input", { bubbles: true }));
        companyInput.dispatchEvent(new Event("change", { bubbles: true }));
        companyInput.style.backgroundColor = "#d4f7d4";  // 设置背景颜色为绿色
        console.log("Filled company name:", companyName);
      } else {
        console.warn("Experience company name is missing");
      }
    } else {
      console.warn("Company name input field not found");
    }
    
  } catch (e) {
    console.error("Error in handleExperience:", e);
  }

  if (advance) {
    await sleep(200);
    await clickPrimary("Continue on experience");
  }

  return true;
}
async function resolveTargetTitleForFileName(jdFallback) {
  // 0. try structured storage (preferred)
  try {
    const keys = await storageGet([CURRENT_ID_KEY]);
    const curId = keys[CURRENT_ID_KEY];
    if (curId && curId !== 'unknown' && curId !== 'undefined' && curId !== 'null') {
      const jobKey = jdKey(curId); // => `indeed_job_${curId}`
      const storedJobWrap = await storageGet([jobKey]);
      const storedJob = storedJobWrap[jobKey];
      if (storedJob) {
        // pick best title
        const t = storedJob.job_title || storedJob.jobTitle;
        if (t && t.trim()) {
          return t.trim();
        }
      }
    }
  } catch (e) {
    console.warn("[Indeed][resolveTargetTitleForFileName] failed structured read:", e);
  }

  // 1. fallback to whatever jdFallback told us
  if (jdFallback) {
    const t2 = jdFallback.job_title || jdFallback.jobTitle;
    if (t2 && t2.trim()) {
      return t2.trim();
    }
  }

  // 2. final fallback
  return "Role";
}
async function buildBrandedFilename(kind, jdForNaming) {

  let first = "Candidate";
  try {
    const stored = await chrome.storage.local.get(['user_faq_data']);
    const raw = stored.user_faq_data;
    if (raw) {
      let personal = raw.personal_info;
      if (typeof personal === 'string') {
        try { personal = JSON.parse(personal); } catch { /* Optional operation; preserve the existing fallback. */ }
      }
      if (personal && personal.first_name) {
        first = personal.first_name;
      }
    }
  } catch (e) {
    console.warn("[Indeed] buildBrandedFilename: cannot read user_faq_data", e);
  }

  const targetTitleRaw = await resolveTargetTitleForFileName(jdForNaming);
  let targetTitle = targetTitleRaw || "Role";

  const fileTypeLabel = kind === "cover" ? "CoverLetter" : "Resume";

  // 4️⃣ 拼成 basename
  let base = [first, targetTitle, fileTypeLabel]
    .filter(Boolean)
    .join(" ");

  // 5️⃣ 清理非法字符、压缩成短横线风格
  base = base
    .replace(/[/\\?%*:|"<>]/g, " ")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  // (可选) 截断过长的 title，避免 ATS 抱怨太长的文件名
  if (base.length > 80) {
    base = base.slice(0, 80).replace(/-+$/, "");
  }

  return `${base}.pdf`;
}



async function fetchJDForDocuments() {
  // 0) current id
  try {
    const cur = await storageGet([CURRENT_ID_KEY]);
    const currentId = cur[CURRENT_ID_KEY];
    if (currentId) {
      const byCur = await storageGet([jdKey(currentId)]);
      if (byCur[jdKey(currentId)]) return byCur[jdKey(currentId)];
    }
  } catch { /* Optional operation; preserve the existing fallback. */ }

  // 1) URL id
  try {
    const u = new URL(location.href);
    const urlId = u.searchParams.get("jk") || u.searchParams.get("vjk") || "unknown";
    if (urlId) {
      const byId = await storageGet([jdKey(urlId)]);
      if (byId[jdKey(urlId)]) return byId[jdKey(urlId)];
    }
  } catch { /* Optional operation; preserve the existing fallback. */ }

  // 2) last job info
  try {
    const last = await storageGet([CURRENT_ID_KEY, LAST_JOB_INFO_KEY]);
    if (last[CURRENT_ID_KEY]) {
      const byLast = await storageGet([jdKey(last[CURRENT_ID_KEY])]);
      if (byLast[jdKey(last[CURRENT_ID_KEY])]) return byLast[jdKey(last[CURRENT_ID_KEY])];
    }
    if (last[LAST_JOB_INFO_KEY]) return last[LAST_JOB_INFO_KEY];
  } catch { /* Optional operation; preserve the existing fallback. */ }

  // 3) fallback: scrape current page
  return scrapeCurrentJD();
}

async function handleDocuments(jd, { advance } = { advance: false }) {
  const expectedUrl = location.href;
  log("Collecting job data…");
  const payload = {
    job_url: jd?.url || "unknown",
    description:
      jd?.description ||
      document.querySelector('[data-testid="jobsearch-JobComponent-description"]')?.innerText?.trim() ||
      document.querySelector("#jobDescriptionText")?.innerText?.trim() ||
      "",
    cover_letter: "no",
    company: jd?.company || jd?.companyName || "",
    job_title: jd?.job_title || jd?.jobTitle || "",
    job_url_id: jd?.job_url_id || jd?.jobId || "unknown",
    job_portal: jd?.job_portal || "Indeed",
    updated_resume: "yes",
  };

  const required = ["job_url", "description", "cover_letter", "company", "job_title", "job_url_id", "job_portal"];
  for (const k of required) {
    if (!payload[k] || String(payload[k]).trim() === "") {
      console.error(`❌ Missing required field: ${k}`, payload);
      return false;
    }
  }
  log("Requesting personalized documents…");
  let result = null;
  try {
    result = await submitJobApplication(payload);
  } catch (e) {
    console.error("submitJobApplication error:", e);
  }
  if (!result?.success) {
    console.warn("Resume generation failed:", result);
    return false;
  }
  log("Uploading resume…");
  if (!await uploadFromUrl(result.resume, "resume", jd)) throw new FlowStop('indeed', 'documents', 'UPLOAD_FAILED');
  await sleep(400);

  if (advance) {
    const labelRe = /^(continue|next|review)/i;
    const selectors = [
      '[data-qa="continueButton"]',
      '[data-testid*="continue"]',
      'button[type="submit"]',
      'button',
      'a[role="button"]',
    ];
    const t0 = Date.now();
    while (Date.now() - t0 < 8000) {
      for (const sel of selectors) {
        const btn = Array.from(document.querySelectorAll(sel)).find((b) => {
          const txt = (b.innerText || b.textContent || "").trim();
          const disabled = b.disabled || b.getAttribute("aria-disabled") === "true";
          const visible = getComputedStyle(b).display !== "none" && b.offsetParent !== null;
          return labelRe.test(txt) && !disabled && visible;
        });
        if (btn) {
          btn.scrollIntoView({ behavior: "smooth", block: "center" });
          await sleep(120);
          assertCanAdvance(btn.form || getActiveRoot(), btn, { site: 'indeed', step: 'documents', expectedUrl });
          btn.click();
          return true;
        }
      }
      const form = document.querySelector("form");
      if (form) form.dispatchEvent(new Event("change", { bubbles: true }));
      await sleep(250);
    }
  }
  return true;
}

const Q_LOG = (...a) => console.log("[Indeed][Q]", ...a);

function qIsVisible(el) {
  if (!el) return false;
  const st = (el.ownerDocument?.defaultView || window).getComputedStyle(el);
  if (st.display === "none" || st.visibility === "hidden" || st.opacity === "0") return false;
  if (el.offsetParent === null && st.position !== "fixed") return false;
  return true;
}

function getRadioGroup(form, el) {
  const name = el?.name || "";
  if (!name) return [el];
  return Array.from(form.querySelectorAll(`input[type="${el.type}"][name="${CSS.escape(name)}"]`));
}

function isFieldFilled(form, el) {
  if (!qIsVisible(el)) return true;

  if (el.tagName === "SELECT") {
    return !!(el.value && el.selectedIndex >= 0);
  }

  if (el.type === "radio" || el.type === "checkbox") {
    const group = getRadioGroup(form, el);
    const checkedVisible = group.some(i => i.checked && qIsVisible(i.closest("label") || i));
    Q_LOG("isFilled (", el.type, ")", getFieldLabel(el), "=>", checkedVisible);
    return checkedVisible;
  }

  if (el.getAttribute && el.getAttribute("contenteditable") === "true") {
    const t = (el.innerText || el.textContent || "").trim();
    return t.length > 0;
  }

  return !!(el.value && String(el.value).trim());
}

async function waitForQuestionsReady(timeout = 6000, rootDoc = document) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const form = rootDoc.querySelector("form");
    const inputs = rootDoc.querySelectorAll('input, select, textarea, [contenteditable="true"]');
    const contBtn = Array.from(rootDoc.querySelectorAll('button,[role="button"]'))
      .find(b => /(continue|next|review)/i.test((b.innerText || b.textContent || "").trim()));
    if (form && inputs.length > 0 && contBtn) return true;
    await sleep(120);
  }
  return false;
}

async function handleQuestions({ advance } = { advance: false }) {
  console.log("[Indeed] 🧩 Enter handleQuestions()");
  log("Analyzing questions…");

  const root = getActiveRoot();
  await waitForQuestionsReady(600, root);

  const form = root.querySelector("form") || root;

  const all = Array.from(form.querySelectorAll('input, select, textarea, [contenteditable="true"]'))
    .filter(el => {
      if (el.closest && el.closest("#jobgen-react-app")) return false;
      if (el.disabled || el.readOnly) return false;
      return qIsVisible(el);
    });

  const seenGroups = new Set();
  const fields = all.filter(el => {
    if (el.type === "radio" || el.type === "checkbox") {
      const key = `${el.type}::${el.name || ""}`;
      if (seenGroups.has(key)) return false;
      seenGroups.add(key);
      return true;
    }
    return true;
  });

  Q_LOG("Found fields:", fields.length);

  let filledSomething = false;

  for (const field of fields) {
    try {
      const ok = await answerWithInfoMapping(field);
      if (ok) filledSomething = true;
      else Q_LOG("No fill for:", getFieldLabel(field));
      await sleep(60);
    } catch (e) {
      console.warn("[Indeed] answerWithInfoMapping error:", e);
    }
  }
  log("Answers filled");

  if (advance) {
    const allDone = fields.every(el => isFieldFilled(form, el));
    if (filledSomething || allDone) {
      log("Continuing…");
      await sleep(300);
      await clickPrimary("Continue after questions");
    } else {
      console.warn("[Indeed] ⚠️ Skip Continue (nothing filled)");
    }
  }

  return true;
}

export async function handleReview() {
  const expectedUrl = location.href;
  log("Submitting application…");
  const submit = Array.from(document.querySelectorAll('button,[role="button"]')).find((b) =>
    /Submit( your)? application/i.test((b.innerText || "").trim())
  );
  if (submit) {

    submit.scrollIntoView({ behavior: "smooth", block: "center" });
    await sleep(250);
    assertCanAdvance(submit.form || getActiveRoot(), submit, { site: 'indeed', step: 'review', expectedUrl });
    claimSubmissionAttempt(submit.form || getActiveRoot(), 'indeed');
    submit.click();
    return true;
  }
  return false;
}
async function getModeForSuccessPanel() {
  try {
    const obj = await storageGet([LAST_ACTION_KEY]);
    const last = obj[LAST_ACTION_KEY];


    if (last === ACTION_AUTO_APPLY) {
      return 'apply';
    }
    if (last === ACTION_AUTOFILL) {
      return 'autofill';
    }

    return 'autofill';
  } catch (e) {
    console.warn('[Indeed] getModeForSuccessPanel failed:', e);
    return 'autofill';
  }
}
async function handleSuccess(jobId) {
  try {
    if (SUCCESS_ALREADY_REPORTED) {
      console.log('[Indeed] 🔁 handleSuccess() skipped: already handled in this tab');
      return true;
    }
    if (!jobId || jobId === 'unknown' || jobId === 'undefined' || jobId === 'null') {
      const ids = await storageGet([CURRENT_ID_KEY]);
      jobId = ids[CURRENT_ID_KEY] || '';
    }

    if (!jobId || jobId === 'unknown' || jobId === 'undefined' || jobId === 'null') {
      console.error('[Indeed]  Missing job_id in handleSuccess');
      return false;
    }
    try {
      const prev = await storageGet(['jobgen:last_success_job_id']);
      if (prev['jobgen:last_success_job_id'] === jobId) {
        console.log('[Indeed] ✅ handleSuccess skipped (already reported for job', jobId, ')');
        SUCCESS_ALREADY_REPORTED = true;
        return true;
      }
    } catch (e) {
      console.warn('[Indeed] could not read last_success_job_id:', e);
    }

    try {
      await storageSet({
        [CURRENT_ID_KEY]: jobId,
        'jobgen:last_success_job_id': jobId,
      });
    } catch (e) {
      console.warn('[Indeed] ⚠️ failed to persist job ids:', e);
    }
    SUCCESS_ALREADY_REPORTED = true;
    const payload = {
      application_status: 'Applied',
      job_id: String(jobId),
      job_portal: 'Indeed',
    };

    try {
      const res = await submitJobApplicationOutcome(payload);
      console.log('[Indeed] 📬 submitJobApplicationOutcome →', res);
    } catch (e) {
      console.error('[Indeed] submitJobApplicationOutcome error:', e);
    }

    try {
      if (prog && typeof prog.start === 'function') {
        try {
          const st = await storageGet([LAST_ACTION_KEY]);
          const lastAction = st[LAST_ACTION_KEY];

          if (lastAction === ACTION_AUTOFILL) {
            prog.start(
              'autofill',
              'Application Submitted',
              'submitted',
              { message: 'Application submitted successfully!' }
            );
          } else {
            prog.start(
              'apply',
              'Application Submitted',
              'submitted',
              { message: 'Application submitted successfully!' }
            );
          }
        } catch (eInner) {
          console.warn('[Indeed] prog.start inner block failed:', eInner);
        }
      }
    } catch (eOuter) {
      console.warn('[Indeed] prog.start outer block failed:', eOuter);
    }

    try {
      await storageSet({ [LAST_ACTION_KEY]: null });
    } catch (e) {
      console.warn('[Indeed] failed to clear LAST_ACTION_KEY:', e);
    }

    console.log('[Indeed] 🎉 Application finished. (reported once)');
    return true;

  } catch (e) {
    console.error('[Indeed] handleSuccess fatal error:', e);
    return false;
  }
}



async function fillCurrentForm({ runId } = {}) {
  const page = detectPage();

  if (runId && !isActive(runId)) return false;

  let didSomething = false;

  switch (page) {
    case "documents": {
      const jd = await fetchJDForDocuments();
      if (runId && !isActive(runId)) return false;
      await handleDocuments(jd, { advance: false });
      didSomething = true;
      break;
    }
    case "contact": {
      if (runId && !isActive(runId)) return false;
      await handleContactInfo({ advance: false });
      didSomething = true;
      break;
    }
    case "relevant-experience": {
      if (runId && !isActive(runId)) return false;
      await handleExperience({ advance: false });
      didSomething = true;
      break;
    }
    case "questions": {
      if (runId && !isActive(runId)) return false;
      await handleQuestions({ advance: false });
      didSomething = true;
      break;
    }
    default: {
      console.log("[Indeed] No fillable form on this page:", page);
      didSomething = false;
      break;
    }
  }

  if (didSomething && (!runId || isActive(runId))) {
    await markStepFinishedForCurrentUrl();
  }

  return didSomething;
}



// ================= Public: Autofill（不再跨页自动触发） =================
export async function autofillIndeed() {
  if (BUSY) return;
  BUSY = true;
  await storageSet({ [LAST_ACTION_KEY]: ACTION_AUTOFILL});

  try {
    const host = location.hostname.toLowerCase();
    const isSmartApply = host.includes("smartapply.indeed.com");
    if (isSmartApply) {
      const runId = newRunId();
      const page = detectPage();
      prog.start('indeed', page, 'filling', { message: 'Autofilling current step…' });

      await fillCurrentForm({ runId }); 


      if (isActive(runId)) {
        const _nowPage = detectPage();
        prog.update('Click Next to continue.', 'finished', { message: 'Finished — click Next to continue.' });
      }
      return;
    }

    const applyBtn = document.querySelector(
      '#indeedApplyButton, [data-tn-element="applyButton"], [data-qa="apply-button"], [data-testid*="apply"]'
    );
    if (applyBtn) {
      try {
        const jd = scrapeCurrentJD();
        await saveJD(jd);
        const maybeId = jd?.job_url_id || getJobId();
        await setCurrentJobId(maybeId);
        await storageSet({ [LAST_ACTION_KEY]: ACTION_AUTOFILL, "autofill_after_jump" : true, });
        if (window.__lastJobMatchData) {
      await storageSet({ [matchKey(jd.job_url_id)]: window.__lastJobMatchData });
    }
 
      } catch { /* Optional operation; preserve the existing fallback. */ }
      if (applyBtn.target === "_blank") applyBtn.target = "_self";
      window.__jgProgrammaticApply = true;
      applyBtn.click();
      setTimeout(() => {
        window.__jgProgrammaticApply = false;
      }, 2000);
    }
  } catch (e) {
    console.error("autofillIndeed error:", e);
    prog.error(e instanceof FlowStop ? e.message : "Autofill stopped. Review this step before continuing.");
  } finally {
    BUSY = false;
  }
}

// ================= Public: Apply（全流程自动） =================
export async function applyIndeed() {
  APPLY_KEY = true;
  const cur = await storageGet(["jobgen:current_job_id"]);
  CURRENT_ID = cur["jobgen:current_job_id"];
  const host = location.hostname.toLowerCase();
  await storageSet({ [LAST_ACTION_KEY]: ACTION_AUTO_APPLY , autofill_after_jump: false,});

  if (host.includes("indeed.") && !host.includes("smartapply.")) {
    try {
      
      const jd = scrapeCurrentJD();
      await saveJD(jd);
      const maybeId = jd?.job_url_id || getJobId();
      await setCurrentJobId(maybeId);

      window.__jgProgrammaticApply = true;
      if (window.__lastJobMatchData) {
        await storageSet({ [matchKey(jd.job_url_id)]: window.__lastJobMatchData });
      }

      await storageSet({ [LAST_ACTION_KEY]: ACTION_AUTO_APPLY , autofill_after_jump: false});
      await clickPrimary("Apply on job page");
      await storageSet({ [LAST_ACTION_KEY]: ACTION_AUTO_APPLY , autofill_after_jump: false});
      setTimeout(() => { window.__jgProgrammaticApply = false; }, 2000);
      await storageSet({ [LAST_ACTION_KEY]: ACTION_AUTO_APPLY , autofill_after_jump: false});
    } catch (e) {
      console.error("applyIndeed from job page error:", e);
    }
    return;
  }

  if (host.includes("smartapply.indeed.com")) {
    prog.start('apply', 'Preparing application flow…', 'filling',{});
    const last = await storageGet([LAST_ACTION_KEY]);
    if (last[LAST_ACTION_KEY] === ACTION_AUTO_APPLY) {
      log("Preparing application flow…");
      await runFullApplyFlow();
    } else {
      log("Apply clicked on Smart Apply but no auto_apply flag; doing nothing.");
    }
  }
}

// ================= Orchestrator (full) =================
export async function runFullApplyFlow() {
  if (BUSY) return;
  BUSY = true;
  
  try {
    let steps = 0;
    const MAX_STEPS = 40;

    while (steps++ < MAX_STEPS) {
      APPLY_KEY = true;
      const beforePage = detectPage();
      const beforeUrl = location.href;

      if (beforePage === "success") {
        prog.start('apply','Congradulations!', 'submitted', {});
        await handleSuccess(CURRENT_ID);
        break;
      }

      if (beforePage === "documents") {
        log("Generating resume/cover letter…");
        prog.start('apply','Generating resume/cover letter…', 'filling', {});
        const jd = await fetchJDForDocuments();
        if (!await handleDocuments(jd, { advance: true })) throw new FlowStop('indeed', 'documents', 'UPLOAD_FAILED');
        log("Documents uploaded, continuing…");
        prog.start('apply','Documents uploaded, continuing…', 'filling', {});
      } else if (beforePage === "contact") {
        log("Filling contact information…");
        prog.start('apply','Filling contact information…', 'filling', {});
        await handleContactInfo({ advance: true });
        log("Contact info done, continuing…");
        prog.start('apply','Contact info done, continuing…', 'filling', {});
        } else if (beforePage ===  'relevant-experience') {
          prog.start('apply','Filling relevant experience', 'filling', {});
          await handleExperience({ advance: true });
          prog.start('apply','Relevant experience done, continuing…', 'filling', {});
      } else if (beforePage === "questions") {
        log("Answering employer questions…");
        prog.start('apply','Answering employer questions…', 'filling', {});
        await handleQuestions({ advance: true });
        log("Questions completed, continuing…");
        prog.start('apply','Questions completed, continuing…', 'filling', {});
      } else if (beforePage === "review") {
        log("Reviewing & submitting…");
        prog.start('apply','Reviewing & submitting…', 'filling', {});
        await handleReview();
      } else {
        log("Navigating…");
        throw new FlowStop('indeed', 'advance', 'UNKNOWN_STEP');
      }

      const advanced = await waitForPageChange(beforePage, beforeUrl, { timeout: 15000 });
      if (!advanced) throw new FlowStop('indeed', 'advance', 'NO_TRANSITION');
    }

    if (detectPage() === "success") {
      log("Finalizing…");
      log("✅ Application submitted!");
    }
  } catch (e) {
    console.error("runFullApplyFlow error:", e);
    prog.error(e instanceof FlowStop ? e.message : "Application stopped. Review this step before continuing.");
  } finally {
    BUSY = false;
    APPLY_KEY = false;
    try { await storageSet({ [LAST_ACTION_KEY]: null }); } catch { /* Optional operation; preserve the existing fallback. */ }
  }
}

// ================= Bootstrapping & Intercepts =================
function isSmartApplyDomain() {
  return /(^|\.)smartapply\.indeed\.com$/.test(location.hostname.toLowerCase());
}

function bindApplyClickInterceptor() {
  const SELECTORS = [
    "#indeedApplyButton",
    '[data-tn-element="applyButton"]',
    '[data-qa="apply-button"]',
    '[data-testid*="apply"]',
    'a[role="button"]',
    "button",
  ];

  document.addEventListener(
    "click",
    async (e) => {
      if (window.__jgProgrammaticApply) return;
      const t = e.target.closest(SELECTORS.join(","));
      if (!t) return;
      const label = (t.innerText || t.textContent || "").trim();
      if (!/apply/i.test(label)) return;

      try {
        const jd = scrapeCurrentJD();
        await saveJD(jd);
        const maybeId = jd?.job_url_id || getJobId();
        await setCurrentJobId(maybeId);

        if (window.__lastJobMatchData) {
          await storageSet({ [matchKey(jd.job_url_id)]: window.__lastJobMatchData });
        }

        await storageSet({ [LAST_ACTION_KEY]: null });
        log("🧭 Intercepted Apply click → saved JD & set last_action=apply_clicked");
        if (t.target === "_blank") t.target = "_self";
      } catch (err) {
        console.warn("intercept apply click error:", err);
      }
    },
    true
  );
}

function hasVisibleFillableField(rootDoc = document) {
  const form = rootDoc.querySelector("form") || rootDoc;
  const fields = Array.from(
    form.querySelectorAll('input, select, textarea, [contenteditable="true"]')
  ).filter(el => {
    if (el.disabled || el.readOnly) return false;
    const st = (el.ownerDocument?.defaultView || window).getComputedStyle(el);
    const hidden = st.display === "none" || st.visibility === "hidden" || st.opacity === "0";
    if (hidden) return false;
    if (el.offsetParent === null && st.position !== "fixed") return false;
    return true;
  });

  return fields.length >= 1;
}

// ======= Boot =======
(function boot() {
  bindApplyClickInterceptor();
})();

async function handleSmartApplyStepChange(trigger) {
  console.log("[Indeed][AutofillJump] fired by:", trigger, "href=", location.href);

  newPageId();
  ACTIVE_RUN_ID = null;

  if (!isSmartApplyDomain()) {
    console.log("[Indeed][AutofillJump] not smartapply domain, bail");
    return;
  }

  const inFlow = await isInJobGenFlow();
  if (!inFlow) {
    console.log("[Indeed][AutofillJump] not in flow, bail");
    return;
  }

  const page = detectPage?.() || 'unknown';
  console.log("[Indeed][AutofillJump] detected page:", page);

  let st = {};
  try {
    st = await storageGet(["autofill_after_jump", LAST_ACTION_KEY]);
    console.log("[Indeed][AutofillJump] storageGet:", st);
  } catch (e) {
    console.warn("[Indeed][AutofillJump] storageGet error:", e);
  }

  const pending = !!st["autofill_after_jump"]; 
  const mode = st[LAST_ACTION_KEY];            
  console.log("[Indeed][AutofillJump] pending?", pending, "mode?", mode);

  // ── 分支1：自动填一页（autofill 模式，且是刚从 JD 跳进来的第一次页面）
  if (pending && mode === ACTION_AUTOFILL) {
    const rootDoc = getActiveRoot();
    const deadline = Date.now() + 2000; // 最多等2秒，确保React把表单mount上来

    while (!hasVisibleFillableField(rootDoc) && Date.now() < deadline) {
      await sleep(100);
    }

    let filledOk = false;

    // 表单还没渲染好 => 不真的填，只是展示“正在准备中”，并且保持 autofill_after_jump=true
    if (!hasVisibleFillableField(rootDoc)) {
      console.log("[Indeed][AutofillJump] no visible fields yet, will retry on next tick (keep autofill_after_jump=true)");
      prog.start(
        'autofill',
        'Working…',
        'filling',
        { message: 'Preparing application…' }
      );
      return;
    }

    // 表单已经渲染好了 => 真正开始自动填这一页
    const runId = newRunId();
    prog.start(
      'autofill',
      page,
      'filling',
      { message: 'Autofilling current step…' }
    );

    try {
      await fillCurrentForm({ runId });
      filledOk = true;
      console.log("[Indeed][AutofillJump] fillCurrentForm() done once");

      if (isActive(runId)) {
        await markStepFinishedForCurrentUrl();
        prog.update(
          'Click Next to continue.',
          'finished',
          { message: 'Finished — click Next to continue.' }
        );
      } else {
        console.log("[Indeed][AutofillJump] runId no longer active after fillCurrentForm");
      }
    } catch (err) {
      console.error("[Indeed][AutofillJump] ERROR during autofill:", err);
      prog.error('Autofill failed. You can edit manually.');
    }

    if (filledOk) {
      try {
        await storageSet({ "autofill_after_jump": false });
        console.log("[Indeed][AutofillJump] Cleared autofill_after_jump flag after successful autofill");
      } catch (e) {
        console.warn("[Indeed][AutofillJump] Failed to clear autofill_after_jump flag:", e);
      }
    }

    return;
  } // ←←← 这个大 if (pending && mode === ACTION_AUTOFILL) 现在被正确关上了

  // ── 分支2：自动整套投递（auto_apply 模式）
  if (mode === ACTION_AUTO_APPLY) {
    console.log("[Indeed][AutofillJump] auto_apply mode detected");

    forceShowProgress('apply');

    prog.start(
      'apply',
      'Preparing application…',
      'filling',
      { message: 'Applying automatically…' }
    );

    try {
      // 确保 CURRENT_ID 最新
      try {
        const cur = await storageGet([CURRENT_ID_KEY]);
        CURRENT_ID = cur[CURRENT_ID_KEY] || CURRENT_ID || '';
      } catch (e) {
        console.warn("[Indeed][AutofillJump] couldn't sync CURRENT_ID", e);
      }

      await runFullApplyFlow();
    } catch (e) {
      console.error("[Indeed][AutofillJump] runFullApplyFlow error:", e);
      prog.error('Auto-apply encountered an error. You can continue manually.');
    }

    return;
  }

  // ── 分支3：普通状态下页面切换（既不是首次 pending autofill，也不是全自动 auto_apply）
  console.log("[Indeed][AutofillJump] default branch (no pending autofill_after_jump)");

  if (page === 'success') {
    console.log("[Indeed][AutofillJump] success page — calling handleSuccess");
    forceShowProgress('autofill'); // or 'apply' depending on mode
    try {
    let jobId = '';
    try {
      const cur = await storageGet([CURRENT_ID_KEY]);
      jobId = cur[CURRENT_ID_KEY] || '';
    } catch (e) {
      console.warn("[Indeed][AutofillJump] couldn't get CURRENT_ID_KEY for handleSuccess", e);
    }

    await handleSuccess(jobId);
  } catch (e) {
    console.error("[Indeed][AutofillJump] handleSuccess() failed on success page:", e);
  }

    prog.start(
      await getModeForSuccessPanel(),
      'Application Submitted',
      'submitted',
      { message: 'Application submitted!' }
    );

    
  return;
}


  if (page === 'transition' || page === 'unknown') {
    forceShowProgress('autofill');
    prog.start(
      'autofill',
      'Working…',
      'filling',
      { message: 'Preparing application…' }
    );
    return;
  }

  if (page === 'review') {
    forceShowProgress('autofill');
    prog.start(
      'autofill',
      'Review & Submit',
      'finished',
      { message: 'Final step: A CAPTCHA may appear. Please complete it then click "Submit your application" manually.' }
    );
    return;
  }

  const alreadyFinished = await isThisUrlFinished(); // now based on pageName, not URL
  console.log("[Indeed][AutofillJump] alreadyFinished?", alreadyFinished, "for page", page);

  forceShowProgress('autofill');

  if (alreadyFinished) {
    prog.start(
      'autofill',
      'Click Next to continue.',
      'finished',
      { message: 'Finished — click Next to continue.' }
    );
  } else {
    prog.start(
      'autofill',
      'Click Autofill to fill this step.',
      'finished',
      { message: 'Ready — click Autofill to fill this step.' }
    );
  }
}
// hook up both urlchange and pageshow
window.addEventListener('urlchange', () => {
  handleSmartApplyStepChange("urlchange");
});
window.addEventListener('pageshow', () => {
  handleSmartApplyStepChange("pageshow");
});
window.addEventListener('beforeunload', async () => {
  try {
      await storageSet({ [LAST_ACTION_KEY]: null });
      window.dispatchEvent(new CustomEvent('jobgen:last_action_cleared'));
      console.log('[Indeed] Cleared LAST_ACTION_KEY on tab close.');

  } catch (e) {
    console.warn('[Indeed] beforeunload clear failed:', e);
  }
});