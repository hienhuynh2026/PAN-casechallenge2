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
        <p>Analyzing your fit for {profile.targetRole} across job postings...</p>
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

  const { targetRole, totalJobsAnalyzed, missingSkills, matchedSkills, coveragePercentage, summary, roadmap, isFallback, gateAnalysis } = result;
  const verdict = coveragePercentage >= 70 ? 'strong' : coveragePercentage >= 40 ? 'moderate' : 'early';
  const hasGateSignal = gateAnalysis && gateAnalysis.available && typeof gateAnalysis.goForLLM === 'boolean';
  const passedGate = hasGateSignal ? gateAnalysis.goForLLM : false;
  const gateStatusText = hasGateSignal
    ? `${gateAnalysis.status} (${gateAnalysis.alignmentScore}/100)`
    : 'unknown';
  const gateBadge = passedGate
    ? {
      label: isFallback ? 'Passed Threshold' : 'Passed Threshold (LLM Reviewed)',
      color: '#166534',
      bg: '#dcfce7',
      border: '#86efac',
      title: isFallback
        ? `Passed deterministic score gate: ${gateStatusText}. LLM insights unavailable in this request.`
        : `Passed deterministic score gate: ${gateStatusText}`,
    }
    : {
      label: 'Below Threshold',
      color: '#b91c1c',
      bg: '#fee2e2',
      border: '#fca5a5',
      title: hasGateSignal
        ? `Did not pass deterministic score gate: ${gateStatusText}`
        : 'Gate status unavailable from dashboard response',
    };

  // Retrieval method display
  const retrievalMethod = result.retrievalAnalysis?.method || 'unknown';
  const embeddingActive = result.retrievalAnalysis?.embeddingUsed || false;

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
                style={{ background: gateBadge.color }}
                title={gateBadge.title}
                aria-label={gateBadge.title}
              />
            </div>
            <p className="hero-subtitle">
              Based on <strong>{totalJobsAnalyzed} real job postings</strong> for this role
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div className={`verdict-badge verdict-${verdict}`}>
                {verdict === 'strong' && 'Strong Candidate'}
                {verdict === 'moderate' && 'Getting There'}
                {verdict === 'early' && 'Early Stage'}
              </div>
              <span
                title={gateBadge.title}
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  color: gateBadge.color,
                  background: gateBadge.bg,
                  border: `1px solid ${gateBadge.border}`,
                  borderRadius: '12px',
                  padding: '0.15rem 0.55rem',
                }}>
                {gateBadge.label}
              </span>
              {hasGateSignal && (
                <span style={{
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  color: '#475569',
                  background: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  borderRadius: '12px',
                  padding: '0.15rem 0.55rem',
                }}>
                  Gate: {gateStatusText}
                </span>
              )}
              {embeddingActive && (
                <span style={{
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  color: '#059669',
                  background: '#ecfdf520',
                  border: '1px solid #6ee7b740',
                  borderRadius: '12px',
                  padding: '0.15rem 0.55rem',
                }}>
                  Semantic Retrieval Active
                </span>
              )}
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
          {passedGate
            ? <>AI insights are temporarily unavailable; showing rule-based analysis from aggregated job posting data.{result.aiFallbackReason && result.aiFallbackReason !== 'below_threshold' && (
                <span style={{ display: 'block', fontSize: '0.78rem', marginTop: '0.25rem', opacity: 0.8 }}>
                  Reason: {result.aiFallbackReason === 'rate_limit' ? 'API rate limit reached — try again shortly'
                    : result.aiFallbackReason === 'no_api_key' ? 'No GROQ_API_KEY configured'
                    : result.aiFallbackReason === 'malformed_response' ? 'AI returned an unparseable response'
                    : result.aiFallbackReason === 'network_error' ? 'Network error connecting to AI service'
                    : 'Unexpected error'}
                </span>
              )}</>
            : 'Showing rule-based analysis by design because this profile is currently below the AI review threshold.'}
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
                    {item.resources && item.resources.length > 0 && (
                      <div className="action-step-resources">
                        {item.resources.map((r) => (
                          <a
                            key={r.url}
                            href={r.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="resource-link"
                          >
                            {r.name}
                            <span className="resource-type">{r.type}</span>
                          </a>
                        ))}
                      </div>
                    )}
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

      {/* Retrieval details (collapsible) */}
      {result.retrievalAnalysis && (
        <details style={{ marginBottom: '1rem' }}>
          <summary style={{ cursor: 'pointer', fontSize: '0.82rem', color: '#64748b', padding: '0.3rem 0' }}>
            Retrieval details &middot; Method: {retrievalMethod}
          </summary>
          <div className="card" style={{ marginTop: '0.3rem' }}>
            {result.retrievalAnalysis.topMatches && result.retrievalAnalysis.topMatches.length > 0 && (
              <div style={{ marginBottom: '0.75rem' }}>
                <strong style={{ fontSize: '0.82rem' }}>Top retrieved jobs:</strong>
                {result.retrievalAnalysis.topMatches.map((m) => (
                  <div key={m.id} style={{ fontSize: '0.78rem', color: '#4b5563', padding: '0.2rem 0' }}>
                    {m.title} @ {m.company} (score: {m.retrievalScore}, match: {m.matchStrength || 'n/a'})
                  </div>
                ))}
              </div>
            )}
            {result.retrievalAnalysis.offlineMetrics && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', fontSize: '0.78rem' }}>
                <div><strong>P@5:</strong> {result.retrievalAnalysis.offlineMetrics.precisionAtK}</div>
                <div><strong>R@5:</strong> {result.retrievalAnalysis.offlineMetrics.recallAtK}</div>
                <div><strong>MRR:</strong> {result.retrievalAnalysis.offlineMetrics.mrr}</div>
                <div><strong>nDCG@5:</strong> {result.retrievalAnalysis.offlineMetrics.ndcgAtK}</div>
              </div>
            )}
            {result.retrievalAnalysis.embeddingStats && (
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.5rem' }}>
                Cache hits: {result.retrievalAnalysis.embeddingStats.cacheHits} &middot;
                API calls: {result.retrievalAnalysis.embeddingStats.embeddingRequests} &middot;
                Retries: {result.retrievalAnalysis.embeddingStats.retryCount} &middot;
                Fallbacks: {result.retrievalAnalysis.embeddingStats.fallbackCount}
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
