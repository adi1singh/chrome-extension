;(function (global) {
  // Fake user data for testing purposes
  const fakeUserData = {
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
        address: "123 Collins Street",
        street_no: "123",
        street_name: "Collins Street",
        city: "Melbourne",
        state: "VIC",
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
    id_type: "Passport"
  };

  // Function to validate and get JWT token (fake version)
  function getFakeValidJWT(callback) {
    console.log("🔑 [FAKE] Using fake JWT token");
    // Simulate async behavior
    setTimeout(() => {
      callback("fake-jwt-token-for-testing");
    }, 100);
  }

  function normalizeText(s) {
    return s
      .toString()
      .toLowerCase()
      .replace(/[^\w\s]|/g, '')
      .replace(/_/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
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

  /* ========================================================================
   *  Updated Mapping Rules - Using new unified API structure
   * ===================================================================== */

  const mappingRules = [
    /* ───────────── Personal Information ──────────────── */
    { rule: /\b(?:relocate|relocation|relocating|willing\s*to\s*relocate|ability\s*to\s*relocate)\b/i, get: a => a.work_preferences?.can_you_relocate ?? null },
    { rule: /\b(?:citizen(?:ship)?|permanent\s*resident|permanent\s*residency|residency\s*status|resident)\b/i, get: a => a.personal_info?.citizenship ?? null },
    { rule: /\b(?:notice\s*period|period\s*of\s*notice|current\s*notice|notice)\b/i, get: a => {
      const noticeValue = a.work_preferences?.current_notice_period;
      if (!noticeValue) return null;
      
      // extract the num from string
      const match = String(noticeValue).match(/\b(\d+)\b/);
      return match ? match[1] : noticeValue;
    }},
    { rule: /\b(?:date\s*of\s*birth|birth\s*date|birthdate|birthday|dob)\b/i, get: a => a.personal_info?.date_of_birth ?? null },
    { rule: /\b(?:e[-]?mail|email\s*address|contact\s*email|mail\s*address|email)\b/i, get: a => a.personal_info?.email ?? null },
    { rule: /\b(?:first\s*name|given\s*name|first)\b/i, get: a => a.personal_info?.first_name ?? null },
    { rule: /\b(?:middle\s*name|middle)\b/i, get: a => a.personal_info?.middle_name ?? '' },
    { rule: /\b(?:full\s*name|fullname|complete\s*name|full\s*legal\s*name)\b/i, get: a => {
      const firstName = a.personal_info?.first_name || '';
      const lastName = a.personal_info?.last_name || '';
      if (firstName && lastName) {
        return `${firstName} ${lastName}`.trim();
      } 
      return null;
    }},
    { rule: /\b(?:sponsorship|visa\s*sponsorship|require\s*sponsorship|sponsorship\s*required|sponsor)\b/i, get: a => a.work_preferences?.future_sponsorship_required ?? null },
    { rule: /\b(?:id\s*type|identification|identity|identity\s*document|id\s*document|passport|driver'?s\s*licen[cs]e)\b/i, get: a => a.id_type ?? null },
    { rule: /\b(?:industry|sector|industry\s*sector|desired\s*industry|target\s*industry|field\s*of\s*work)\b/i, get: a => a.work_preferences?.industry ?? null },
    { rule: /\b(?:job\s*title|position\s*title|current\s*(?:role|position)|role\s*title)\b/i, get: a => a.work_preferences?.job_title ?? null },
    { rule: /\b(?:last\s*name|lastname|family\s*name|surname)\b/i, get: a => a.personal_info?.last_name ?? null },
    { rule: /\b(?:legally\s*authori[sz]ed\s*to\s*work|legal\s*to\s*work|authorized\s*to\s*work|work\s*eligibility)\b/i, get: a => a.work_preferences?.legally_authorise_to_work ?? null },
    { rule: /^(?:primary\s*contact\s*number|mobile\s*phone\s*number|phone\s*number|mobile\s*number|contact\s*number|telephone\s*number|telephone|contact|phone|mobile|number)\b/i, get: a => a.personal_info?.phone ?? null },
    { rule: /^(?:Phone\s*country\s*code|Country\s*code|Dial(?:ing)?\s*code|International\s*code|Intl\s*code|Area\s*code)\b/i, get: a => a.personal_info?.phone_country_code ?? null },
    { rule: /\b(?:working\s*model|work\s*model|preferred\s*working\s*model|preferred\s*work\s*model|work\s*arrangement|working\s*arrangement)\b/i, get: a => a.work_preferences?.preferred_working_model ?? null },
    { rule: /\b(?:working\s*type|work\s*type|employment\s*type|job\s*type|engagement\s*type|contract\s*type|preferred\s*work\s*type)\b/i, get: a => a.work_preferences?.preferred_working_type ?? null },
    { rule: /\b(?:residency\s*status|residing\s*in\s*country|country\s*of\s*residence|living\s*in\s*country|current\s*country)\b/i, get: a => a.work_preferences?.residing_in_country ?? null },
    { rule: /\b(?:salary\s*currency\s*code|currency\s*code|salary\s*currency|currency)\b/i, get: a => a.work_preferences?.salary_currency_code ?? null },
    { rule: /\b(?:salary|pay\s*expectation|expected\s*pay|annual\s*package|compensation\s*expectation|target\s*remuneration|remuneration\s*expectation)\b/i, get: a => a.work_preferences?.salary_expectation ?? null },
    { rule: /\b(?:salutation|honorific|title|greeting|prefix)\b/i, get: a => a.personal_info?.salutation ?? null },
    { rule: /\b(?:search\s*city|preferred\s*city|desired\s*city|target\s*city|city\s*of\s*search)\b/i, get: a => a.work_preferences?.search_location?.city ?? null },
    { rule: /\b(?:search\s*country|preferred\s*country|desired\s*country|target\s*country|country\s*preference|country\s*of\s*search)\b/i, get: a => a.work_preferences?.search_location?.country ?? null },
    { rule: /\b(?:availability|available\s*to\s*start|available\s*date|start\s*date|earliest\s*start|when\s*can\s*you\s*start)\b/i, get: a => a.work_preferences?.when_available_to_start ?? null },
    { rule: /\b(?:travel|willing\s*to\s*travel|travel\s*availability|ability\s*to\s*travel|travelling\s*required)\b/i, get: a => a.work_preferences?.willing_to_travel != null ? String(a.work_preferences?.willing_to_travel) : null },
    { rule: /\b(?:visa|visa\s*status|work\s*visa|work\s*authori[sz]ation|work\s*permit|immigration\s*status|work\s*status|right\s*to\s*work|work\s*rights)\b/i, get: a => {
      const rawStatus = a.work_preferences?.work_authorisation_status;
      return mapVisaStatus(rawStatus);
    }},
    { rule: /\b(?:postcode|zip|postal|postal\s*code)\b/i, get: a => a.personal_info?.user_address?.post_code ?? null },
    { rule: /\b(?:state\s*province|stateprovince|state|province|state\/province|state\s*of\s*residence|province\s*of\s*residence)\b/i, get: a => a.personal_info?.user_address?.state ?? null },
    { rule: /\b(?:state\s*code?)\b/i, get: a => a.personal_info?.user_address?.state_code ?? null },
    { rule: /\b(?:street\s*name|street)\b/i, get: a => a.personal_info?.user_address?.street_name ?? null },
    { rule: /\b(?:street\s*(?:no\.?|number)|house\s*number|address\s*number)\b/i, get: a => a.personal_info?.user_address?.street_no ?? null },
    { rule: /\b(?:full\s*address|complete\s*address|address\s*line\s*1\s*&?\s*2?)\b/i, get: a => a.personal_info?.user_address?.address ?? null },

    /* ───────────── Location and City mappings ──────────────── */
    { rule: /\b(?:location|city|suburb|base(?!\s*(?:salary))|locality|suburblocality)\b/i, get: a => a.personal_info?.user_address?.city ?? null },
    { rule: /\b(?:country)\b/i, get: a => a.personal_info?.user_address?.country ?? null },
    { rule: /\b(?:Country\/region of residence|countryregion of residence)\b/i, get: a => a.personal_info?.user_address?.country ?? null },

    /* ───────────── LinkedIn and Portfolio ──────────────── */
    { rule: /\b(?:linkedin|linkedin\s*profile|linkedin\s*url)\b/i, get: a => a.personal_info?.linkedin ?? null },
    { rule: /\b(?:website|website\s*url|portfolio|portfolio\s*url)\b/i, get: a => a.personal_info?.website_url ?? null },
    { rule: /\b(?:github|github\s*profile|github\s*url)\b/i, get: a => a.personal_info?.github ?? null },

    /* ───────────── Application Volume ──────────────── */
    { rule: /\b(?:application\s*volume|applications\s*per\s*week|weekly\s*applications|application\s*frequency)\b/i, get: a => a.work_preferences?.application_volume_preference ?? null },

    /* ───────────── When Can Relocate ──────────────── */
    { rule: /\b(?:when\s*can\s*you\s*relocate|relocate\s*timeframe|relocation\s*timeline)\b/i, get: a => a.work_preferences?.when_can_you_relocate ?? null },
  ];

  function buildLLMPrompt({ question, question_type, options, userData: _userData }) {
    if (question_type === "input") {
      //give the user a specific instruction based on the question
      const normalizedQuestion = normalizeText(question);

      // according to the question type, give the user a specific instruction
      let specificInstructions = "";
      let specificExamples = "";
      
      if (normalizedQuestion.includes("salary") || normalizedQuestion.includes("pay") || normalizedQuestion.includes("compensation")) {
        specificInstructions = "Please provide a specific salary amount or range in numbers (e.g., '75000', '80k-100k', '120000 AUD'). If you don't have a specific amount, provide a reasonable estimate based on the role and your experience level.";
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
IMPORTANT: Your answer must be 25 characters or less. Keep it concise and direct.

Please provide a direct, specific answer without asking for clarification. If you need to make assumptions, state them clearly.`;
    }

    const list = Object.values(options)
      .map(opt => `- ${opt}`)
      .join('\n');

    if (question_type === "single choice") {
      return `Question: "${question}"\n\nOptions:\n${list}\n\nInstructions:\n- Choose EXACTLY ONE option from the list above.\n- Return ONLY the chosen option text, copied verbatim.\n- Do NOT include any extra words, punctuation, or explanations.\n- If unsure, return the single best-fitting option.`;
    }

    if (question_type === "multiple choice") {
      // only return the single most appropriate option text
      return `Question: "${question}"\n\nOptions:\n${list}\n\nInstructions:\n- Select all that apply, but RETURN ONLY the single most appropriate option text.\n- Return ONLY the option text, copied verbatim.\n- Do NOT include any extra words, punctuation, or explanations.`;
    }

    return `Question: "${question}"\n\nOptions:\n${list}\n\nInstructions:\n- Choose the most appropriate option(s).\n- Return ONLY the chosen option text, copied verbatim.`;
  }

  async function callFakeLLM(email, prompt) {
    console.log("🧠 [FAKE] Calling fake LLM API with prompt:", prompt);
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Generate fake responses based on common patterns
    const normalizedPrompt = prompt.toLowerCase();
    
    if (normalizedPrompt.includes("first name")) {
      return "John";
    } else if (normalizedPrompt.includes("last name") || normalizedPrompt.includes("surname")) {
      return "Smith";
    } else if (normalizedPrompt.includes("email")) {
      return "john.smith@example.com";
    } else if (normalizedPrompt.includes("phone") || normalizedPrompt.includes("mobile")) {
      return "0412345678";
    } else if (normalizedPrompt.includes("salary") || normalizedPrompt.includes("compensation")) {
      return "120000";
    } else if (normalizedPrompt.includes("city") || normalizedPrompt.includes("location")) {
      return "Melbourne";
    } else if (normalizedPrompt.includes("notice")) {
      return "4";
    } else if (normalizedPrompt.includes("availability") || normalizedPrompt.includes("start")) {
      return "4 weeks notice";
    } else if (normalizedPrompt.includes("experience") || normalizedPrompt.includes("years")) {
      return "5";
    } else if (normalizedPrompt.includes("visa") || normalizedPrompt.includes("citizen")) {
      return "Australian Citizen";
    } else if (normalizedPrompt.includes("linkedin")) {
      return "https://linkedin.com/in/johnsmith";
    } else if (normalizedPrompt.includes("github")) {
      return "https://github.com/johnsmith";
    } else if (normalizedPrompt.includes("website") || normalizedPrompt.includes("portfolio")) {
      return "https://johnsmith.dev";
    } else {
      // Generic response for unknown questions
      return "Not specified";
    }
  }

  // Fake function to fetch user data
  async function fetchFakeUserData() {
    console.log("📋 [FAKE] Fetching fake user data");
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 200));
    
    return fakeUserData;
  }

  async function mapFakeStructuredQuestion(jsonInput, userEmail) {
    const { question, question_type, options } = jsonInput;
    if (!question || !question_type) return null;

    console.log("🔍 [FAKE] Processing question:", question);

    // Check if question is optional
    const isOptional = question.toLowerCase().includes('(optional)');
    if (isOptional) {
      console.log("🔍 [FAKE] Optional question detected:", question);
    }

    // Get fake user data
    const userData = await fetchFakeUserData();
    console.log("✅ [FAKE] User data loaded");

    // Find matching rule
    const target = normalizeText(question);
    let matchedRule = null;
    let expectedAnswer = null;
    
    // Check if the question matches any mapping rule
    matchedRule = mappingRules.find(r => r.rule.test(target));
    
    if (matchedRule && userData) {
      expectedAnswer = matchedRule.get(userData);
      const ruleText = matchedRule.rule.toString();
      
      if (expectedAnswer) {
        console.log(`📌 [FAKE] Extracted value using rule ${ruleText}:`, expectedAnswer);
      } else {
        console.warn(`❌ [FAKE] Rule matched (${ruleText}), but extracted value is null or empty`);
      }
    } else if (matchedRule && !userData) {
      console.warn("⚠️ [FAKE] Rule matched but user data is null");
    } else {
      console.warn(`❌ [FAKE] No rule matched for normalized question: "${target}"`);
    }

    console.log("🧠 [FAKE] Mapping:", question);
    if (expectedAnswer) {
      console.log("🔎 [FAKE] Matched data:", expectedAnswer);
    }

    // Case: Input type
    if (question_type === "input") {
      let answer = expectedAnswer;
      let via = "user_data";
      
      if (expectedAnswer === null || expectedAnswer === undefined) {
        // For optional questions, don't call LLM if user data has no answer
        if (isOptional) {
          console.log("📝 [FAKE] Optional input question with no answer, returning null");
          return {
            question,
            answer: null,
            via: "user_data"
          };
        }
        
        // use the improved buildLLMPrompt function to generate detailed instructions for input type
        const detailedPrompt = buildLLMPrompt({ ...jsonInput, userData });
        answer = await callFakeLLM(userEmail, detailedPrompt);
        via = "llm";
        
        if (!answer) {
          console.warn("⚠️ [FAKE] Both user data and LLM failed for input question:", question);
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

    // Case: Choice types
    if (question_type === "single choice" || question_type === "multiple choice") {
      const choiceKeys = Object.entries(options || {});
      const cleanAnswer = typeof expectedAnswer === "string"
        ? expectedAnswer.trim().toLowerCase()
        : String(expectedAnswer).trim().toLowerCase();
    
      if (typeof expectedAnswer !== "string") {
        console.warn("⚠️ [FAKE] expectedAnswer is not string, auto-cast:", expectedAnswer, "→", cleanAnswer);
      }
    
      // 1. fully match
      let matchedKeys = choiceKeys.filter(([_k, v]) =>
        v.trim().toLowerCase() === cleanAnswer
      ).map(([k]) => k);
    
      // 2. contain match
      if (matchedKeys.length === 0 && cleanAnswer) {
        matchedKeys = choiceKeys.filter(([_k, v]) =>
          v.toLowerCase().includes(cleanAnswer)
        ).map(([k]) => k);
      }
    
      // 3. match success
      if (matchedKeys.length > 0) {
        return {
          question,
          answer: question_type === "single choice" ? matchedKeys[0] : matchedKeys,
          via: "user_data"
        };
      } else if (expectedAnswer) {
        console.warn(`❌ [FAKE] User data value "${expectedAnswer}" found, but no matching option. Falling back to LLM.`);
      }
    
      // For optional questions, don't call LLM if no user data match found
      if (isOptional) {
        console.log("📝 [FAKE] Optional choice question with no match, returning empty");
        return {
          question,
          answer: question_type === "single choice" ? null : [],
          via: "user_data",
          match: false
        };
      }
    
      // If no match found, return first choice as fallback
      console.log("📝 [FAKE] No match found, returning first choice as fallback");
      const firstChoiceKey = choiceKeys.length > 0 ? choiceKeys[0][0] : null;
      
      return {
        question,
        answer: question_type === "single choice" ? firstChoiceKey : (firstChoiceKey ? [firstChoiceKey] : []),
        via: "fallback_first_choice",
        match: false
      };
    }

    console.warn("❓ [FAKE] Unknown question type:", question_type);
    return null;
  }

  // Initialize fake JWT
  function initializeFakeJWT() {
    console.log("🔑 [FAKE] JWT initialized with fake token");
  }

  // Initialize immediately
  initializeFakeJWT();

  global.fakeStructuredMapper = { 
    map: mapFakeStructuredQuestion,
    getValidJWT: getFakeValidJWT,
    initializeJWT: initializeFakeJWT,
    mappingRules: mappingRules,
    fetchUserData: fetchFakeUserData,
    fakeUserData: fakeUserData
  };
})(window);

export default window.fakeStructuredMapper;
