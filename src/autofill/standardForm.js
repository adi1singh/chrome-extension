import { mapStructuredQuestion } from '../services/infoMapping.js';
import { createProgressEmitters } from '../utils/progressBridge.js';

const normalized = value => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

function labelFor(field) {
  return field.labels?.[0]?.textContent?.trim() || field.getAttribute('aria-label') ||
    field.closest('fieldset')?.querySelector('legend')?.textContent?.trim() ||
    field.placeholder || field.name || '';
}

function writable(field) {
  return !field.disabled && !field.readOnly && !field.closest('[hidden], [aria-hidden="true"], #jobgen-react-app') &&
    !['hidden', 'password', 'file', 'submit', 'button', 'reset'].includes(field.type) &&
    getComputedStyle(field).display !== 'none' && getComputedStyle(field).visibility !== 'hidden';
}

// Standard HTML controls only. Never guesses selectors for custom widgets,
// navigates to another employer site, or clicks a final submission button.
export async function autofillStandardForm(site, { root = document, mapQuestion = mapStructuredQuestion } = {}) {
  const progress = createProgressEmitters(site);
  progress.start('autofill', 'Application form');
  let filled = 0;
  let skipped = 0;
  const radioGroups = new WeakSet();
  const fields = Array.from(root.querySelectorAll('input, textarea, select'));
  for (const field of fields) {
    if (!writable(field)) continue;
    if ((['radio', 'checkbox'].includes(field.type) && field.checked) ||
      (!['radio', 'checkbox', 'select-one'].includes(field.type) && field.value)) { skipped++; continue; }
    const label = field.type === 'radio' ? (field.closest('fieldset')?.querySelector('legend')?.textContent?.trim() || labelFor(field)) : labelFor(field);
    if (!label) { skipped++; continue; }
    let choices = [];
    if (field.tagName === 'SELECT') choices = Array.from(field.options).filter(option => option.value && !option.disabled);
    if (field.type === 'radio') {
      if (radioGroups.has(field)) continue;
      choices = fields.filter(other => other.type === 'radio' && other.form === field.form &&
        (field.name ? other.name === field.name : other === field) && writable(other));
      choices.forEach(choice => radioGroups.add(choice));
      if (choices.some(choice => choice.checked)) { skipped++; continue; }
    }
    const options = Object.fromEntries(choices.map(choice => [choice.value, (choice.tagName === 'OPTION' ? choice.textContent?.trim() : labelFor(choice)) || choice.value]));
    try {
      const answer = await mapQuestion({ question: `${label} (optional)`,
        question_type: choices.length ? 'single choice' : 'input', options });
      const value = answer?.answer;
      if (value === undefined || value === null || String(value).trim() === '') { skipped++; continue; }
      if (field.type === 'checkbox') {
        if (!['yes', 'true', '1'].includes(normalized(value))) { skipped++; continue; }
        field.click();
      } else if (choices.length) {
        const match = choices.find(choice => normalized(value) === normalized(choice.value) ||
          normalized(value) === normalized(options[choice.value]));
        if (!match) { skipped++; continue; }
        if (field.type === 'radio') match.click();
        else {
          field.value = match.value;
          field.dispatchEvent(new Event('input', { bubbles: true }));
          field.dispatchEvent(new Event('change', { bubbles: true }));
        }
      } else {
        const prototype = field.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(prototype, 'value').set.call(field, String(value));
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
      }
      filled++;
    } catch { skipped++; }
  }
  const message = fields.length ? `Filled ${filled} fields. Review remaining fields and documents before submitting.` :
    'No application fields found. Open the application form on this site first.';
  progress.update('Application form', 'finished', { message });
  return { filled, skipped, submitted: false };
}
