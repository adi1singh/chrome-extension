/**
 * InfoMapping Test Suite
 * This script tests the infoMapping functionality with predefined test cases.
 * Questions are in English. Results can be manually verified.
 */

// Mock user data for testing
const mockUserData = {
  personal_info: {
    first_name: "John",
    last_name: "Smith",
    middle_name: "Michael",
    email: "john.smith@example.com",
    phone: "0412345678",
    phone_country_code: "+61",
    date_of_birth: "15/03/1990",
    citizenship: "Australian Citizen",
    salutation: "Mr",
    linkedin: "https://linkedin.com/in/johnsmith",
    website_url: "https://johnsmith.dev",
    github: "https://github.com/johnsmith",
    user_address: {
      address: "123 Collins Street, Melbourne, VIC 3000",
      street_no: "123",
      street_name: "Collins Street",
      city: "Melbourne",
      state: "Victoria",
      state_code: "VIC",
      post_code: "3000",
      country: "Australia"
    }
  },
  work_preferences: {
    job_title: "Senior Software Developer",
    industry: "Technology",
    salary_expectation: "120000",
    salary_currency_code: "AUD",
    current_notice_period: "4 weeks",
    when_available_to_start: "4 weeks notice",
    preferred_working_model: "Hybrid",
    preferred_working_type: "Full-time",
    legally_authorise_to_work: "Yes",
    work_authorisation_status: "Australian Citizen",
    can_you_relocate: "Yes",
    when_can_you_relocate: "Within 3 months",
    residing_in_country: "Australia",
    future_sponsorship_required: "No",
    willing_to_travel: true,
    application_volume_preference: "5-10 per week",
    search_location: {
      city: "Melbourne",
      country: "Australia"
    }
  },
  education: [
    {
      degree: "Bachelor of Computer Science",
      institute: "University of Melbourne",
      gpa: "3.8",
      education_mode: "Full-time",
      start_date: "2010-02",
      end_date: "2013-12"
    },
    {
      degree: "Master of Software Engineering",
      institute: "RMIT University",
      gpa: "3.9",
      education_mode: "Part-time",
      start_date: "2015-03",
      end_date: "2017-12"
    }
  ],
  experience: [
    {
      company_name: "Tech Solutions Pty Ltd",
      title: "Senior Software Developer",
      employment_type: "Full-time",
      role_description: "Led development team, built scalable web applications",
      start_date: "2018-01",
      end_date: "Present",
      location: "Melbourne, VIC"
    },
    {
      company_name: "Digital Innovations",
      title: "Software Developer",
      employment_type: "Full-time",
      role_description: "Developed front-end and back-end solutions",
      start_date: "2014-03",
      end_date: "2017-12",
      location: "Sydney, NSW"
    }
  ],
  skills: [
    { name: "JavaScript", years_of_experience: "8" },
    { name: "React", years_of_experience: "5" },
    { name: "Node.js", years_of_experience: "6" },
    { name: "Python", years_of_experience: "4" }
  ],
  language: ["English", "Mandarin"],
  diversity: {
    gender: "Male",
    aboriginal_or_torres_strait_islander: "No",
    first_language_as_child: "English",
    person_with_disability: "No",
    requires_adjustment_at_work: "No",
    minority_racial_ethnic_or_ethno_religious_group: "No"
  },
  id_type: "Passport",
  enable_ai_auto_create_account: true,
  "enable_ai_accept_t&C": true
};

// Helper function to normalize text (same as infoMapping.js)
function normalizeText(s) {
  return s
    .toString()
    .toLowerCase()
    .replace(/[^\w\s]|/g, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Parser functions (same as infoMapping.js)
function parsePersonalInfo(userData) {
  if (!userData.personal_info) return {};
  try {
    return typeof userData.personal_info === 'string' ? JSON.parse(userData.personal_info) : userData.personal_info;
  } catch (_e) {
    return {};
  }
}

function parseWorkPreferences(userData) {
  if (!userData.work_preferences) return {};
  try {
    return typeof userData.work_preferences === 'string' ? JSON.parse(userData.work_preferences) : userData.work_preferences;
  } catch (_e) {
    return {};
  }
}

function parseDiversity(userData) {
  if (!userData.diversity) return {};
  try {
    return typeof userData.diversity === 'string' ? JSON.parse(userData.diversity) : userData.diversity;
  } catch (_e) {
    return {};
  }
}

function parseEducation(userData) {
  if (!userData.education) return [];
  try {
    return typeof userData.education === 'string' ? JSON.parse(userData.education) : userData.education;
  } catch (_e) {
    return [];
  }
}

function parseExperience(userData) {
  if (!userData.experience) return [];
  try {
    return typeof userData.experience === 'string' ? JSON.parse(userData.experience) : userData.experience;
  } catch (_e) {
    return [];
  }
}

function parseSkills(userData) {
  if (!userData.skills) return [];
  try {
    return typeof userData.skills === 'string' ? JSON.parse(userData.skills) : userData.skills;
  } catch (_e) {
    return [];
  }
}

function parseLanguage(userData) {
  if (!userData.language) return [];
  try {
    return typeof userData.language === 'string' ? JSON.parse(userData.language) : userData.language;
  } catch (_e) {
    return [];
  }
}

// Visa mapping function
function mapVisaStatus(visaStatus) {
  if (!visaStatus) return null;
  
  const status = String(visaStatus).toLowerCase().trim();
  
  const visaMapping = {
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
  
  if (visaMapping[status]) {
    return visaMapping[status];
  }
  
  for (const [key, value] of Object.entries(visaMapping)) {
    if (status.includes(key) || key.includes(status)) {
      return value;
    }
  }
  
  return visaStatus;
}

// Mapping rules (simplified version from infoMapping.js)
const mappingRules = [
  /* Personal Information */
  { rule: /\b(?:relocate|relocation|relocating|willing\s*to\s*relocate|ability\s*to\s*relocate)\b/i, get: a => parseWorkPreferences(a)?.can_you_relocate ?? null },
  { rule: /\b(?:citizen(?:ship)?|permanent\s*resident|permanent\s*residency|residency\s*status|resident)\b/i, get: a => parsePersonalInfo(a)?.citizenship ?? null },
  { rule: /\b(?:notice\s*period|period\s*of\s*notice|current\s*notice|notice)\b/i, get: a => {
    const workPrefs = parseWorkPreferences(a);
    const noticeValue = workPrefs?.current_notice_period;
    if (!noticeValue) return null;
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
  { rule: /^(?:primary\s*contact\s*number|mobile\s*phone\s*number|phone\s*number|mobile\s*number|contact\s*number|telephone\s*number|telephone|contact|phone|mobile|number)\b/i, get: a => parsePersonalInfo(a)?.phone ?? null },
  { rule: /^(?:Phone\s*country\s*code|Country\s*code|Dial(?:ing)?\s*code|International\s*code|Intl\s*code|Area\s*code)\b/i, get: a => parsePersonalInfo(a)?.phone_country_code ?? null },
  { rule: /\b(?:working\s*model|work\s*model|preferred\s*working\s*model|preferred\s*work\s*model|work\s*arrangement|working\s*arrangement)\b/i, get: a => parseWorkPreferences(a)?.preferred_working_model ?? null },
  { rule: /\b(?:working\s*type|work\s*type|preferred\s*working\s*type|preferred\s*work\s*type|engagement\s*type|contract\s*type)\b/i, get: a => parseWorkPreferences(a)?.preferred_working_type ?? null },
  { rule: /\b(?:residency\s*status|residing\s*in\s*country|country\s*of\s*residence|living\s*in\s*country|current\s*country)\b/i, get: a => parseWorkPreferences(a)?.residing_in_country ?? null },
  { rule: /\b(?:salary\s*currency\s*code|currency\s*code|salary\s*currency|currency)\b/i, get: a => parseWorkPreferences(a)?.salary_currency_code ?? null },
  { rule: /\b(?:salary|pay\s*expectations?|expected\s*pay|annual\s*package|compensation\s*expectations?|target\s*remuneration|remuneration\s*expectations?)\b/i, get: a => parseWorkPreferences(a)?.salary_expectation ?? null },
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
  { rule: /\b(?:state\s*province|stateprovince|state|province|state\/province|state\s*of\s*residence|province\s*of\s*residence)\b/i, get: a => {
    const state = parsePersonalInfo(a)?.user_address?.state;
    return (state && state.trim()) ? state.trim() : null;
  }},
  { rule: /\b(?:state\s*code?)\b/i, get: a => parsePersonalInfo(a)?.user_address?.state_code ?? null },
  { rule: /\b(?:street\s*name|street)\b/i, get: a => {
    const streetName = parsePersonalInfo(a)?.user_address?.street_name;
    return (streetName && streetName.trim()) ? streetName.trim() : null;
  }},
  { rule: /\b(?:street\s*(?:no\.?|number)|house\s*number|address\s*number)\b/i, get: a => parsePersonalInfo(a)?.user_address?.street_no ?? null },
  { rule: /\b(?:full\s*address|complete\s*address|address\s*line\s*1\s*&?\s*2?)\b/i, get: a => {
    const personalInfo = parsePersonalInfo(a);
    const userAddress = personalInfo?.user_address;
    if (!userAddress) return null;
    if (userAddress.address && userAddress.address.trim()) {
      return userAddress.address.trim();
    }
    const components = [
      userAddress.street_no?.trim(),
      userAddress.street_name?.trim(),
      userAddress.city?.trim(),
      userAddress.state?.trim(),
      userAddress.post_code?.trim()
    ].filter(Boolean);
    return components.length > 0 ? components.join(', ') : null;
  }},
  
  /* Location and City */
  { rule: /\b(?:location|city|suburb|base(?!\s*(?:salary))|locality|suburblocality)\b/i, get: a => {
    const city = parsePersonalInfo(a)?.user_address?.city;
    return (city && city.trim()) ? city.trim() : null;
  }},
  { rule: /\b(?:country)\b/i, get: a => parsePersonalInfo(a)?.user_address?.country ?? null },
  
  /* LinkedIn and Portfolio */
  { rule: /\b(?:linkedin|linkedin\s*profile|linkedin\s*url)\b/i, get: a => parsePersonalInfo(a)?.linkedin ?? null },
  { rule: /\b(?:website|website\s*url|portfolio|portfolio\s*url)\b/i, get: a => parsePersonalInfo(a)?.website_url ?? null },
  { rule: /\b(?:github|github\s*profile|github\s*url)\b/i, get: a => parsePersonalInfo(a)?.github ?? null },
  
  /* Application Volume */
  { rule: /\b(?:application\s*volume|applications\s*per\s*week|weekly\s*applications|application\s*frequency)\b/i, get: a => parseWorkPreferences(a)?.application_volume_preference ?? null },
  
  /* When Can Relocate */
  { rule: /\b(?:when\s*can\s*you\s*relocate|relocate\s*timeframe|relocation\s*timeline)\b/i, get: a => parseWorkPreferences(a)?.when_can_you_relocate ?? null },
  
  /* Education */
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
  
  /* Work Experience */
  { rule: /\b(?:current\s*company|employer|company\s*name|organization)\b/i, get: a => {
    const experience = parseExperience(a);
    return experience.length > 0 ? experience[0].company_name : null;
  }},
  { rule: /\b(?:current\s*position|current\s*job\s*title|current\s*role\s*title)\b/i, get: a => {
    const experience = parseExperience(a);
    return experience.length > 0 ? experience[0].title : null;
  }},
  
  /* Skills */
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
  
  /* Diversity */
  { rule: /\b(?:gender|sex)\b/i, get: a => parseDiversity(a)?.gender ?? null },
  { rule: /\b(?:aboriginal|torres\s*strait\s*islander|indigenous)\b/i, get: a => parseDiversity(a)?.aboriginal_or_torres_strait_islander ?? null },
  { rule: /\b(?:first\s*language|native\s*language|mother\s*tongue)\b/i, get: a => parseDiversity(a)?.first_language_as_child ?? null },
  { rule: /\b(?:disability|disabled|person\s*with\s*disability)\b/i, get: a => parseDiversity(a)?.person_with_disability ?? null },
  
  /* Language */
  { rule: /\b(?:languages|language\s*skills|spoken\s*languages)\b/i, get: a => {
    const languages = parseLanguage(a);
    return languages.length > 0 ? languages.join(', ') : null;
  }},
];

// Test cases with expected results
const testCases = [
  // Basic Personal Information
  { question: "What is your first name?", expectedAnswer: "John" },
  { question: "What is your last name?", expectedAnswer: "Smith" },
  { question: "What is your middle name?", expectedAnswer: "Michael" },
  { question: "What is your full name?", expectedAnswer: "John Smith" },
  { question: "What is your email address?", expectedAnswer: "john.smith@example.com" },
  { question: "What is your phone number?", expectedAnswer: "0412345678" },
  { question: "What is your phone country code?", expectedAnswer: "+61" },
  { question: "What is your date of birth?", expectedAnswer: "15/03/1990" },
  { question: "What is your salutation?", expectedAnswer: "Mr" },
  
  // Address Information
  { question: "What is your city?", expectedAnswer: "Melbourne" },
  { question: "What is your state?", expectedAnswer: "Victoria" },
  { question: "What is your state code?", expectedAnswer: "VIC" },
  { question: "What is your postcode?", expectedAnswer: "3000" },
  { question: "What is your country?", expectedAnswer: "Australia" },
  { question: "What is your street name?", expectedAnswer: "Collins Street" },
  { question: "What is your street number?", expectedAnswer: "123" },
  { question: "What is your full address?", expectedAnswer: "123 Collins Street, Melbourne, VIC 3000" },
  
  // Work Preferences
  { question: "What is your job title?", expectedAnswer: "Senior Software Developer" },
  { question: "What industry do you work in?", expectedAnswer: "Technology" },
  { question: "What is your expected salary?", expectedAnswer: "120000" },
  { question: "What is your salary currency code?", expectedAnswer: "AUD" },
  { question: "What is your notice period?", expectedAnswer: "4" },
  { question: "When are you available to start?", expectedAnswer: "4 weeks notice" },
  { question: "What is your preferred working model?", expectedAnswer: "Hybrid" },
  { question: "What is your preferred working type?", expectedAnswer: "Full-time" },
  { question: "Are you legally authorized to work?", expectedAnswer: "Yes" },
  { question: "What is your work visa status?", expectedAnswer: "I'm an Australian citizen" },
  { question: "Are you willing to relocate?", expectedAnswer: "Yes" },
  { question: "When can you relocate?", expectedAnswer: "Within 3 months" },
  { question: "What country are you residing in?", expectedAnswer: "Australia" },
  { question: "Do you require sponsorship?", expectedAnswer: "No" },
  { question: "Are you willing to travel?", expectedAnswer: "true" },
  { question: "What is your application volume preference?", expectedAnswer: "5-10 per week" },
  { question: "What is your preferred city for work?", expectedAnswer: "Melbourne" },
  { question: "What is your preferred country for work?", expectedAnswer: "Australia" },
  { question: "What is your citizenship?", expectedAnswer: "Australian Citizen" },
  
  // Professional Links
  { question: "What is your LinkedIn profile?", expectedAnswer: "https://linkedin.com/in/johnsmith" },
  { question: "What is your website URL?", expectedAnswer: "https://johnsmith.dev" },
  { question: "What is your GitHub profile?", expectedAnswer: "https://github.com/johnsmith" },
  
  // Education
  { question: "What is your degree?", expectedAnswer: "Bachelor of Computer Science" },
  { question: "What university did you attend?", expectedAnswer: "University of Melbourne" },
  { question: "What is your GPA?", expectedAnswer: "3.8" },
  
  // Work Experience
  { question: "What is your current company?", expectedAnswer: "Tech Solutions Pty Ltd" },
  { question: "What is your current position?", expectedAnswer: "Senior Software Developer" },
  
  // Skills
  { question: "What are your skills?", expectedAnswer: "JavaScript, React, Node.js, Python" },
  { question: "How many years of experience do you have?", expectedAnswer: "8" },
  
  // Diversity
  { question: "What is your gender?", expectedAnswer: "Male" },
  { question: "Are you Aboriginal or Torres Strait Islander?", expectedAnswer: "No" },
  { question: "What was your first language as a child?", expectedAnswer: "English" },
  { question: "Do you have a disability?", expectedAnswer: "No" },
  
  // Languages
  { question: "What languages do you speak?", expectedAnswer: "English, Mandarin" },
  
  // Other
  { question: "What is your ID type?", expectedAnswer: "Passport" },
];

// Run tests
function runTests() {
  console.log("=" .repeat(80));
  console.log("InfoMapping Test Suite - Manual Verification");
  console.log("=" .repeat(80));
  console.log("");
  
  const results = [];
  let passCount = 0;
  let failCount = 0;
  let notFoundCount = 0;
  
  testCases.forEach((testCase, index) => {
    const { question, expectedAnswer } = testCase;
    
    // Normalize and find matching rule
    const normalized = normalizeText(question);
    const matchedRule = mappingRules.find(r => r.rule.test(normalized));
    
    let actualAnswer = null;
    let status = "❌ NO MATCH";
    
    if (matchedRule) {
      actualAnswer = matchedRule.get(mockUserData);
      
      if (actualAnswer !== null && actualAnswer !== undefined) {
        const actualStr = String(actualAnswer);
        const expectedStr = String(expectedAnswer);
        
        if (actualStr === expectedStr) {
          status = "✅ PASS";
          passCount++;
        } else {
          status = "⚠️  FAIL";
          failCount++;
        }
      } else {
        status = "❌ NULL";
        notFoundCount++;
      }
    } else {
      notFoundCount++;
    }
    
    results.push({
      index: index + 1,
      question,
      expected: expectedAnswer,
      actual: actualAnswer,
      status
    });
  });
  
  // Print results
  results.forEach(result => {
    console.log(`${result.status} Test #${result.index}`);
    console.log(`  Question: "${result.question}"`);
    console.log(`  Expected: "${result.expected}"`);
    console.log(`  Actual:   "${result.actual}"`);
    console.log("");
  });
  
  // Summary
  console.log("=" .repeat(80));
  console.log("Test Summary");
  console.log("=" .repeat(80));
  console.log(`Total Tests:     ${testCases.length}`);
  console.log(`✅ Passed:       ${passCount} (${((passCount/testCases.length)*100).toFixed(1)}%)`);
  console.log(`⚠️  Failed:       ${failCount} (${((failCount/testCases.length)*100).toFixed(1)}%)`);
  console.log(`❌ Not Found:    ${notFoundCount} (${((notFoundCount/testCases.length)*100).toFixed(1)}%)`);
  console.log("=" .repeat(80));
  
  return {
    total: testCases.length,
    passed: passCount,
    failed: failCount,
    notFound: notFoundCount,
    results
  };
}

export { runTests, testCases, mockUserData, mappingRules };

// Make available in browser console
if (typeof window !== 'undefined') {
  window.infoMappingTest = { runTests, testCases, mockUserData, mappingRules };
  console.log("💡 Test suite loaded! Run: infoMappingTest.runTests()");
}

