import React, { useState, useEffect } from 'react';
import { getJobProgress } from '../services/apiService';
import LoadingState from './LoadingState';
import ErrorState from './ErrorState';

const RecentTab = () => {
  const [progressData, setProgressData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recentError, setRecentError] = useState(null);
  const [_loadingTimeout, setLoadingTimeout] = useState(false);
  const [noActivity, setNoActivity] = useState(false);

  useEffect(() => {
    fetchJobProgress();
  }, []);

  // Timeout effect for loading state
  useEffect(() => {
    let timeoutId;
    
    if (loading && !recentError) {
      // Reset timeout state and start new timeout
      setLoadingTimeout(false);
      
      // Set 10-second timeout
      timeoutId = setTimeout(() => {
        console.log("⏰ RecentTab loading timeout reached, showing error state");
        setLoadingTimeout(true);
        setLoading(false);
        setRecentError('Loading timeout - please try refreshing');
      }, 10000); // 10 seconds
    } else {
      // Clear timeout if loading completes or error occurs
      setLoadingTimeout(false);
    }
    
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [loading, recentError]);

  const fetchJobProgress = async () => {
    setLoading(true);
    setRecentError(null);
    setLoadingTimeout(false);
    setNoActivity(false);
    
    try {
      const result = await getJobProgress();
      console.log('📊 Raw API result:', result);
      
      if (result.success) {
        console.log('📊 Job progress data:', result.data);
        console.log('📊 Data type:', typeof result.data);
        console.log('📊 Is array:', Array.isArray(result.data));
        console.log('📊 Data length:', result.data?.length);
        
        setProgressData(result.data || []);
        if (result.meta?.noActivity) {
          setNoActivity(true);
        }
        
        if (result.data && result.data.length > 0) {
          console.log('📊 Sample job:', result.data[0]);
        }
      } else {
        console.error('❌ API returned error:', result);
        setRecentError(result.details || 'We could not load your recent applications. Please try again.');
      }
    } catch (err) {
      console.error('❌ Error in fetchJobProgress:', err);
      setRecentError('Network error occurred');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'applied':
        return '#28a745'; // Green
      case 'applying':
        return '#007bff'; // Blue
      case 'saved':
        return '#6c757d'; // Gray
      default:
        return '#6c757d';
    }
  };

  const getStatusIcon = (status) => {
    switch (status?.toLowerCase()) {
      case 'applied':
        return '✅';
      case 'applying':
        return '⏳';
      case 'saved':
        return '💾';
      default:
        return '📄';
    }
  };

  const getPlatformIcon = (portal) => {
    const portalLower = portal?.toLowerCase() || '';
    if (portalLower.includes('seek')) return 'ⓘ';
    if (portalLower.includes('linkedin')) return 'ⓘ';
    if (portalLower.includes('indeed')) return 'ⓘ';
    if (portalLower.includes('microsoft')) return 'ⓘ';
    return '🌐';
  };

  const handleJobClick = (job) => {
    if (job.link) {
      window.open(job.link, '_blank');
    }
  };

  const handleRefresh = () => {
    fetchJobProgress();
  };

  if (loading) {
    return (
      <div style={{ padding: '18px' }}>
        <LoadingState
          title="Loading your job history"
          message="We are pulling in your recent applications and tracking their latest statuses."
          tip="Statuses update automatically once we hear back from each job board."
        />
      </div>
    );
  }

  if (recentError) {
    return (
      <div style={{ padding: '18px' }}>
        <ErrorState
          title="Recent Jobs Loading Failed"
          message={recentError}
          actionText="Retry"
          onAction={handleRefresh}
        />
      </div>
    );
  }

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Header - Fixed */}
      <div style={{
        padding: '15px 15px 10px 15px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid #e0e0e0',
        flexShrink: 0,
        backgroundColor: '#fff'
      }}>
        <h3 style={{
          margin: 0,
          fontSize: '16px',
          color: '#333',
          fontWeight: '600'
        }}>
          Recent Applications
        </h3>
        <button
          onClick={handleRefresh}
          style={{
            padding: '6px 12px',
            backgroundColor: '#f8f9fa',
            border: '1px solid #dee2e6',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
            color: '#6c757d',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}
        >
          🔄 Refresh
        </button>
      </div>

      {/* Job List - Scrollable Content */}
      <div style={{ 
        flex: 1, 
        overflowY: 'auto',
        padding: '15px'
      }}>
        {progressData.length === 0 ? (
          <div style={{
            textAlign: 'center',
            color: '#666',
            padding: '30px 20px',
            fontSize: '14px'
          }}>
            <div style={{ fontSize: '24px', marginBottom: '10px' }}>📭</div>
            <div>{noActivity ? "No recent activity yet. Once you save or apply for a job, your history will appear here." : "No job applications found"}</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {progressData.map((job, index) => {
            // Debug individual job data
            if (index === 0) {
              console.log('📊 Rendering first job:', job);
              console.log('📊 Job keys:', Object.keys(job));
            }
            return (
            <div
              key={job.job_id || index}
              onClick={() => handleJobClick(job)}
              style={{
                padding: '12px',
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
                cursor: job.link ? 'pointer' : 'default',
                backgroundColor: '#fff',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                if (job.link) {
                  e.target.style.borderColor = '#007bff';
                  e.target.style.boxShadow = '0 2px 4px rgba(0,123,255,0.1)';
                }
              }}
              onMouseLeave={(e) => {
                if (job.link) {
                  e.target.style.borderColor = '#e0e0e0';
                  e.target.style.boxShadow = 'none';
                }
              }}
            >
              {/* Job Header */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: '8px'
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h4 style={{
                    margin: 0,
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#1a1a1a',
                    lineHeight: '1.4',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    marginBottom: '4px'
                  }}>
                    {job.job_title || 'Untitled Job'}
                  </h4>
                  <div style={{
                    fontSize: '12px',
                    color: '#666',
                    marginTop: '2px'
                  }}>
                    {job.job_company || 'Unknown Company'}
                  </div>
                </div>
                
                {/* Status Badge */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 8px',
                  backgroundColor: getStatusColor(job.status) + '15',
                  color: getStatusColor(job.status),
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: '500',
                  marginLeft: '8px',
                  flexShrink: 0
                }}>
                  <span>{getStatusIcon(job.status)}</span>
                  {job.status || 'Unknown'}
                </div>
              </div>

              {/* Job Details */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '11px',
                color: '#888'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>{getPlatformIcon(job.job_portal)} {job.job_portal || 'Unknown Portal'}</span>
                  <span>•</span>
                  <span>🕒 {job.job_created_date || 'Unknown Date'}</span>
                </div>
                
                {job.link && (
                  <div style={{
                    fontSize: '10px',
                    color: '#007bff',
                    fontWeight: '500'
                  }}>
                    View →
                  </div>
                )}
              </div>
            </div>
          );
          })}
          </div>
        )}
      </div>

      {/* Footer - Fixed at bottom of tab */}
      <div style={{
        padding: '10px 15px',
        borderTop: '1px solid #e0e0e0',
        textAlign: 'center',
        fontSize: '11px',
        color: '#888',
        flexShrink: 0,
        backgroundColor: '#fff'
      }}>
        {progressData.length > 0 ? (
          `Showing ${progressData.length} job${progressData.length !== 1 ? 's' : ''}`
        ) : (
          'No applications to display'
        )}
      </div>
    </div>
  );
};

export default RecentTab;
