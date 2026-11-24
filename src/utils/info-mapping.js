;(function (global) {
  // Function to validate and get JWT token
  function getValidJWT(callback) {
    // Check if chrome.storage is available
    if (!chrome || !chrome.storage || !chrome.storage.local) {
      console.warn("⚠️ Chrome storage API not available");
      callback(null);
      return;
    }
    
    chrome.storage.local.get(['jobgen_session_token', 'jobgen_jwt_token'], (result) => {
      const jobgen_session_token = result.jobgen_session_token || result.jobgen_jwt_token;
      if (!jobgen_session_token) {
        console.log("🔑 No JWT token found, requesting new one...");
        if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({ action: 'GET_JWT' });
        }
        callback(null);
        return;
      }

      try {
        const payload = JSON.parse(atob(jobgen_session_token.split('.')[1]));
        console.log("🔍 JWT payload:", payload);

        const expiryTime = payload.exp * 1000; // Convert to milliseconds
        const currentTime = Date.now();

        console.log("⏰ JWT exp time:", expiryTime);
        console.log("⏰ Current time:", currentTime);

        if (currentTime >= expiryTime) {
          console.log("🔄 JWT expired. Requesting new token...");
          if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage({ action: 'GET_JWT' });
          }
          callback(null);
        } else {
          console.log("✅ JWT still valid.");
          callback(jobgen_session_token);
        }

      } catch (error) {
        console.error("❌ Failed to parse JWT token:", error);
        if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({ action: 'GET_JWT' });
        }
        callback(null);
      }
    });
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
    { rule: /\b(?:work\s*rights|work\s*authori[sz]ation|work\s*permit|work\s*eligibility|right\s*to\s*work|legal\s*work\s*status|legally\s*authorized)\b/i, get: a => a.work_preferences?.legally_authorise_to_work ?? null },
    { rule: /^(?:primary\s*contact\s*number|mobile\s*phone\s*number|phone\s*number|mobile\s*number|contact\s*number|telephone\s*number|telephone|contact|phone|mobile|number)\b/i, get: a => a.personal_info?.phone ?? null },
    { rule: /^(?:Phone\s*country\s*code|Country\s*code|Dial(?:ing)?\s*code|International\s*code|Intl\s*code|Area\s*code)\b/i, get: a => a.personal_info?.phone_country_code ?? null },
    { rule: /\b(?:working\s*model|work\s*model|preferred\s*working\s*model|preferred\s*work\s*model|work\s*arrangement|working\s*arrangement)\b/i, get: a => a.work_preferences?.preferred_working_model ?? null },
    { rule: /\b(?:working\s*type|work\s*type|employment\s*type|job\s*type|engagement\s*type|contract\s*type|preferred\s*work\s*type)\b/i, get: a => a.work_preferences?.preferred_working_type ?? null },
    { rule: /\b(?:residency\s*status|residing\s*in\s*country|country\s*of\s*residence|living\s*in\s*country|current\s*country)\b/i, get: a => a.work_preferences?.residing_in_country ?? null },
    { rule: /\b(?:salary\s*currency\s*code|currency\s*code|salary\s*currency|currency)\b/i, get: a => a.work_preferences?.salary_currency_code ?? null },
    { rule: /\b(?:salary\s*expectation|expected\s*salary|desired\s*salary|salary\s*desired|pay\s*expectation|expected\s*pay|annual\s*package|compensation\s*expectation|target\s*remuneration|remuneration\s*expectation|salary\s*range)\b/i, get: a => a.work_preferences?.salary_expectation ?? null },
    { rule: /\b(?:salutation|honorific|title|greeting|prefix)\b/i, get: a => a.personal_info?.salutation ?? null },
    { rule: /\b(?:search\s*city|preferred\s*city|desired\s*city|target\s*city|city\s*of\s*search)\b/i, get: a => a.work_preferences?.search_location?.city ?? null },
    { rule: /\b(?:search\s*country|preferred\s*country|desired\s*country|target\s*country|country\s*preference|country\s*of\s*search)\b/i, get: a => a.work_preferences?.search_location?.country ?? null },
    { rule: /\b(?:availability|available\s*to\s*start|available\s*date|start\s*date|earliest\s*start|when\s*can\s*you\s*start)\b/i, get: a => a.work_preferences?.when_available_to_start ?? null },
    { rule: /\b(?:travel|willing\s*to\s*travel|travel\s*availability|ability\s*to\s*travel|travelling\s*required)\b/i, get: a => a.work_preferences?.willing_to_travel != null ? String(a.work_preferences?.willing_to_travel) : null },
    { rule: /\b(?:visa|visa\s*status|work\s*visa|work\s*authori[sz]ation|work\s*permit|immigration\s*status|work\s*status)\b/i, get: a => a.work_preferences?.work_authorisation_status ?? null },
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

  async function callLLM(prompt) {
    console.log("🧠 Calling LLM API with prompt:", prompt);
  
    return new Promise((resolve) => {
      getValidJWT(async (jwtToken) => {
        if (!jwtToken) {
          console.error("❌ No valid JWT token available for LLM call");
          resolve(null);
          return;
        }

        try {
          const res = await fetch("https://candidates.jobgen.ai/api/1.1/wf/job_apply_question", {
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
            resolve(null);
            return;
          }

          const data = await res.json();
          console.log("🌐 LLM API Response:", data);

          // Check for API-level failures first
          if (data.outcome === "Fail") {
            console.error("❌ LLM API returned failure:", data.error);
            if (data.error === "TOKEN_EXPIRED") {
              console.log("🔄 Token expired, requesting new one...");
              if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
                chrome.runtime.sendMessage({ action: 'GET_JWT' });
              }
            }
            resolve(null);
            return;
          }

          // Handle successful response
          if (data.answer) {
            // Direct answer format (newer API response)
            const answerText = data.answer.trim();
            console.log("✅ LLM direct answer:", answerText);
            resolve(answerText || null);
            return;
          }

          // Handle response.answer format (current API response)
          if (data.response && data.response.answer) {
            try {
              const parsed = JSON.parse(data.response.answer);
              const answerText = parsed?.answer?.trim();
              console.log("✅ LLM response.answer:", answerText);
              resolve(answerText || null);
              return;
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
              resolve(answerText || null);
              return;
            } catch (parseError) {
              console.error("❌ Failed to parse response.outcome as JSON:", raw);
              console.error("Parse error:", parseError);
            }
          }

          // If we get here, no valid answer was found
          console.warn("⚠️ No valid answer found in response:", data);
          resolve(null);

        } catch (err) {
          console.error("❌ LLM fetch/parse error:", err);
          resolve(null);
        }
      });
    });
  }

  // Unified function to fetch user data from the new API
  async function fetchUserData() {
    return new Promise((resolve) => {
      getValidJWT(async (jwtToken) => {
        if (!jwtToken) {
          console.error("❌ No valid JWT token for unified API call");
          resolve(null);
          return;
        }

        try {
          const res = await fetch("https://candidates.jobgen.ai/api/1.1/wf/jobgenai_faq", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${jwtToken}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({})
          });

          if (!res.ok) {
            console.error("❌ Unified API HTTP Error:", res.status, res.statusText);
            resolve(null);
            return;
          }

          const data = await res.json();
          
          // check for API errors
          if (data.error) {
            console.error("❌ Unified API returned error:", data.error);
            if (data.error === "TOKEN_INVALID") {
              console.log("🔄 Token invalid, requesting new one...");
              if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
                chrome.runtime.sendMessage({ action: 'GET_JWT' });
              }
            }
            resolve(null);
            return;
          }

          if (data.status === "success" && data.response) {
            console.log("✅ User data fetched from unified API");
            resolve(data.response);
          } else {
            console.error("❌ Unexpected response format from unified API");
            resolve(null);
          }
        } catch (err) {
          console.error("❌ Error during unified API fetch:", err);
          resolve(null);
        }
      });
    });
  }

  async function mapStructuredQuestion(jsonInput) {
    const { question, question_type, options } = jsonInput;
    if (!question || !question_type) return null;

    // Check if question is optional
    const isOptional = question.toLowerCase().includes('(optional)');
    if (isOptional) {
      console.log("🔍 Optional question detected:", question);
    }

    // Get user data from unified API
    let userData = null;
    try {
      userData = await fetchUserData();
    } catch (error) {
      console.warn("⚠️ Unexpected error during unified API call:", error);
    }

    if (!userData || Object.keys(userData).length === 0) {
      console.warn("⚠️ No userData found from unified API");
    } else {
      console.log("✅ User data loaded from unified API");
      console.log("📋 User Data Snapshot:");
      console.log(userData);
    }

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
        
        // use the improved buildLLMPrompt function to generate detailed instructions for input type
        const detailedPrompt = buildLLMPrompt({ ...jsonInput, userData });
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

    // Case: Choice types
    if (question_type === "single choice" || question_type === "multiple choice") {
      const choiceKeys = Object.entries(options || {});
      const cleanAnswer = typeof expectedAnswer === "string"
        ? expectedAnswer.trim().toLowerCase()
        : String(expectedAnswer).trim().toLowerCase();
    
      if (typeof expectedAnswer !== "string") {
        console.warn("⚠️ expectedAnswer is not string, auto-cast:", expectedAnswer, "→", cleanAnswer);
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
    
      // fallback to LLM
      const llmPrompt = buildLLMPrompt({ ...jsonInput, userData });
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
    
      const llmMatchedKeys = choiceKeys.filter(([_k, v]) =>
        v.trim().toLowerCase() === llmAnswer.trim().toLowerCase()
      ).map(([k]) => k);
    
      return {
        question,
        answer: question_type === "single choice"
          ? llmMatchedKeys[0] || llmAnswer
          : (llmMatchedKeys.length ? llmMatchedKeys : llmAnswer),
        via: "llm",
        match: llmMatchedKeys.length > 0
      };
    }

    console.warn("❓ Unknown question type:", question_type);
    return null;
  }

  // Initialize JWT validation on load
  function initializeJWT() {
    // Check if we're in an extension context
    if (!chrome || !chrome.storage) {
      console.log("🔑 Not in extension context, skipping JWT initialization");
      return;
    }
    
    getValidJWT((token) => {
      if (token) {
        console.log("🔑 JWT initialized successfully");
      } else {
        console.log("🔑 JWT initialization failed, will retry when needed");
      }
    });
  }

  // Call initialization with a small delay to ensure Chrome APIs are available
  if (typeof chrome !== 'undefined') {
    setTimeout(initializeJWT, 100);
  }

  global.structuredMapper = { 
    map: mapStructuredQuestion,
    getValidJWT: getValidJWT,
    initializeJWT: initializeJWT,
    mappingRules: mappingRules,
    fetchUserData: fetchUserData
  };
})(window);

export default window.structuredMapper;
