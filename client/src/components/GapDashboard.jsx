import { useState, useEffect } from 'react';
import { fetchDashboard } from '../api';

function CoverageRing({ percentage }) {
  const color = percentage >= 70 ? '#16a34a' : percentage >= 40 ? '#ca8a04' : '#dc2626';
  const bg = `conic-gradient(${color} 0% ${percentage}%, #e2e8f0 ${percentage}% 100%)`;

  return (
    <div className="coverage-ring" style={{ background: bg }}>
      <div className="coverage-ring-inner">
        <div className="coverage-ring-text">
          <span className="coverage-ring-value">{percentage}%</span>
          <span className="coverage-ring-label">match</span>
        </div>
      </div>
    </div>
  );
}

function SkillBar({ skill, frequency, variant }) {
  return (
    <div className="dash-skill-row">
      <span className="dash-skill-name">{skill}</span>
      <div className="dash-skill-track">
        <div
          className={`dash-skill-fill ${variant === 'matched' ? 'dash-skill-matched' : 'dash-skill-missing'}`}
          style={{ width: `${frequency}%` }}
        />
      </div>
      <span className="dash-skill-pct">{frequency}%</span>
    </div>
  );
}

export default function GapDashboard({ profile }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    setResult(null);

    fetchDashboard(profile.skills, profile.targetRole)
      .then((data) => setResult(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [profile.skills, profile.targetRole]);

  if (loading) {
    return (
      <div className="card loading-card">
        <div className="spinner" />
        <p>Analyzing your fit for {profile.targetRole} across 100+ postings...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <div className="error-banner">{error}</div>
      </div>
    );
  }

  if (!result) return null;

  const { targetRole, totalJobsAnalyzed, missingSkills, matchedSkills, coveragePercentage, summary, roadmap, isFallback, gradingStatus } = result;
  const verdict = coveragePercentage >= 70 ? 'strong' : coveragePercentage >= 40 ? 'moderate' : 'early';

  const status = gradingStatus || (isFallback ? 'fallback' : 'llm');
  const statusDotColor =
    status === 'manual'
      ? '#2563eb'
      : status === 'llm'
        ? '#f4c430'
        : '#dc2626';
  const statusDotTitle =
    status === 'manual'
      ? 'Manual review'
      : status === 'llm'
        ? 'LLM grading applied'
        : 'Transformer only (no LLM)';

  return (
    <div className="dashboard">
      {/* Hero */}
      <div className="card feedback-hero">
        <div className="hero-content">
          <div className="hero-text">
            <div className="hero-title-row">
              <h2>Your {targetRole} Readiness</h2>
              <span
                className="status-dot"
                style={{ background: statusDotColor }}
                title={statusDotTitle}
                aria-label={statusDotTitle}
              />
            </div>
            <p className="hero-subtitle">
              Based on <strong>{totalJobsAnalyzed} real job postings</strong> for this role
            </p>
            <div className={`verdict-badge verdict-${verdict}`}>
              {verdict === 'strong' && 'Strong Candidate'}
              {verdict === 'moderate' && 'Getting There'}
              {verdict === 'early' && 'Early Stage'}
            </div>
          </div>
          <CoverageRing percentage={coveragePercentage} />
        </div>

        <div className="dash-stats">
          <div className="dash-stat">
            <span className="dash-stat-value">{totalJobsAnalyzed}</span>
            <span className="dash-stat-label">Jobs Analyzed</span>
          </div>
          <div className="dash-stat">
            <span className="dash-stat-value">{matchedSkills.length}</span>
            <span className="dash-stat-label">Skills Matched</span>
          </div>
          <div className="dash-stat">
            <span className="dash-stat-value">{missingSkills.length}</span>
            <span className="dash-stat-label">Gaps Found</span>
          </div>
          <div className="dash-stat">
            <span className="dash-stat-value">
              {roadmap.reduce((sum, r) => sum + (r.estimatedWeeks || 0), 0)}w
            </span>
            <span className="dash-stat-label">Est. to Close</span>
          </div>
        </div>
      </div>

      {isFallback && (
        <div className="fallback-banner">
          AI insights unavailable — showing analysis from aggregated job posting data.
        </div>
      )}

      {/* AI Summary */}
      <div className="card feedback-summary">
        <h3>Assessment Summary</h3>
        <p className="summary-text">{summary}</p>
      </div>

      {/* Strengths */}
      {matchedSkills.length > 0 && (
        <div className="card">
          <h3>Your Strengths</h3>
          <p className="subtitle">
            Skills you have that employers are looking for in {targetRole} roles
          </p>
          <div className="dash-skill-bars">
            {matchedSkills.map((s) => (
              <SkillBar key={s.skill} skill={s.skill} frequency={s.frequency} variant="matched" />
            ))}
          </div>
        </div>
      )}

      {/* Gaps */}
      {missingSkills.length > 0 && (
        <div className="card">
          <h3>Skill Gaps</h3>
          <p className="subtitle">
            Skills you're missing and how often they appear across {targetRole} postings
          </p>
          <div className="dash-skill-bars">
            {missingSkills.slice(0, 12).map((s) => (
              <SkillBar key={s.skill} skill={s.skill} frequency={s.frequency} variant="missing" />
            ))}
          </div>
        </div>
      )}

      {/* Action Steps */}
      {missingSkills.length === 0 ? (
        <div className="card success-card">
          <div className="success-icon">&#10003;</div>
          <h3>You're Fully Qualified</h3>
          <p>Your skills cover every skill demanded across all {totalJobsAnalyzed} postings. Apply with confidence.</p>
        </div>
      ) : (
        roadmap && roadmap.length > 0 && (
          <div className="card">
            <h3>Action Steps</h3>
            <p className="subtitle">
              A prioritized plan to close your gaps, ordered by market impact
            </p>
            <div className="action-steps">
              {roadmap.map((item, idx) => (
                <div key={item.skill} className="action-step">
                  <div className="action-step-num">{idx + 1}</div>
                  <div className="action-step-body">
                    <div className="action-step-header">
                      <span className="action-step-skill">{item.skill}</span>
                      <span className={`priority-badge priority-${item.priority.toLowerCase()}`}>
                        {item.priority}
                      </span>
                      <span className="action-step-meta">
                        {item.frequency}% demand &middot; ~{item.estimatedWeeks} weeks
                      </span>
                    </div>
                    {item.reason && <p className="action-step-reason">{item.reason}</p>}
                    <div className="action-step-bar">
                      <div
                        className="action-step-bar-fill"
                        style={{ width: `${item.frequency}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      )}
    </div>
  );
}
