/* eslint-env browser */
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import ActionButtons from "../components/ActionButtons.jsx";
import {
  invokeActionButton,
  subscribeActionButtonState,
} from "../utils/actionButtonsBridge";

/** ---------- 基础配置 ---------- */
const INJECT_ID = "jobgen-indeed-pill";
const DEBOUNCE_MS = 120;

/** Smart Apply 表单不注入（那里由你的 SmartApply 面板负责） */
const isSmartApply = () =>
  /(^|\.)smartapply\.indeed\.com$/i.test(location.hostname);

/** 可能的 Apply 按钮选择器（兼容多版本） */
const APPLY_BTN_SELECTORS = [
  "#indeedApplyButton",
  '[data-tn-element="applyButton"]',
  '[data-qa="apply-button"]',
  '[data-testid*="apply"]',
  'a[role="button"]',
  "button",
];

/** 候选挂载容器：会选离 Apply 最近的一个 */
const HOST_SELECTOR_CANDIDATES = [
  '[data-testid="inlineHeader-actions"]',
  "#applyButtonLinkContainer",
  ".jobsearch-DesktopStickyContainer",
  ".jobsearch-JobInfoHeader-title-container",
  '[data-tn-component="jobHeader"]',
];

/** ---------- 小工具 ---------- */
const rafDebounce = (fn, wait = DEBOUNCE_MS) => {
  let t = 0;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => requestAnimationFrame(() => fn(...args)), wait);
  };
};

/** 递归查询（含 shadowRoot） */
const $all = (root, selectors) => {
  const out = [];
  const visit = (node) => {
    if (!node) return;
    if (node.querySelectorAll) {
      selectors.forEach((sel) =>
        node.querySelectorAll(sel).forEach((el) => out.push(el))
      );
    }
    const sr = node.shadowRoot;
    if (sr) visit(sr);
    if (node.children) Array.from(node.children).forEach(visit);
  };
  visit(root);
  return out;
};

/** ---------- DOM 定位 ---------- */
function findApplyButton() {
  return $all(document, APPLY_BTN_SELECTORS).find((btn) => {
    if (!btn || btn.offsetParent === null) return false;
    const txt = (btn.innerText || btn.textContent || "").trim();
    return /(apply|申请)/i.test(txt);
  });
}

function findHostContainer(applyBtn) {
  const hosts = $all(document, HOST_SELECTOR_CANDIDATES).filter(
    (n) => n && n.offsetParent !== null
  );
  if (!hosts.length) return applyBtn?.parentElement || null;

  const ar = applyBtn.getBoundingClientRect();
  const dist = (r) =>
    Math.hypot(
      (r.left + r.right) / 2 - (ar.left + ar.right) / 2,
      (r.top + r.bottom) / 2 - (ar.top + ar.bottom) / 2
    );

  let best = null,
    bestScore = Infinity;
  for (const h of hosts) {
    const s = dist(h.getBoundingClientRect());
    if (s < bestScore) {
      best = h;
      bestScore = s;
    }
  }
  return best;
}

/** ---------- 渲染/卸载 ---------- */
let rootRef = null;
let containerRef = null;
let mountedTo = null;

function unmount() {
  try {
    rootRef?.unmount();
  } catch { /* Optional operation; preserve the existing fallback. */ }
  rootRef = null;
  if (containerRef?.parentNode) containerRef.parentNode.removeChild(containerRef);
  containerRef = null;
  mountedTo = null;
}

/** 动态调用你可能导出的 autofill/apply（若无则静默） */
async function tryAutofillIndeed() {
  try {
    const mod = await import("./indeed"); // 若文件存在且导出，则调用
    if (typeof mod.autofillIndeed === "function") return mod.autofillIndeed();
  } catch { /* Optional operation; preserve the existing fallback. */ }
}
async function tryApplyIndeed() {
  try {
    const mod = await import("./indeed");
    if (typeof mod.applyIndeed === "function") return mod.applyIndeed();
  } catch { /* Optional operation; preserve the existing fallback. */ }
}

/** ---------- 仅 Indeed 生效的包装按钮（同步 Applying/Applied 状态） ---------- */
const INDEED_LAST_ACTION_KEY = "jobgen:last_action";
const INDEED_ACTION_AUTO_APPLY = "auto_apply";

function parseIndeedJkFromUrl(href) {
  try {
    const u = new URL(href);
    // 首先取 ?jk=
    const jk = u.searchParams.get("jk");
    if (jk) return jk;
    // 再尝试 viewjob?jk=xxx 之外的路径（保底可以扩展）
    // e.g. /company/xxx/jobs/yyy?jk=zz 已在上面覆盖
    return null;
  } catch {
    return null;
  }
}

function getJobStatusKeyForUrl(href) {
  const jk = parseIndeedJkFromUrl(href);
  return jk ? `indeed_job_${jk}_status` : null;
}

/**
 * 这个包装组件只在 Indeed 注入处使用：
 * - hasActiveFlow: 由 jobgen:last_action === 'auto_apply' 推断
 * - jobStatus: 读取 indeed_job_${jk}_status === 'Applied' 或 window.__jobgen_job_status === 'Applied'
 * - platformKey 固定为 'indeed' 以应用 Indeed 的视觉预设
 */
export function IndeedActionButtons({ onAction, onApply }) {
  const [hasActiveFlow, setHasActiveFlow] = useState(false);
  const [jobStatus, setJobStatus] = useState(null);
  const [currentSite, setCurrentSite] = useState("indeed");
  const jobStatusKeyRef = useRef(getJobStatusKeyForUrl(window.location.href));

  // 订阅 bridge，仅用于确认 currentSite（不会修改 bridge）
  useEffect(() => {
    const unsub = subscribeActionButtonState((s) => {
      const site = (s?.currentSite || "").toLowerCase();
      setCurrentSite(site || "indeed");
    });
    return unsub;
  }, []);

  // 监听 last_action → hasActiveFlow
  useEffect(() => {
    if (currentSite !== "indeed") return;

    let cancelled = false;
    const read = async () => {
      try {
        const r = await chrome.storage.local.get([INDEED_LAST_ACTION_KEY]);
        if (cancelled) return;
        setHasActiveFlow(r[INDEED_LAST_ACTION_KEY] === INDEED_ACTION_AUTO_APPLY);
      } catch { /* Optional operation; preserve the existing fallback. */ }
    };

    const onChanged = (changes, area) => {
      if (area !== "local") return;
      if (changes[INDEED_LAST_ACTION_KEY]) {
        const v = changes[INDEED_LAST_ACTION_KEY].newValue;
        setHasActiveFlow(v === INDEED_ACTION_AUTO_APPLY);
      }
    };

    read();
    chrome.storage.onChanged.addListener(onChanged);
    return () => {
      cancelled = true;
      chrome.storage.onChanged.removeListener(onChanged);
    };
  }, [currentSite]);

  // 读取/监听当前职位的已投递状态 → jobStatus
  useEffect(() => {
    if (currentSite !== "indeed") return;

    const readStatus = async () => {
      // 方案 A：全局标志
      if (window.__jobgen_job_status === "Applied") {
        setJobStatus("Applied");
        return;
      }
      // 方案 B：storage 中的 per-job 状态
      const key = jobStatusKeyRef.current;
      if (!key) {
        setJobStatus(null);
        return;
      }
      try {
        const r = await chrome.storage.local.get([key]);
        if (r[key] === "Applied") setJobStatus("Applied");
        else setJobStatus(null);
      } catch {
        setJobStatus(null);
      }
    };

    

    // 初次读取
    readStatus();

    const onChanged = (changes, area) => {
      if (area !== "local") return;
      const key = jobStatusKeyRef.current;
      if (!key) return;
      if (changes[key]) {
        const v = changes[key].newValue;
        setJobStatus(v === "Applied" ? "Applied" : null);
      }
    };

    // 监听 storage 更新
    chrome.storage.onChanged.addListener(onChanged);

    // 监听 URL 变化（本文件已在 setup 里派发 'jobgen:urlchange'）
    const onUrlChange = () => {
      jobStatusKeyRef.current = getJobStatusKeyForUrl(window.location.href);
      readStatus();
    };
    window.addEventListener("jobgen:urlchange", onUrlChange);

    return () => {
      chrome.storage.onChanged.removeListener(onChanged);
      window.removeEventListener("jobgen:urlchange", onUrlChange);
    };
  }, [currentSite]);

  return (
    <ActionButtons
      onAction={onAction}
      onApply={onApply}
      hasActiveFlow={hasActiveFlow}
      jobStatus={jobStatus}
      platformKey="indeed"
    />
  );
}

/** ---------- 渲染逻辑 ---------- */
function renderButtons() {
  // 1) SmartApply 页面不注入
  if (isSmartApply()) {
    unmount();
    return;
  }

  // 2) 找到 Apply 按钮；没有就不注入
  const applyBtn = findApplyButton();
  if (!applyBtn) { unmount(); return; }
  const btnText = (applyBtn.innerText || applyBtn.textContent || "").trim().toLowerCase();
  if (!btnText.includes("apply now")) { unmount(); return; }

  // 3) 找“整排按钮容器”（flex 行）
  const row =
    applyBtn.closest('[data-testid="jobsearch-ViewJobButtons-container"]') ||
    applyBtn.closest('.jobsearch-ViewJobButtons-container');

  // 没找到 row 就退回“插在 apply 后面”（但优先用 row，避免变形）
  const mountAfterEl = row || applyBtn;

  // 4) 已经挂在当前容器后面就跳过
  if (mountedTo === mountAfterEl && containerRef?.isConnected) return;

  // 5) 重新挂载
  unmount();

  // —— 包一层 wrapper：与按钮行彻底分离（不当其 flex 子项）
  const wrapper = document.createElement("div");
  wrapper.id = INJECT_ID + "-wrapper";
  wrapper.style.display = "block";
  wrapper.style.marginTop = "8px";
  wrapper.style.marginLeft = window.location.href.includes("viewjob")? "0px": "16px";

  // 真正的挂载容器
  containerRef = document.createElement("div");
  containerRef.id = INJECT_ID;         // #jobgen-indeed-pill
  containerRef.style.display = "block";
  containerRef.style.boxSizing = "border-box";

  // 关键：插在“整排按钮容器”的后面（afterend），避免影响该行布局
  try {
    mountAfterEl.insertAdjacentElement("afterend", wrapper);
  } catch {
    const host = findHostContainer(applyBtn);
    (host || document.body).appendChild(wrapper);
  }
  wrapper.appendChild(containerRef);

  // 6) 一次性注入局部样式（仅作用于我们容器）
  (function injectScopedStylesOnce() {
    const STYLE_ID = INJECT_ID + "-style";
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      /* 仅作用于我们自己的容器，避免外溢 */
      #${INJECT_ID}, #${INJECT_ID} * { box-sizing: border-box; }
      #${INJECT_ID} { font: inherit; color: inherit; }
      /* 若有通用类（.btn/.card 等），请加 #${INJECT_ID} 前缀去写样式 */
      /* #${INJECT_ID} .jg-btn { ... } */
      /* #${INJECT_ID} .jg-card { ... } */

      /* 可选：让我们按钮高度更接近 Indeed（自行按需调整/删除） */
      #${INJECT_ID} button {
        height: 44px;
        line-height: 44px;
        border-radius: 10px;
      }
    `;
    document.head.appendChild(style);
  })();

  // 7) 点击行为：bridge 优先、兜底原生
  const onAction = async (action) => {
    if (invokeActionButton(action)) return;

    if (action === "save") {
      const candidates = [
        '[data-tn-element="save-job-button"]',
        'button[aria-label*="Save" i]',
        'button[data-testid*="save" i]',
      ];
      const btn =
        $all(document, candidates)
          .filter((b) => b && b.offsetParent !== null)
          .find((b) => /save/i.test((b.innerText || b.textContent || "").trim())) || null;
      btn?.click();
      return;
    }

    if (action === "autofill") {
      await tryAutofillIndeed(); // 若不存在则静默
      return;
    }

    if (action === "apply") {
      if (!(await tryApplyIndeed())) {
        findApplyButton()?.click();
      }
      return;
    }
  };

  // 8) 渲染 React 组件（改为使用 Indeed 包装版，自动同步 Applying/Applied）
  rootRef = createRoot(containerRef);
  rootRef.render(
    <IndeedActionButtons
      onAction={onAction}
      onApply={() => onAction("apply")}
    />
  );

  // 9) 记录挂载目标（用于去重）
  mountedTo = mountAfterEl;
}

const reevaluate = rafDebounce(renderButtons);

/** ---------- 对外 API（幂等） ---------- */
export function setupIndeedJobGenButtons() {
  // 首评估
  reevaluate();

  // 观察 DOM（Indeed SPA 场景）
  const mo = new MutationObserver(reevaluate);
  mo.observe(document.documentElement, { childList: true, subtree: true });

  // 视口/焦点变动
  window.addEventListener("resize", reevaluate, { passive: true });
  window.addEventListener("focus", reevaluate, { passive: true });

  // URL 变化监听（pushState/replaceState）
  const patch = (k) => {
    const raw = history[k];
    history[k] = function (...args) {
      const r = raw.apply(this, args);
      window.dispatchEvent(new Event("jobgen:urlchange"));
      return r;
    };
  };
  if (!window.__jobgenPatchedHistory) {
    window.__jobgenPatchedHistory = true;
    patch("pushState");
    patch("replaceState");
    window.addEventListener("popstate", () =>
      window.dispatchEvent(new Event("jobgen:urlchange"))
    );
  }
  window.addEventListener("jobgen:urlchange", reevaluate);

  // 返回销毁函数
  return () => {
    mo.disconnect();
    window.removeEventListener("resize", reevaluate);
    window.removeEventListener("focus", reevaluate);
    window.removeEventListener("jobgen:urlchange", reevaluate);
    unmount();
  };
}