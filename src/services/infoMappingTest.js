// infoMappingTest.js - Comprehensive test functionality for info mapping
const { mapStructuredQuestion, normalizeText, mappingRules } = await import('./infoMapping.js');

// Comprehensive test questions matching original coverage
const testQuestions = [
  // Input type questions
  {
    question: "first name",
    question_type: "input",
    description: "First name input test"
  },
  {
    question: "last name", 
    question_type: "input",
    description: "Last name input test"
  },
  {
    question: "What is your expected salary?",
    question_type: "input",
    description: "Expected salary input test"
  },
  {
    question: "phone number?",
    question_type: "input", 
    description: "Phone number input test"
  },
  {
    question: "phone contactnumber?",
    question_type: "input",
    description: "Phone number input test"
  },
  {
    question: "phone country number?",
    question_type: "input",
    description: "Phone number input test"
  },
  {
    question: "email address",
    question_type: "input",
    description: "Email address input test"
  },
  {
    question: "email",
    question_type: "input",
    description: "Email address input test"
  },
  {
    question: "address",
    question_type: "input",
    description: "Address input test"
  },
  {
    question: "what's your working experience?",
    question_type: "input",
    description: "Working experience input test"
  },
  {
    question: "what's your education history?",
    question_type: "input",
    description: "Education history input test"
  },
  
  // Single choice type questions
  {
    question: "What is your citizenship status?",
    question_type: "single choice",
    options: {
      "1": "Australian Citizen",
      "2": "Permanent Resident",
      "3": "Work Visa",
      "4": "Student Visa",
      "5": "Other"
    },
    description: "Citizenship single choice test"
  },
  {
    question: "Are you willing to relocate?",
    question_type: "single choice",
    options: {
      "1": "Yes",
      "2": "No",
      "3": "Maybe"
    },
    description: "Willing to relocate single choice test"
  },
  
  // Multiple choice type questions
  {
    question: "Which working model do you prefer?",
    question_type: "multiple choice",
    options: {
      "1": "Remote",
      "2": "Hybrid",
      "3": "On-site",
      "4": "Flexible"
    },
    description: "Working model multiple choice test"
  },
  {
    question: "Which of the following statements best describes your right to work in Australia?",
    question_type: "multiple choice",
    options: {
      "1": "I'm an Australian citizen",
      "2": "I'm a permanent resident and/or NZ citizen",
      "3": "I have a family/partner visa with no restrictions",
      "4": "I have a graduate temporary work visa",
      "5": "I have a holiday temporary work visa",
      "6": "I have a temporary visa with restrictions on work location (e.g. skilled regional visa 491)",
      "7": "I have a temporary protection or safe haven enterprise work visa",
      "8": "I have a temporary visa with no restrictions (e.g. doctoral student)"
    },
    description: "Working rights multiple choice test"
  },
  {
    question: "How many years' experience do you have as an Email Marketing Specialist?",
    question_type: "multiple choice",
    options: {
      "1": "No experience",
      "2": "Less than 1 year",
      "3": "1 year",
      "4": "2 years",
      "5": "3 years",
      "6": "4 years",
      "7": "5 years",
      "8": "More than 5 years"
    },
    description: "Working experience multiple choice test"
  }
];

// Mock user data for testing
const mockUserData = {
  personal_info: {
    first_name: "John",
    last_name: "Doe",
    email: "john.doe@example.com",
    phone: "0412345678",
    user_address: {
      address: "123 Test Street, Test City, NSW",
      city: "Test City",
      state: "NSW",
      country: "Australia"
    }
  },
  work_preferences: {
    salary_expectation: "80000",
    can_you_relocate: "Yes",
    preferred_working_model: "Hybrid"
  }
};

// Comprehensive rule test cases matching original coverage
const ruleTestCases = [
  // Rule1 test cases (personal info and work preferences)
  { question: 'Are you willing to relocate?', expectedKey: 'can_you_relocate', type: 'rule1' },
  { question: 'What is your citizenship status?', expectedKey: 'citizenship', type: 'rule1' },
  { question: 'What is your current notice period?', expectedKey: 'current_notice_period', type: 'rule1' },
  { question: 'Date of birth', expectedKey: 'date_of_birth', type: 'rule1' },
  { question: 'Birthday', expectedKey: 'date_of_birth', type: 'rule1' },
  { question: 'Email address', expectedKey: 'email', type: 'rule1' },
  { question: 'title', expectedKey: 'salutation', type: 'rule1' },
  { question: 'Email', expectedKey: 'email', type: 'rule1' },
  { question: 'First name', expectedKey: 'first_name', type: 'rule1' },
  { question: 'Middle name', expectedKey: 'middle_name', type: 'rule1' },
  { question: 'Full name', expectedKey: 'full_name', type: 'rule1' },
  { question: 'Do you require sponsorship?', expectedKey: 'future_sponsorship_required', type: 'rule1' },
  { question: 'ID type', expectedKey: 'id_type', type: 'rule1' },
  { question: 'Industry sector', expectedKey: 'industry', type: 'rule1' },
  { question: 'Job title', expectedKey: 'job_title', type: 'rule1' },
  { question: 'Last name', expectedKey: 'last_name', type: 'rule1' },
  { question: 'Are you legally authorized to work?', expectedKey: 'legally_authorise_to_work', type: 'rule1' },
  { question: 'Phone number', expectedKey: 'phone', type: 'rule1' },
  { question: 'Phone country code', expectedKey: 'phone_country_code', type: 'rule1' },
  { question: 'Preferred working model', expectedKey: 'preferred_working_model', type: 'rule1' },
  { question: 'Employment type', expectedKey: 'preferred_working_type', type: 'rule1' },
  { question: 'Country of residence', expectedKey: 'residing_in_country', type: 'rule1' },
  { question: 'Salary currency code', expectedKey: 'salary_currency_code', type: 'rule1' },
  { question: 'Expected salary', expectedKey: 'salary_expectation', type: 'rule1' },
  { question: 'Salutation', expectedKey: 'salutation', type: 'rule1' },
  { question: 'Preferred city', expectedKey: 'search_city', type: 'rule1' },
  { question: 'Preferred country', expectedKey: 'search_country', type: 'rule1' },
  { question: 'When are you available to start?', expectedKey: 'when_available_to_start', type: 'rule1' },
  { question: 'Are you willing to travel?', expectedKey: 'willing_to_travel', type: 'rule1' },
  { question: 'Work visa status', expectedKey: 'work_authorisation_status', type: 'rule1' },
  { question: 'Postcode', expectedKey: 'user_post_code', type: 'rule1' },
  { question: 'State or province', expectedKey: 'user_state', type: 'rule1' },
  { question: 'State code', expectedKey: 'user_state_code', type: 'rule1' },
  { question: 'Street name', expectedKey: 'user_street_name', type: 'rule1' },
  { question: 'Street number', expectedKey: 'user_street_no', type: 'rule1' },
  { question: 'Full address', expectedKey: 'user_address', type: 'rule1' },
  
  // Rule2 test cases (additional mappings)
  { question: 'What industry do you work in?', expectedKey: 'industry', type: 'rule2' },
  { question: 'What position title are you looking for?', expectedKey: 'target_role', type: 'rule2' },
  { question: 'What city do you prefer?', expectedKey: 'city', type: 'rule2' },
  { question: 'Which country?', expectedKey: 'country', type: 'rule2' },
  { question: 'Country/region of residence', expectedKey: 'country', type: 'rule2' },
  { question: 'What is your expected salary?', expectedKey: 'expected_salary', type: 'rule2' },
  { question: 'Salary currency', expectedKey: 'expected_salary_currency', type: 'rule2' },
  { question: 'What role are you targeting?', expectedKey: 'target_role', type: 'rule2' }
];

// Test function to run all tests
export async function runInfoMappingTests() {
  console.log("🧪 Starting Info Mapping Tests...");
  
  try {
    const results = [];
    const ruleMatchResults = [];
    
    // Test each question
    console.log("\n" + "=".repeat(10));
    console.log("📝 TESTING QUESTION MAPPING");
    console.log("=".repeat(10));
    
    for (const testCase of testQuestions) {
      console.log(`\n🔍 Testing: ${testCase.description}`);
      console.log(`Question: "${testCase.question}"`);
      
      try {
        const result = await mapStructuredQuestion(testCase);
        
        if (result) {
          console.log(`✅ Result:`, result);
          results.push({
            question: testCase.question,
            type: testCase.question_type,
            success: true,
            result: result
          });
        } else {
          console.log(`❌ No result returned`);
          results.push({
            question: testCase.question,
            type: testCase.question_type,
            success: false,
            error: "No result returned"
          });
        }
      } catch (error) {
        console.error(`❌ Error testing "${testCase.question}":`, error);
        results.push({
          question: testCase.question,
          type: testCase.question_type,
          success: false,
          error: error.message
        });
      }
    }
    
    // Test rule matching
    console.log("\n" + "=".repeat(60));
    console.log("🔍 TESTING RULE MATCHING");
    console.log("=".repeat(60));
    
    for (const { question, expectedKey, type } of ruleTestCases) {
      const norm = normalizeText(question);
      const matchedRule = mappingRules.find(r => r.rule.test(norm));
      
      if (matchedRule) {
        const ruleString = matchedRule.rule.toString();
        ruleMatchResults.push({
          question,
          expectedKey,
          expectedType: type,
          actualType: type,
          matched: true,
          rule: ruleString,
          status: 'exact_match'
        });
        console.log(`✅ [${type}] "${question}" → ${expectedKey} - Rule: ${ruleString}`);
      } else {
        ruleMatchResults.push({
          question,
          expectedKey,
          expectedType: type,
          actualType: null,
          matched: false,
          rule: null,
          status: 'no_match'
        });
        console.log(`❌ [${type}] "${question}" → ${expectedKey} - No rule matched`);
      }
    }
    
    // Print comprehensive summary
    console.log("\n" + "=".repeat(80));
    console.log("📊 COMPREHENSIVE TEST SUMMARY");
    console.log("=".repeat(80));
    
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const rule1Results = ruleMatchResults.filter(r => r.expectedType === 'rule1');
    const rule2Results = ruleMatchResults.filter(r => r.expectedType === 'rule2');
    const exactMatches = ruleMatchResults.filter(r => r.status === 'exact_match');
    const noMatches = ruleMatchResults.filter(r => r.status === 'no_match');
    
    console.log(`📈 QUESTION MAPPING STATISTICS:`);
    console.log(`   Total questions: ${results.length}`);
    console.log(`   ✅ Successful: ${successful}`);
    console.log(`   ❌ Failed: ${failed}`);
    
    console.log(`\n🔍 RULE MATCHING STATISTICS:`);
    console.log(`   Total rule tests: ${ruleMatchResults.length}`);
    console.log(`   Rule1 tests: ${rule1Results.length}`);
    console.log(`   Rule2 tests: ${rule2Results.length}`);
    console.log(`   ✅ Exact matches: ${exactMatches.length}`);
    console.log(`   ❌ No matches: ${noMatches.length}`);
    
    if (failed > 0) {
      console.log("\n❌ Failed question tests:");
      results.filter(r => !r.success).forEach(r => {
        console.log(`  - "${r.question}": ${r.error}`);
      });
    }
    
    if (noMatches.length > 0) {
      console.log("\n❌ Failed rule matches:");
      noMatches.forEach((result, index) => {
        console.log(`  ${index + 1}. "${result.question}" → ${result.expectedKey} (${result.expectedType})`);
      });
    }
    
    console.log("=".repeat(80));
    
    return {
      total: results.length,
      successful,
      failed,
      ruleTests: ruleMatchResults.length,
      ruleMatches: exactMatches.length,
      ruleFailures: noMatches.length,
      results,
      ruleResults: ruleMatchResults
    };
    
  } catch (error) {
    console.error("❌ Test execution failed:", error);
    return {
      total: 0,
      successful: 0,
      failed: 1,
      error: error.message
    };
  }
}

// Function to test with mock data (for development)
export function testWithMockData() {
  console.log("🧪 Testing with mock data...");
  
  // Store mock data in chrome storage for testing
  if (chrome && chrome.storage && chrome.storage.local) {
    chrome.storage.local.set({
      user_faq_data: mockUserData,
      user_faq_timestamp: Date.now()
    }, () => {
      console.log("✅ Mock data stored for testing");
    });
  }
  
  return mockUserData;
}
