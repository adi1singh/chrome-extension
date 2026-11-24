// Utility helper functions

export async function waitForElement(selector, timeout = 5000) {
  let startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    let element = document.querySelector(selector);
    if (element) return element;
    await new Promise(resolve => setTimeout(resolve, 100)); // Wait 100ms
  }

  throw new Error(`Timeout: Element '${selector}' not found`);
}

export function waitOneSecond() {
  return new Promise(resolve => setTimeout(resolve, 1000)); // 1000ms = 1 second
}

export function getElementByXPath(xpath) {
  return document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
}

export function getElementByText(tag, text) {
  return [...document.querySelectorAll(tag)].find(el => el.innerText.includes(text));
}

export function checkLinkedInProfile() {
  const url = window.location.href;
  return /https?:\/\/(www\.)?linkedin\.com\/in\/.+/.test(url);
}

// TODO: remove
export async function waitForLinkedinDetails() {
  console.log("⏳ Waiting for LinkedIn details to load...");

  return new Promise((resolve, reject) => {
    let attempts = 0;
    const maxAttempts = 20;
    const checkInterval = 1500;

    function getDetailsElement() {
      return document.querySelector("#profile-content > div > div.scaffold-layout.scaffold-layout--breakpoint-md.scaffold-layout--main-aside.scaffold-layout--reflow.pv-profile.pvs-loader-wrapper__shimmer--animate > div > div > main > section:nth-child(3) > div.display-flex.ph5.pv3 > div > div > div > span.visually-hidden");
    }

    const observer = new MutationObserver((mutations, obs) => {
      const detailsElement = getDetailsElement();
      if (detailsElement && detailsElement.innerText.trim().length > 0) {
        console.log("✅ LinkedIn details loaded via observer.");
        obs.disconnect();
        clearInterval(timeout);
        resolve(detailsElement.innerText.trim());
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    const timeout = setInterval(() => {
      attempts++;
      const detailsElement = getDetailsElement();
      console.log(`⏳ Checking for LinkedIn details... Attempt ${attempts}/${maxAttempts}`);

      if (detailsElement && detailsElement.innerText.trim().length > 0) {
        console.log("✅ LinkedIn details loaded via timeout check.");
        clearInterval(timeout);
        observer.disconnect();
        resolve(detailsElement.innerText.trim());
      }

      if (attempts >= maxAttempts) {
        console.log("❌ Timeout reached: Could not find LinkedIn details.");
        clearInterval(timeout);
        observer.disconnect();
        reject(new Error("LinkedIn details loading timed out."));
      }
    }, checkInterval);
  });
}

// TODO: remove
export function waitForJobDetails(callback) {
  console.log("Waiting for job details to load...");

  const observer = new MutationObserver((mutations, obs) => {
    const detailsElement = document.querySelector("article.jobs-description__container");

    if (detailsElement && detailsElement.innerText.trim().length > 0) {
      console.log("Job details loaded.");
      obs.disconnect();
      callback(detailsElement.innerText.trim());
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  let attempts = 0;
  const maxAttempts = 7;
  const timeout = setInterval(() => {
    attempts++;
    const _detailsElement = document.querySelector("article.jobs-description__container");
    if (attempts >= maxAttempts) {
      console.log("Timeout reached: Could not find job details.");
      clearInterval(timeout);
      observer.disconnect();
    }
  }, 2000);
}
