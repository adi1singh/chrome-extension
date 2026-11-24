import { apiFetch } from './httpClient.js';
// Import the combined JWT function from apiService
import { getJWT, _fetchUserFAQData, getStoredFAQData } from './apiService.js';

// Helper function to parse JSON strings in user data
function parsePersonalInfo(userData) {
  if (!userData.personal_info) return {};
  try {
    return typeof userData.personal_info === 'string' ? JSON.parse(userData.personal_info) : userData.personal_info;
  } catch (e) {
    console.warn('Failed to parse personal_info JSON:', e);
    return {};
  }
}

function parseWorkPreferences(userData) {
  if (!userData.work_preferences) return {};
  try {
    return typeof userData.work_preferences === 'string' ? JSON.parse(userData.work_preferences) : userData.work_preferences;
  } catch (e) {
    console.warn('Failed to parse work_preferences JSON:', e);
    return {};
  }
}

function parseDiversity(userData) {
  if (!userData.diversity) return {};
  try {
    return typeof userData.diversity === 'string' ? JSON.parse(userData.diversity) : userData.diversity;
  } catch (e) {
    console.warn('Failed to parse diversity JSON:', e);
    return {};
  }
}

function parseEducation(userData) {
  if (!userData.education) return [];
  try {
    return typeof userData.education === 'string' ? JSON.parse(userData.education) : userData.education;
  } catch (e) {
    console.warn('Failed to parse education JSON:', e);
    return [];
  }
}

function parseExperience(userData) {
  if (!userData.experience) return [];
  try {
    return typeof userData.experience === 'string' ? JSON.parse(userData.experience) : userData.experience;
  } catch (e) {
    console.warn('Failed to parse experience JSON:', e);
    return [];
  }
}

function parseSkills(userData) {
  if (!userData.skills) return [];
  try {
    return typeof userData.skills === 'string' ? JSON.parse(userData.skills) : userData.skills;
  } catch (e) {
    console.warn('Failed to parse skills JSON:', e);
    return [];
  }
}

function parseLanguage(userData) {
  if (!userData.language) return [];
  try {
    return typeof userData.language === 'string' ? JSON.parse(userData.language) : userData.language;
  } catch (e) {
    console.warn('Failed to parse language JSON:', e);
    return [];
  }
}

/**
 * Maps FAQ visa status values to standardized Seek platform options
 * @param {string} visaStatus - The visa status from FAQ data
 * @returns {string} - Mapped visa status for Seek platform
 */
function mapVisaStatus(visaStatus) {
  if (!visaStatus) return null;
  
  const status = String(visaStatus).toLowerCase().trim();
  
  // Mapping logic based on FAQ data values
  const visaMapping = {
    // Direct mappings
    'yes': 'I\'m an Australian citizen',
    'citizen': 'I\'m an Australian citizen',
    'australian citizen': 'I\'m an Australian citizen',
    
    'permanent resident': 'I\'m a permanent resident and/or NZ citizen',
    'permanent': 'I\'m a permanent resident and/or NZ citizen',
    'pr': 'I\'m a permanent resident and/or NZ citizen',
    'nz citizen': 'I\'m a permanent resident and/or NZ citizen',
    'new zealand citizen': 'I\'m a permanent resident and/or NZ citizen',
    
    'work visa': 'I have a graduate temporary work visa',
    'working visa': 'I have a graduate temporary work visa',
    'temporary work visa': 'I have a graduate temporary work visa',
    'graduate work visa': 'I have a graduate temporary work visa',
    
    'student visa': 'I have a temporary visa with restrictions on work hours (e.g. student visa, retirement visa)',
    'student': 'I have a temporary visa with restrictions on work hours (e.g. student visa, retirement visa)',
    
    'bridging visa': 'I have a temporary protection or safe haven enterprise work visa',
    'bridging': 'I have a temporary protection or safe haven enterprise work visa',
    
    'dependent visa': 'I have a family/partner visa with no restrictions',
    'dependent': 'I have a family/partner visa with no restrictions',
    'family visa': 'I have a family/partner visa with no restrictions',
    'partner visa': 'I have a family/partner visa with no restrictions',
    
    'other': 'I require sponsorship to work for a new employer (e.g. 482, 457)',
    'sponsorship': 'I require sponsorship to work for a new employer (e.g. 482, 457)',
    'require sponsorship': 'I require sponsorship to work for a new employer (e.g. 482, 457)',
  };
  
  // Try direct mapping first
  if (visaMapping[status]) {
    console.log(`🎯 Visa status mapped: "${visaStatus}" -> "${visaMapping[status]}"`);
    return visaMapping[status];
  }
  
  // Try fuzzy matching
  for (const [key, value] of Object.entries(visaMapping)) {
    if (status.includes(key) || key.includes(status)) {
      console.log(`🎯 Visa status fuzzy matched: "${visaStatus}" -> "${value}"`);
      return value;
    }
  }
  
  // Default fallback
  console.warn(`⚠️ No visa mapping found for "${visaStatus}", returning as-is`);
  return visaStatus;
}

export function normalizeText(s) {
  return s
    .toString()
    .toLowerCase()
    .replace(/[^\w\s]|/g, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ========================================================================
  *  Updated Mapping Rules - Using new unified API structure
  * ===================================================================== */

export const mappingRules = [
  /* ───────────── Personal Information ──────────────── */
  // Specific before general: when-can-relocate before generic relocate intent
  { rule: /\b(?:when\s*can\s*you\s*relocate|relocate\s*timeframe|relocation\s*timeline)\b/i, get: a => parseWorkPreferences(a)?.when_can_you_relocate ?? null },
  { rule: /\b(?:relocate|relocation|relocating|willing\s*to\s*relocate|ability\s*to\s*relocate)\b/i, get: a => parseWorkPreferences(a)?.can_you_relocate ?? null },
  { rule: /\b(?:citizen(?:ship)?|permanent\s*resident|permanent\s*residency|residency\s*status|resident)\b/i, get: a => parsePersonalInfo(a)?.citizenship ?? null },
  { rule: /\b(?:notice\s*period|period\s*of\s*notice|current\s*notice|notice)\b/i, get: a => {
    const workPrefs = parseWorkPreferences(a);
    const noticeValue = workPrefs?.current_notice_period;
    if (!noticeValue) return null;
    
    // extract the num from string
    const match = String(noticeValue).match(/\b(\d+)\b/);
    return match ? match[1] : noticeValue;
  }},
  { rule: /\b(?:date\s*of\s*birth|birth\s*date|birthdate|birthday|dob)\b/i, get: a => parsePersonalInfo(a)?.date_of_birth ?? null },
  { rule: /\b(?:e[-]?mail|email\s*address|contact\s*email|mail\s*address|email)\b/i, get: a => {
    const email = parsePersonalInfo(a)?.email;
    return (email && email.trim()) ? email.trim() : null;
  }},
  { rule: /\b(?:first\s*name|given\s*name|first)\b/i, get: a => {
    const personalInfo = parsePersonalInfo(a);
    const firstName = personalInfo?.first_name || a.first_name;
    return (firstName && firstName.trim()) ? firstName.trim() : null;
  }},
  { rule: /\b(?:middle\s*name|middle)\b/i, get: a => {
    const middleName = parsePersonalInfo(a)?.middle_name;
    return (middleName && middleName.trim()) ? middleName.trim() : '';
  }},
  { rule: /\b(?:full\s*name|fullname|complete\s*name|full\s*legal\s*name)\b/i, get: a => {
    const personalInfo = parsePersonalInfo(a);
    const firstName = personalInfo?.first_name || '';
    const lastName = personalInfo?.last_name || '';
    if (firstName && lastName) {
      return `${firstName} ${lastName}`.trim();
    } 
    return null;
  }},
  { rule: /\b(?:sponsorship|visa\s*sponsorship|require\s*sponsorship|sponsorship\s*required|sponsor)\b/i, get: a => parseWorkPreferences(a)?.future_sponsorship_required ?? null },
  { rule: /\b(?:id\s*type|identification|identity|identity\s*document|id\s*document|passport|driver'?s\s*licen[cs]e)\b/i, get: a => a.id_type ?? null },
  { rule: /\b(?:industry|sector|industry\s*sector|desired\s*industry|target\s*industry|field\s*of\s*work)\b/i, get: a => parseWorkPreferences(a)?.industry ?? null },
  { rule: /\b(?:job\s*title|position\s*title|current\s*(?:role|position)|role\s*title)\b/i, get: a => parseWorkPreferences(a)?.job_title ?? null },
  { rule: /\b(?:last\s*name|lastname|family\s*name|surname)\b/i, get: a => {
    const lastName = parsePersonalInfo(a)?.last_name;
    return (lastName && lastName.trim()) ? lastName.trim() : null;
  }},
  { rule: /\b(?:legally\s*authori[sz]ed\s*to\s*work|legal\s*to\s*work|authorized\s*to\s*work|work\s*eligibility)\b/i, get: a => parseWorkPreferences(a)?.legally_authorise_to_work ?? null },
  // Prefer phone country code before generic phone to avoid mis-match on queries like "phone country code"
  { rule: /\b(?:phone\s*country\s*code|country\s*code|dial(?:ing)?\s*code|international\s*code|intl\s*code|area\s*code)\b/i, get: a => parsePersonalInfo(a)?.phone_country_code ?? null },
  // Narrow phone matcher: remove overly broad standalone 'number'
  { rule: /\b(?:primary\s*contact\s*number|mobile\s*phone\s*number|phone\s*number|mobile\s*number|contact\s*number|telephone\s*number|telephone|contact|phone|mobile)\b/i, get: a => parsePersonalInfo(a)?.phone ?? null },
  { rule: /\b(?:working\s*model|work\s*model|preferred\s*working\s*model|preferred\s*work\s*model|work\s*arrangement|working\s*arrangement)\b/i, get: a => parseWorkPreferences(a)?.preferred_working_model ?? null },
  { rule: /\b(?:working\s*type|work\s*type|preferred\s*working\s*type|preferred\s*work\s*type|engagement\s*type|contract\s*type)\b/i, get: a => parseWorkPreferences(a)?.preferred_working_type ?? null },
  { rule: /\b(?:residency\s*status|residing\s*in\s*country|country\s*of\s*residence|living\s*in\s*country|current\s*country)\b/i, get: a => parseWorkPreferences(a)?.residing_in_country ?? null },
  { rule: /\b(?:salary\s*currency\s*code|currency\s*code|salary\s*currency|currency)\b/i, get: a => parseWorkPreferences(a)?.salary_currency_code ?? null },
  // Treat generic "package" as salary as well (common phrasing like "total package")
  { rule: /\b(?:salary|pay\s*expectations?|expected\s*pay|annual\s*package|total\s*package|package|compensation\s*expectations?|target\s*remuneration|remuneration\s*expectations?)\b/i, get: a => parseWorkPreferences(a)?.salary_expectation ?? null },
  { rule: /\b(?:salutation|honorific|title|greeting|prefix)\b/i, get: a => parsePersonalInfo(a)?.salutation ?? null },
  { rule: /\b(?:search\s*city|preferred\s*city|desired\s*city|target\s*city|city\s*of\s*search)\b/i, get: a => parseWorkPreferences(a)?.search_location?.city ?? null },
  { rule: /\b(?:search\s*country|preferred\s*country|desired\s*country|target\s*country|country\s*preference|country\s*of\s*search)\b/i, get: a => parseWorkPreferences(a)?.search_location?.country ?? null },
  { rule: /\b(?:availability|available\s*to\s*start|available\s*date|start\s*date|earliest\s*start|when\s*can\s*you\s*start)\b/i, get: a => parseWorkPreferences(a)?.when_available_to_start ?? null },
  { rule: /\b(?:travel|willing\s*to\s*travel|travel\s*availability|ability\s*to\s*travel|travelling\s*required)\b/i, get: a => a.work_preferences?.willing_to_travel != null ? String(a.work_preferences?.willing_to_travel) : null },
  { rule: /\b(?:visa|visa\s*status|work\s*visa|work\s*authori[sz]ation|work\s*permit|immigration\s*status|work\s*status|right\s*to\s*work|work\s*rights)\b/i, get: a => {
    const rawStatus = parseWorkPreferences(a)?.work_authorisation_status;
    return mapVisaStatus(rawStatus);
  }},
  { rule: /\b(?:postcode|zip|postal|postal\s*code)\b/i, get: a => {
    const postCode = parsePersonalInfo(a)?.user_address?.post_code;
    return (postCode && postCode.trim()) ? postCode.trim() : null;
  }},
  // Prefer state code before generic state
  { rule: /\b(?:state\s*code?)\b/i, get: a => parsePersonalInfo(a)?.user_address?.state_code ?? null },
  { rule: /\b(?:state\s*province|stateprovince|state|province|state\/province|state\s*of\s*residence|province\s*of\s*residence)\b/i, get: a => {
    const state = parsePersonalInfo(a)?.user_address?.state;
    return (state && state.trim()) ? state.trim() : null;
  }},
  // Prefer strict "street number" before name; restrict name to exact phrase to avoid collisions
  { rule: /\bstreet\s*(?:no\.?|number)\b/i, get: a => parsePersonalInfo(a)?.user_address?.street_no ?? null },
  { rule: /\bhouse\s*number\b/i, get: a => parsePersonalInfo(a)?.user_address?.street_no ?? null },
  { rule: /\baddress\s*number\b/i, get: a => parsePersonalInfo(a)?.user_address?.street_no ?? null },
  { rule: /\bstreet\s*name\b/i, get: a => {
    const streetName = parsePersonalInfo(a)?.user_address?.street_name;
    return (streetName && streetName.trim()) ? streetName.trim() : null;
  }},
  { rule: /\b(?:full\s*address|complete\s*address|address\s*line\s*1\s*&?\s*2?|address)\b/i, get: a => {
    const personalInfo = parsePersonalInfo(a);
    const userAddress = personalInfo?.user_address;
    if (!userAddress) return null;
    
    // First try the full address field
    if (userAddress.address && userAddress.address.trim()) {
      return userAddress.address.trim();
    }
    
    // If full address is empty, try to construct from components
    const components = [
      userAddress.street_no?.trim(),
      userAddress.street_name?.trim(),
      userAddress.city?.trim(),
      userAddress.state?.trim(),
      userAddress.post_code?.trim()
    ].filter(Boolean);
    
    return components.length > 0 ? components.join(', ') : null;
  }},

  /* ───────────── Location and City mappings ──────────────── */
  { rule: /\b(?:location|city|suburb|base(?!\s*(?:salary))|locality|suburblocality)\b/i, get: a => {
    const city = parsePersonalInfo(a)?.user_address?.city;
    return (city && city.trim()) ? city.trim() : null;
  }},
  { rule: /\b(?:country)\b/i, get: a => parsePersonalInfo(a)?.user_address?.country ?? null },
  { rule: /\b(?:Country\/region of residence|countryregion of residence)\b/i, get: a => parsePersonalInfo(a)?.user_address?.country ?? null },

  /* ───────────── LinkedIn and Portfolio ──────────────── */
  { rule: /\b(?:linkedin|linkedin\s*profile|linkedin\s*url)\b/i, get: a => parsePersonalInfo(a)?.linkedin ?? null },
  { rule: /\b(?:website|website\s*url|portfolio|portfolio\s*url)\b/i, get: a => parsePersonalInfo(a)?.website_url ?? null },
  { rule: /\b(?:github|github\s*profile|github\s*url)\b/i, get: a => parsePersonalInfo(a)?.github ?? null },

  /* ───────────── Application Volume ──────────────── */
  { rule: /\b(?:application\s*volume|applications\s*per\s*week|weekly\s*applications|application\s*frequency)\b/i, get: a => parseWorkPreferences(a)?.application_volume_preference ?? null },

  /* ───────────── When Can Relocate ──────────────── */
  // already handled earlier for priority; keep here for backward context (no-op duplicate removed)

  /* ───────────── Education ──────────────── */
  { rule: /\b(?:degree|qualification|education|diploma|certificate|bachelor|master|phd|doctorate)\b/i, get: a => {
    const education = parseEducation(a);
    return education.length > 0 ? education[0].degree : null;
  }},
  { rule: /\b(?:university|institute|school|college|institution)\b/i, get: a => {
    const education = parseEducation(a);
    return education.length > 0 ? education[0].institute : null;
  }},
  { rule: /\b(?:gpa|grade\s*point\s*average|academic\s*record)\b/i, get: a => {
    const education = parseEducation(a);
    return education.length > 0 ? education[0].gpa : null;
  }},
  { rule: /\b(?:education\s*mode|study\s*mode|learning\s*mode)\b/i, get: a => {
    const education = parseEducation(a);
    return education.length > 0 ? education[0].education_mode : null;
  }},
  { rule: /\b(?:graduation\s*date|education\s*end\s*date|course\s*completion)\b/i, get: a => {
    const education = parseEducation(a);
    return education.length > 0 ? education[0].end_date : null;
  }},
  { rule: /\b(?:education\s*start\s*date|course\s*start|study\s*start)\b/i, get: a => {
    const education = parseEducation(a);
    return education.length > 0 ? education[0].start_date : null;
  }},

  /* ───────────── Work Experience ──────────────── */
  { rule: /\b(?:current\s*company|employer|company\s*name|organization)\b/i, get: a => {
    const experience = parseExperience(a);
    return experience.length > 0 ? experience[0].company_name : null;
  }},
  { rule: /\b(?:current\s*position|job\s*title|role\s*title|position\s*title)\b/i, get: a => {
    const experience = parseExperience(a);
    return experience.length > 0 ? experience[0].title : null;
  }},
  { rule: /\b(?:employment\s*type|job\s*type|work\s*type|contract\s*type)\b/i, get: a => {
    const experience = parseExperience(a);
    return experience.length > 0 ? experience[0].employment_type : null;
  }},
  { rule: /\b(?:role\s*description|job\s*description|responsibilities)\b/i, get: a => {
    const experience = parseExperience(a);
    return experience.length > 0 ? experience[0].role_description : null;
  }},
  { rule: /\b(?:work\s*start\s*date|employment\s*start|job\s*start)\b/i, get: a => {
    const experience = parseExperience(a);
    return experience.length > 0 ? experience[0].start_date : null;
  }},
  { rule: /\b(?:work\s*end\s*date|employment\s*end|job\s*end)\b/i, get: a => {
    const experience = parseExperience(a);
    return experience.length > 0 ? experience[0].end_date : null;
  }},
  { rule: /\b(?:work\s*location|job\s*location|workplace\s*location)\b/i, get: a => {
    const experience = parseExperience(a);
    return experience.length > 0 ? experience[0].location : null;
  }},

  /* ───────────── Skills ──────────────── */
  { rule: /\b(?:skills|skill\s*set|technical\s*skills|core\s*skills|competencies)\b/i, get: a => {
    const skills = parseSkills(a);
    return skills.length > 0 ? skills.map(s => s.name).join(', ') : null;
  }},
  { rule: /\b(?:years\s*of\s*experience|experience\s*years|skill\s*experience)\b/i, get: a => {
    const skills = parseSkills(a);
    if (skills.length > 0) {
      const maxYears = Math.max(...skills.map(s => parseInt(s.years_of_experience) || 0));
      return maxYears > 0 ? maxYears.toString() : null;
    }
    return null;
  }},

  /* ───────────── Diversity ──────────────── */
  { rule: /\b(?:gender|sex)\b/i, get: a => parseDiversity(a)?.gender ?? null },
  { rule: /\b(?:aboriginal|torres\s*strait\s*islander|indigenous)\b/i, get: a => parseDiversity(a)?.aboriginal_or_torres_strait_islander ?? null },
  { rule: /\b(?:first\s*language|native\s*language|mother\s*tongue)\b/i, get: a => parseDiversity(a)?.first_language_as_child ?? null },
  { rule: /\b(?:disability|disabled|person\s*with\s*disability)\b/i, get: a => parseDiversity(a)?.person_with_disability ?? null },
  { rule: /\b(?:workplace\s*adjustment|work\s*adjustment|accommodation)\b/i, get: a => parseDiversity(a)?.requires_adjustment_at_work ?? null },
  { rule: /\b(?:minority|racial|ethnic|ethno\s*religious)\b/i, get: a => parseDiversity(a)?.minority_racial_ethnic_or_ethno_religious_group ?? null },

  /* ───────────── Language ──────────────── */
  { rule: /\b(?:languages|language\s*skills|spoken\s*languages)\b/i, get: a => {
    const languages = parseLanguage(a);
    return languages.length > 0 ? languages.join(', ') : null;
  }},

  /* ───────────── ID Type ──────────────── */
  { rule: /\b(?:id\s*type|identification\s*type|identity\s*document\s*type)\b/i, get: a => a.id_type ?? null },

  /* ───────────── AI Auto Create Account ──────────────── */
  { rule: /\b(?:enable\s*ai|auto\s*create\s*account|ai\s*auto\s*create)\b/i, get: a => a.enable_ai_auto_create_account ?? null },

  /* ───────────── Terms and Conditions ──────────────── */
  { rule: /\b(?:term[s]?|condition[s]?|terms?\s*(?:and|&)\s*condition[s]?|t\s*&\s*c|t&c)\b/i, get: a => a['enable_ai_accept_t&C'] ?? null },
];

function buildLLMPrompt({ question, question_type, options, userData: _userData, faqSalaryData }) {
  if (question_type === "input") {
    //give the user a specific instruction based on the question
    const normalizedQuestion = normalizeText(question);

    // according to the question type, give the user a specific instruction
    let specificInstructions = "";
    let specificExamples = "";
    
    if (normalizedQuestion.includes("salary") || normalizedQuestion.includes("pay") || normalizedQuestion.includes("compensation")) {
      specificInstructions = "Please provide a specific salary amount or range in numbers (e.g., '75000', '80k-100k', '120000 AUD'). If you don't have a specific amount, provide a reasonable estimate based on the role and your experience level.";
      
      // Add FAQ salary data context if available
      if (faqSalaryData) {
        specificInstructions += `\n\nUser's FAQ Salary Information:\n${faqSalaryData}`;
      }
    } else if (normalizedQuestion.includes("suburb") || normalizedQuestion.includes("locality") || normalizedQuestion.includes("city") || normalizedQuestion.includes("location")) {
      specificInstructions = "Please provide your current suburb/locality and city in the format 'Suburb, City, State' (e.g., 'Bondi, Sydney, NSW' or 'Melbourne, VIC'). If you're willing to relocate, you can mention that as well.";
    } else if (normalizedQuestion.includes("phone") || normalizedQuestion.includes("mobile") || normalizedQuestion.includes("number")) {
      specificInstructions = "Return ONLY your local phone number (exclude country code). Do NOT include '+' or any country/area code.";
      specificExamples = "- '+61 412 345 678' -> '0412 345 678'\n- '+1 415 555 1234' -> '415 555 1234'";
    } else if (normalizedQuestion.includes("email")) {
      specificInstructions = "Please provide your email address in standard format (e.g., 'john.doe@example.com').";
    } else if (normalizedQuestion.includes("experience") || normalizedQuestion.includes("years")) {
      specificInstructions = "Please provide the number of years of relevant experience you have in this field or role. Use whole numbers or decimals (e.g., '5', '3.5', '10+').";
    } else if (normalizedQuestion.includes("notice")) {
      specificInstructions = "Please provide ONLY the number of weeks for your notice period (e.g., '2', '4', '0'). If it's in days, convert to weeks (14 days = 2 weeks).";
    } else if (normalizedQuestion.includes("availability") || normalizedQuestion.includes("start")) {
      specificInstructions = "Please specify when you can start. Use specific dates or timeframes (e.g., 'Immediately', '2 weeks notice', 'January 15, 2024').";
    } else if (normalizedQuestion.includes("skill") || normalizedQuestion.includes("tool") || normalizedQuestion.includes("technology")) {
      specificInstructions = "Please list your relevant skills, tools, or technologies. Separate multiple items with commas (e.g., 'JavaScript, React, Node.js, AWS').";
    } else if (normalizedQuestion.includes("name") || normalizedQuestion.includes("first") || normalizedQuestion.includes("last")) {
      specificInstructions = "Please provide your full name as it appears on official documents (e.g., 'John Michael Smith').";
    } else if (normalizedQuestion.includes("birth") || normalizedQuestion.includes("birthday")) {
      specificInstructions = "Please provide your date of birth in DD/MM/YYYY format (e.g., '15/03/1990').";
    } else if (normalizedQuestion.includes("visa") || normalizedQuestion.includes("citizen") || normalizedQuestion.includes("work right")) {
      specificInstructions = "Please specify your work authorization status (e.g., 'Australian Citizen', 'Permanent Resident', 'Working Holiday Visa', 'Requires Sponsorship').";
    } else if (normalizedQuestion.includes("linkedin") || normalizedQuestion.includes("portfolio") || normalizedQuestion.includes("website")) {
      specificInstructions = "Please provide the complete URL to your professional profile or portfolio (e.g., 'https://linkedin.com/in/johndoe', 'https://johndoe.dev').";
    } else {
      // General instructions
      specificInstructions = "Please provide a clear, specific answer to this question. If the question asks for personal information, provide it in the most appropriate format. If you're unsure about specific details, provide the best estimate or most relevant information you have.";
    }
    
    return `Question: "${question}"

Instructions: ${specificInstructions}
${specificExamples ? `\nExamples:\n${specificExamples}\n` : ""}
IMPORTANT: Your answer must be 25 characters or less. Keep it concise and direct. You must answer based on real facts and information only - do not make up or fabricate any information.

Please provide a direct, specific answer without asking for clarification. If you need to make assumptions, state them clearly.`;
    }

  const list = Object.values(options)
    .map(opt => `- ${opt}`)
    .join('\n');

  // Add FAQ salary data context if available
  const salaryContext = faqSalaryData ? `\n\nUser's FAQ Salary Information:\n${faqSalaryData}\n` : '';

  if (question_type === "single choice") {
    return `Question: "${question}"${salaryContext}\n\nOptions:\n${list}\n\nInstructions:\n- Choose EXACTLY ONE option from the list above.\n- Return ONLY the chosen option text, copied verbatim.\n- Do NOT include any extra words, punctuation, or explanations.\n- If unsure, return the single best-fitting option.`;
  }

  if (question_type === "multiple choice") {
    // only return the single most appropriate option text
    return `Question: "${question}"${salaryContext}\n\nOptions:\n${list}\n\nInstructions:\n- Select all that apply, but RETURN ONLY the single most appropriate option text.\n- Return ONLY the option text, copied verbatim.\n- Do NOT include any extra words, punctuation, or explanations.`;
  }

  return `Question: "${question}"${salaryContext}\n\nOptions:\n${list}\n\nInstructions:\n- Choose the most appropriate option(s).\n- Return ONLY the chosen option text, copied verbatim.`;
}

async function callLLM(prompt) {
  console.log("🧠 Calling LLM API with prompt:", prompt);

  try {
    const jwtToken = await getJWT();
    if (!jwtToken) {
      console.error("❌ No valid JWT token available for LLM call");
      return null;
    }

    const res = await apiFetch("https://candidates.jobgen.ai/api/1.1/wf/jobgen_apply_question", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${jwtToken}` 
      },
      body: JSON.stringify({
        question: prompt 
      })
    });
  
    if (!res.ok) {
      console.error("❌ HTTP Error:", res.status, res.statusText);
      return null;
    }

    const data = await res.json();
    console.log("🌐 LLM API Response:", data);

    // Check for API-level failures first
    if (data.outcome === "Fail") {
      console.error("❌ LLM API returned failure:", data.error);
      if (data.error === "TOKEN_EXPIRED") {
        console.log("🔄 Token expired, requesting new one...");
        // The new getJWT function will handle token refresh automatically
      }
      return null;
    }

    // Handle successful response
    if (data.answer) {
      // Direct answer format (newer API response)
      const answerText = data.answer.trim();
      console.log("✅ LLM direct answer:", answerText);
      return answerText || null;
    }

    // Handle response.answer format (current API response)
    if (data.response && data.response.answer) {
      try {
        const parsed = JSON.parse(data.response.answer);
        const answerText = parsed?.answer?.trim();
        console.log("✅ LLM response.answer:", answerText);
        return answerText || null;
      } catch (parseError) {
        console.error("❌ Failed to parse response.answer as JSON:", data.response.answer);
        console.error("Parse error:", parseError);
      }
    }

    // Handle nested response.outcome format (legacy API response)
    const raw = data?.response?.outcome;
    if (raw && raw !== "Pass" && raw !== "Fail") {
      try {
        const parsed = JSON.parse(raw); // Parse JSON string
        const answerText = parsed?.answer?.trim();
        console.log("✅ LLM legacy format:", answerText);
        return answerText || null;
      } catch (parseError) {
        console.error("❌ Failed to parse response.outcome as JSON:", raw);
        console.error("Parse error:", parseError);
      }
    }

    // If we get here, no valid answer was found
    console.warn("⚠️ No valid answer found in response:", data);
    return null;

  } catch (err) {
    console.error("❌ LLM fetch/parse error:", err);
    return null;
  }
}



export async function mapStructuredQuestion(jsonInput) {
  const { question, question_type, options } = jsonInput;
  if (!question || !question_type) return null;

  // Early return for education and experience types - no need for complex processing
  if (question_type === "education") {
    console.log("🎓 Education type question detected - direct return");
    // Get user data for education only
    let userData = null;
    try {
      userData = await getStoredFAQData();
    } catch (error) {
      console.warn("⚠️ Error getting user data for education:", error);
    }
    
    const educationData = userData?.education || [];
    return {
      question,
      answer: educationData,
      via: "user_data",
      type: "education"
    };
  }

  if (question_type === "experience") {
    console.log("💼 Experience type question detected - direct return");
    // Get user data for experience only
    let userData = null;
    try {
      userData = await getStoredFAQData();
    } catch (error) {
      console.warn("⚠️ Error getting user data for experience:", error);
    }
    
    const experienceData = userData?.experience || [];
    return {
      question,
      answer: experienceData,
      via: "user_data",
      type: "experience"
    };
  }

  // Continue with existing flow for input and choice types
  console.log("🔄 Processing input/choice type question:", question_type);

  // Check if question is optional
  const isOptional = question.toLowerCase().includes('(optional)');
  if (isOptional) {
    console.log("🔍 Optional question detected:", question);
  }

  // Get user data from local storage
  let userData = null;
  try {
    userData = await getStoredFAQData();
  } catch (error) {
    console.warn("⚠️ Unexpected error getting stored user data:", error);
  }

  if (!userData || Object.keys(userData).length === 0) {
    console.warn("⚠️ No userData found from unified API");
  } else {
    console.log("✅ User data loaded from unified API");
    console.log("📋 User Data Snapshot:", userData);
  }

  // Find matching rule with priority handling
  const target = normalizeText(question);
  let matchedRule = null;
  let expectedAnswer = null;
  
  // Priority matching: if question contains salary-related terms, only consider salary rules
  if (target.includes("salary") || target.includes("pay") || target.includes("compensation") || target.includes("remuneration")) {
    console.log("💰 Salary-related question detected, using priority matching");
    
    // Only check salary-related rules
    const salaryRules = mappingRules.filter(r => {
      const ruleText = r.rule.toString().toLowerCase();
      return ruleText.includes("salary") || ruleText.includes("pay") || ruleText.includes("compensation") || ruleText.includes("remuneration");
    });
    
    matchedRule = salaryRules.find(r => r.rule.test(target));
    console.log(`🔍 Checked ${salaryRules.length} salary rules, found match:`, !!matchedRule);
  } else {
    // Standard matching for non-salary questions
    matchedRule = mappingRules.find(r => r.rule.test(target));
  }
  
  if (matchedRule && userData) {
    expectedAnswer = matchedRule.get(userData);
    const ruleText = matchedRule.rule.toString();
    
    if (expectedAnswer) {
      console.log(`📌 Extracted value using rule ${ruleText}:`, expectedAnswer);
    } else {
      console.warn(`❌ Rule matched (${ruleText}), but extracted value is null or empty`);
      
      if (ruleText.includes("salary")) {
        // extra debug for salary
        console.group("💰 Salary Debug");
        console.log("➡️ salary_currency_code:", userData.work_preferences?.salary_currency_code);
        console.log("➡️ salary_expectation:", userData.work_preferences?.salary_expectation);
        console.log("➡️ raw extracted:", matchedRule.get.toString());
        console.log("➡️ full user data object:", userData);
        console.groupEnd();
      }
    }
  } else if (matchedRule && !userData) {
    console.warn("⚠️ Rule matched but user data is null");
  } else {
    console.warn(`❌ No rule matched for normalized question: "${target}"`);
  }

  console.log("🧠 Mapping:", question);
  if (expectedAnswer) {
    console.log("🔎 Matched data:", expectedAnswer);
  }

  // Case: Input type
  if (question_type === "input") {
    let answer = expectedAnswer;
    let via = "user_data";
    
    if (expectedAnswer === null || expectedAnswer === undefined) {
      // For optional questions, don't call LLM if user data has no answer
      if (isOptional) {
        console.log("📝 Optional input question with no answer, returning null");
        return {
          question,
          answer: null,
          via: "user_data"
        };
      }
      
      // Extract FAQ salary data if this is a salary-related question
      let faqSalaryData = null;
      const normalizedQuestion = normalizeText(question);
      if (normalizedQuestion.includes("salary") || normalizedQuestion.includes("pay") || normalizedQuestion.includes("compensation") || normalizedQuestion.includes("remuneration")) {
        const workPrefs = parseWorkPreferences(userData);
        const salaryExpectation = workPrefs?.salary_expectation;
        const salaryCurrency = workPrefs?.salary_currency_code;
        
        if (salaryExpectation || salaryCurrency) {
          const parts = [];
          if (salaryExpectation) parts.push(`Expected Salary: ${salaryExpectation}`);
          if (salaryCurrency) parts.push(`Currency: ${salaryCurrency}`);
          faqSalaryData = parts.join(', ');
          console.log("💰 FAQ Salary Data extracted:", faqSalaryData);
        }
      }
      
      // use the improved buildLLMPrompt function to generate detailed instructions for input type
      const detailedPrompt = buildLLMPrompt({ ...jsonInput, userData, faqSalaryData });
      answer = await callLLM(detailedPrompt);
      via = "llm";
      
      if (!answer) {
        console.warn("⚠️ Both user data and LLM failed for input question:", question);
        return {
          question,
          answer: null,
          via: "llm",
          error: "LLM call failed"
        };
      }
    }
    
    return {
      question,
      answer,
      via
    };
  }
  // Case: Work Experience type
  if (question_type === "workexperience") {
    console.log("💼 Processing work experience question");
    
    try {
      const experience = parseExperience(userData);
      console.log("📋 Raw experience data:", experience);
      
      return {
        question,
        answer: experience, // 直接返回完整的工作经验数组
        via: "user_data"
      };
    } catch (error) {
      console.error("❌ Error processing work experience:", error);
      return {
        question,
        answer: [],
        via: "user_data",
        error: "Failed to parse work experience data"
      };
    }
  }

  // Case: Education type
  if (question_type === "education") {
    console.log("🎓 Processing education question");
    
    try {
      const education = parseEducation(userData);
      console.log("📋 Raw education data:", education);
      
      return {
        question,
        answer: education, // 直接返回完整的教育背景数组
        via: "user_data"
      };
    } catch (error) {
      console.error("❌ Error processing education:", error);
      return {
        question,
        answer: [],
        via: "user_data",
        error: "Failed to parse education data"
      };
    }
  }

  // Case: Choice types
  if (question_type === "single choice" || question_type === "multiple choice") {
    const choiceKeys = Object.entries(options || {});
    
    // Handle null/undefined expectedAnswer properly
    let cleanAnswer = "";
    if (expectedAnswer !== null && expectedAnswer !== undefined) {
      cleanAnswer = typeof expectedAnswer === "string"
        ? expectedAnswer.trim().toLowerCase()
        : String(expectedAnswer).trim().toLowerCase();
      
      if (typeof expectedAnswer !== "string") {
        console.warn("⚠️ expectedAnswer is not string, auto-cast:", expectedAnswer, "→", cleanAnswer);
      }
    } else {
      console.log("📝 expectedAnswer is null/undefined, skipping direct matching");
    }
  
    // 1. fully match (only if we have a valid answer)
    let matchedKeys = [];
    if (cleanAnswer) {
      console.log("=== choiceKeys", choiceKeys)
      matchedKeys = choiceKeys.filter(([_k, v]) =>
        v.trim().toLowerCase() === cleanAnswer
      ).map(([k]) => k);
    }
  
    // 2. contain/number-aware match (only if we have a valid answer)
    if (matchedKeys.length === 0 && cleanAnswer) {
      const expectedDigits = (cleanAnswer.match(/\d+/g) || []).join("");
      const expectedNum = expectedDigits ? parseInt(expectedDigits, 10) : NaN;
      const expectedK = Number.isFinite(expectedNum) ? Math.round(expectedNum / 1000) + "k" : null;

      matchedKeys = choiceKeys.filter(([_k, v]) => {
        const optionText = v.toLowerCase();
        const normalized = optionText.replace(/\s+/g, " ").trim();
        const containsClean = normalized.includes(cleanAnswer);

        if (containsClean) return true;

        if (expectedK) {
          // match forms: 100k, $100k, 100k+, $100k+
          if (normalized.includes(expectedK)) return true;
          if (normalized.includes("$" + expectedK)) return true;
        }

        // also try direct number presence
        if (expectedDigits && normalized.includes(expectedDigits)) return true;

        return false;
      }).map(([k]) => k);
    }
  
    // 3. match success
    if (matchedKeys.length > 0) {
      return {
        question,
        answer: question_type === "single choice" ? matchedKeys[0] : matchedKeys,
        via: "user_data"
      };
    } else if (expectedAnswer !== null && expectedAnswer !== undefined) {
      console.warn(`❌ User data value "${expectedAnswer}" found, but no matching option. Falling back to LLM.`);
    }
  
    // For optional questions, don't call LLM if no user data match found
    if (isOptional) {
      console.log("📝 Optional choice question with no match, returning empty");
      return {
        question,
        answer: question_type === "single choice" ? null : [],
        via: "user_data",
        match: false
      };
    }
  
    // Extract FAQ salary data if this is a salary-related question
    let faqSalaryData = null;
    const normalizedQuestion = normalizeText(question);
    if (normalizedQuestion.includes("salary") || normalizedQuestion.includes("pay") || normalizedQuestion.includes("compensation") || normalizedQuestion.includes("remuneration")) {
      const workPrefs = parseWorkPreferences(userData);
      const salaryExpectation = workPrefs?.salary_expectation;
      const salaryCurrency = workPrefs?.salary_currency_code;
      
      if (salaryExpectation || salaryCurrency) {
        const parts = [];
        if (salaryExpectation) parts.push(`Expected Salary: ${salaryExpectation}`);
        if (salaryCurrency) parts.push(`Currency: ${salaryCurrency}`);
        faqSalaryData = parts.join(', ');
        console.log("💰 FAQ Salary Data extracted for choice question:", faqSalaryData);
      }
    }
  
    // fallback to LLM
    const llmPrompt = buildLLMPrompt({ ...jsonInput, userData, faqSalaryData });
    const llmAnswer = await callLLM(llmPrompt);
  
    if (!llmAnswer) {
      console.warn("⚠️ LLM call failed, no answer available");
      return {
        question,
        answer: question_type === "single choice" ? null : [],
        via: "llm",
        match: false,
        error: "LLM call failed"
      };
    }
  
    // Try multiple matching strategies for LLM answer
    let llmMatchedKeys = [];
    const cleanLlmAnswer = llmAnswer.trim().toLowerCase();
    
    // Also create a version with special characters normalized
    const normalizedLlmAnswer = cleanLlmAnswer.replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
    
    console.log(`🔍 LLM Answer Processing: "${llmAnswer}" -> cleaned: "${cleanLlmAnswer}" -> normalized: "${normalizedLlmAnswer}"`);
    console.log(`📋 Available options (first 5):`, choiceKeys.slice(0, 5).map(([k, v]) => `${k}: ${v}`));
    
    // 1. Exact match
    llmMatchedKeys = choiceKeys.filter(([_k, v]) =>
      v.trim().toLowerCase() === cleanLlmAnswer
    ).map(([k]) => k);
    
    console.log(`🎯 Exact matches found: ${llmMatchedKeys.length}`);
    
    // 2. If no exact match, try partial matching (e.g., "+61" matches "Australia (+61)")
    if (llmMatchedKeys.length === 0) {
      console.log(`🔍 Trying partial matching for: "${cleanLlmAnswer}"`);
      
      const partialMatches = choiceKeys.filter(([_k, v]) => {
        const optionText = v.trim().toLowerCase();
        const normalizedOptionText = optionText.replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
        
        // Try multiple matching strategies
        const directMatch = optionText.includes(cleanLlmAnswer) || cleanLlmAnswer.includes(optionText);
        const normalizedMatch = normalizedOptionText.includes(normalizedLlmAnswer) || normalizedLlmAnswer.includes(normalizedOptionText);
        const numberMatch = cleanLlmAnswer.match(/\d+/) && optionText.includes(cleanLlmAnswer.match(/\d+/)[0]);
        
        const isMatch = directMatch || normalizedMatch || numberMatch;
        
        if (isMatch) {
          console.log(`✅ Partial match found: "${cleanLlmAnswer}" <-> "${optionText}" (direct:${directMatch}, normalized:${normalizedMatch}, number:${numberMatch})`);
        }
        
        return isMatch;
      });
      
      console.log(`🎯 Partial matches found: ${partialMatches.length}`);
      
      if (partialMatches.length > 0) {
        // If multiple matches, prioritize based on relevance
        if (partialMatches.length > 1) {
          console.log(`🔍 Multiple partial matches found for "${llmAnswer}":`, 
            partialMatches.map(([_k, v]) => v));
          
          // For country codes, prioritize common countries
          const priorityCountries = ['australia', 'united states', 'united kingdom', 'canada'];
          const priorityMatch = partialMatches.find(([_k, v]) => 
            priorityCountries.some(country => v.toLowerCase().includes(country))
          );
          
          llmMatchedKeys = priorityMatch ? [priorityMatch[0]] : [partialMatches[0][0]];
        } else {
          llmMatchedKeys = [partialMatches[0][0]];
        }
        
        console.log(`🔍 LLM partial match selected: "${llmAnswer}" -> "${choiceKeys.find(([k]) => k === llmMatchedKeys[0])?.[1]}"`);
      }
    }
    
    const finalAnswer = question_type === "single choice"
      ? llmMatchedKeys[0] || llmAnswer
      : (llmMatchedKeys.length ? llmMatchedKeys : llmAnswer);
    
    console.log(`📤 Final LLM result: answer="${finalAnswer}", match=${llmMatchedKeys.length > 0}, matchedKeys=${llmMatchedKeys}`);
    
    return {
      question,
      answer: finalAnswer,
      via: "llm",
      match: llmMatchedKeys.length > 0
    };
  }

  // Handle unknown question types
  console.warn("❓ Unknown question type:", question_type);
  return null;
}