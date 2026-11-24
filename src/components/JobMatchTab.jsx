import React, { useState, useEffect } from 'react';
import RingGraph from './RingGraph';
import LoadingState from './LoadingState';

const JobMatchTab = ({ jobData, currentSite: _currentSite }) => {
  const [formData, setFormData] = useState({
    jobTitle: '',
    companyName: '',
    jobUrl: '',
    location: '',
    description: ''
  });
  const [showForm, setShowForm] = useState(false);
  const [score, setScore] = useState(0);
  const [salary, setSalary] = useState('');
  const [alignment, setAlignment] = useState('Analysing your alignment...');
  const [keywords, setKeywords] = useState(['Analysing summary...']);
  const [hardSkills, setHardSkills] = useState(['Analysing skills...']);
  const [softSkills, setSoftSkills] = useState(['Analysing skills...']);
  const [jobSummary, setJobSummary] = useState(['Analysing summary...']);
  const [loadingTimeout, setLoadingTimeout] = useState(false);

  // Timeout effect for loading state
  useEffect(() => {
    let timeoutId;
    
    if (jobData === null) {
      // Reset timeout state and start new timeout
      setLoadingTimeout(false);
      
      // Set 10-second timeout
      timeoutId = setTimeout(() => {
        console.log("⏰ JobMatch loading timeout reached, showing default fields");
        setLoadingTimeout(true);
        // Set default values
        setScore(0);
        setSalary('');
        setAlignment('Unable to analyze alignment at this time');
        setKeywords(['Please try refreshing or check your connection']);
        setHardSkills(['Skills analysis unavailable']);
        setSoftSkills(['Technical skills analysis unavailable']);
        setJobSummary(['Job summary unavailable']);
      }, 20000); // 20 seconds
    } else {
      // Clear timeout if data arrives
      setLoadingTimeout(false);
    }
    
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [jobData]);

  useEffect(() => {
    if (jobData === null) {
      // Reset to loading state when jobData is null (new job selected, trying to obtain response from Match API)
      console.log("Job Match Tab Resetting to loading state");
      setScore(0);
      setSalary('');
      setAlignment('Loading YOUR alignment...');
      setKeywords(['Loading summary...']);
      setHardSkills(['Loading skills...']);
      setSoftSkills(['Loading skills...']);
      setJobSummary(['Loading summary...']);
      return;
    }
    
    if (jobData) {
      console.log("JobMatchTab received jobData:", jobData);
      
      // Parse the job_data field if it's a string (matching original extension logic)
      let parsedData = jobData;
      if (typeof jobData.job_data === "string") {
        try {
          parsedData = { ...jobData, job_data: JSON.parse(jobData.job_data) };
          console.log("Parsed job_data:", parsedData);
        } catch (error) {
          console.error("Error parsing job_data JSON:", error);
        }
      }
      
      const data = parsedData.job_data || parsedData;
      // console.log("Using data:", data);
      
      if (data.Salary && data.Salary !== "Not provided") {
        setSalary(data.Salary);
        // console.log("Set salary:", data.Salary);
      }
      
      if (data.alignment_with_user_profile) {
        setAlignment(data.alignment_with_user_profile);
        // console.log("Set alignment:", data.alignment_with_user_profile);
      }
      
      if (data.job_match_score) {
        const numericScore = parseInt(data.job_match_score.replace('%', ''));
        setScore(numericScore);
        // console.log("Set score:", numericScore);
      }
      
      if (data.skills) {
        setHardSkills(data.skills);
        // console.log("Set hard skills:", data.skills);
      }
      
      if (data.technical_skills) {
        setSoftSkills(data.technical_skills);
        // console.log("Set technical skills:", data.technical_skills);
      }
      
      if (data.top_responsibilities) {
        setJobSummary(data.top_responsibilities);
        // console.log("Set job summary:", data.top_responsibilities);
      }
      
      if (data.keywords) {
        setKeywords(data.keywords);
        // console.log("Set keywords:", data.keywords);
      }
    }
  }, [jobData]);

  // Check if we need to show the form based on URL
  useEffect(() => {
    const currentURL = window.location.href.toLowerCase();
    if (currentURL.includes("linkedin") && !currentURL.includes("/in/") && !currentURL.includes("job")) {
      setShowForm(true);
    }
  }, []);

  const handleFormChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Render helper: make occurrences of (✓) green
  const renderWithGreenCheck = (text) => {
    const str = String(text ?? '');
    const parts = str.split('(✓)');
    if (parts.length === 1) return str;
    const nodes = [];
    parts.forEach((part, idx) => {
      if (part) nodes.push(part);
      if (idx < parts.length - 1) {
        nodes.push(
          <span key={`check-${idx}`} style={{ color: '#22c55e', fontWeight: 600 }}>
            ✓
          </span>
        );
      }
    });
    return nodes;
  };

  const isLoading = (jobData === null || typeof jobData === 'undefined') && !loadingTimeout;
  const hasSoftSkills = Array.isArray(softSkills) && softSkills.some(skill => String(skill ?? '').trim().length > 0);

  if (showForm) {
    return (
      <div id="highLevelContent" style={{ padding: '10px' }}>
        <div id="jobDetailsForm" style={{ display: 'block', marginTop: '10px', padding: '10px' }}>
          <label htmlFor="jobTitleInput" style={{ color: 'black' }}>Job Title:</label>
          <input
            type="text"
            id="jobTitleInput"
            value={formData.jobTitle}
            onChange={(e) => handleFormChange('jobTitle', e.target.value)}
            style={{
              width: '100%',
              padding: '12px',
              marginTop: '5px',
              border: '1px solid #ddd',
              borderRadius: '5px'
            }}
          />

          <label htmlFor="companyNameInput" style={{ color: 'black', marginTop: '10px', display: 'block' }}>Company Name:</label>
          <input
            type="text"
            id="companyNameInput"
            value={formData.companyName}
            onChange={(e) => handleFormChange('companyName', e.target.value)}
            style={{
              width: '100%',
              padding: '12px',
              marginTop: '5px',
              border: '1px solid #ddd',
              borderRadius: '5px'
            }}
          />

          <label htmlFor="jobUrlInput" style={{ color: 'black', marginTop: '10px', display: 'block' }}>Job URL:</label>
          <input
            type="url"
            id="jobUrlInput"
            placeholder="https://example.com/job-posting"
            value={formData.jobUrl}
            onChange={(e) => handleFormChange('jobUrl', e.target.value)}
            style={{
              width: '100%',
              padding: '12px',
              marginTop: '5px',
              border: '1px solid #ddd',
              borderRadius: '5px'
            }}
          />

          <label htmlFor="locationInput" style={{ color: 'black', marginTop: '10px', display: 'block' }}>Location:</label>
          <input
            type="text"
            id="locationInput"
            value={formData.location}
            onChange={(e) => handleFormChange('location', e.target.value)}
            style={{
              width: '100%',
              padding: '12px',
              marginTop: '5px',
              border: '1px solid #ddd',
              borderRadius: '5px'
            }}
          />

          <label htmlFor="descriptionInput" style={{ color: 'black', marginTop: '10px', display: 'block' }}>Description:</label>
          <textarea
            id="descriptionInput"
            required
            value={formData.description}
            onChange={(e) => handleFormChange('description', e.target.value)}
            style={{
              width: '100%',
              height: '270px',
              padding: '12px',
              marginTop: '5px',
              border: '1px solid #ddd',
              borderRadius: '5px',
              resize: 'vertical'
            }}
          />
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div id="highLevelContent" style={{ padding: '18px' }}>
        <LoadingState
          title="Analysing your match insights"
          message="We are mapping the job description to your profile to surface the most relevant skills, keywords, and responsibilities."
          // tip="You can browse other tabs while we prepare your tailored breakdown."
        />
      </div>
    );
  }

  return (
    <div id="highLevelContent" style={{ padding: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
        <div style={{ flex: 1 }}>
          <h4 style={{ color: 'black', fontWeight: 'bold' }}>Your Match:</h4>
          <ul id="alignment" className="jobgen-bullet-list" style={{ color: 'black', paddingLeft: 0 }}>
            <li>{alignment}</li>
          </ul>
        </div>
        <RingGraph percentage={score} />
      </div>

      <hr style={{ border: '1px solid #ddd', margin: '20px 0' }} />

      <h4 style={{ color: 'black', fontWeight: 'bold' }}>Keywords:</h4>
      <ul id="keywords" className="jobgen-bullet-list" style={{ color: 'black', paddingLeft: '20px' }}>
        {keywords.map((keyword, index) => (
          <li key={index}>{renderWithGreenCheck(keyword)}</li>
        ))}
      </ul>

      <hr style={{ border: '1px solid #ddd', margin: '20px 0' }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
        <div style={{ flex: 1, paddingRight: '20px' }}>
          <h4 style={{ color: 'black', fontWeight: 'bold' }}>Skills:</h4>
          <ul id="hardSkills" className="jobgen-bullet-list" style={{ color: 'black', paddingLeft: '20px' }}>
            {hardSkills.map((skill, index) => (
              <li key={index}>{renderWithGreenCheck(skill)}</li>
            ))}
          </ul>
        </div>

        {hasSoftSkills && (
          <div style={{ flex: 1, paddingLeft: '20px' }}>
            <h4 style={{ color: 'black', fontWeight: 'bold' }}>Technical Skills:</h4>
            <ul id="softSkills" className="jobgen-bullet-list" style={{ color: 'black', paddingLeft: '20px' }}>
              {softSkills.map((skill, index) => (
                <li key={index}>{renderWithGreenCheck(skill)}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <hr style={{ border: '1px solid #ddd', margin: '20px 0' }} />

      <h4 style={{ color: 'black', fontWeight: 'bold' }}>Key Responsibilities:</h4>
      <ul id="jobSummary" className="jobgen-bullet-list" style={{ color: 'black', paddingLeft: '20px' }}>
        {jobSummary.map((responsibility, index) => (
          <li key={index}>{responsibility}</li>
        ))}
      </ul>

      {salary && (
        <p id="salary" style={{ color: 'black', margin: 0 }}>{salary}</p>
      )}
    </div>
  );
};

export default JobMatchTab;
