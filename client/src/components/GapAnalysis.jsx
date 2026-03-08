import { useState, useEffect } from 'react';
import { analyzeGap } from '../api';
import ProfileForm from './ProfileForm';

export default function GapAnalysis({ profile, job, onBack, onProfileUpdate }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showEdit, setShowEdit] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError('');
    setResult(null);

    analyzeGap(profile.skills, job.requiredSkills, job.title)
      .then((data) => setResult(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [profile.skills, job]);

  function handleProfileUpdate(updated) {
    onProfileUpdate(updated);
    setShowEdit(false);
    // Re-run analysis with updated skills
    setLoading(true);
    setError('');
    setResult(null);
    analyzeGap(updated.skills, job.requiredSkills, job.title)
      .then((data) => setResult(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  if (showEdit) {
    return (
      <div>
        <button className="btn-secondary back-btn" onClick={() => setShowEdit(false)}>
          &larr; Back to Analysis
        </button>
        <ProfileForm profile={profile} onSaved={handleProfileUpdate} />
      </div>
    );
  }

  return (
    <div>
      <div className="gap-header card">
        <button className="btn-secondary back-btn" onClick={onBack}>
          &larr; Back to Jobs
        </button>
        <div className="gap-title-row">
          <div>
            <h2>Skills Gap Analysis</h2>
            <p className="subtitle">
              <strong>{job.title}</strong> at {job.company}
            </p>
          </div>
          <button className="btn-secondary" onClick={() => setShowEdit(true)}>
            Edit My Skills
          </button>
        </div>
      </div>

      {loading && (
        <div className="card loading-card">
          <div className="spinner" />
          <p>Analyzing your skills gap with AI...</p>
        </div>
      )}

      {error && (
        <div className="card">
          <div className="error-banner">{error}</div>
        </div>
      )}

      {result && !loading && (
        <div>
          {result.isFallback && (
            <div className="fallback-banner">
              Rule-based analysis — AI service unavailable. Results are based on skill matching.
            </div>
          )}

          {result.missingSkills.length === 0 ? (
            <div className="card success-card">
              <div className="success-icon">&#10003;</div>
              <h3>You are fully qualified!</h3>
              <p>{result.summary}</p>
            </div>
          ) : (
            <>
              <div className="card">
                <h3>Summary</h3>
                <p>{result.summary}</p>
                {result.totalEstimatedWeeks > 0 && (
                  <p className="time-estimate">
                    Estimated time to close gap: <strong>{result.totalEstimatedWeeks} weeks</strong>
                  </p>
                )}
              </div>

              <div className="card">
                <h3>Missing Skills ({result.missingSkills.length})</h3>
                <div className="skill-tags">
                  {result.missingSkills.map((s) => (
                    <span key={s} className="skill-tag missing-skill">{s}</span>
                  ))}
                </div>
              </div>

              {result.roadmap && result.roadmap.length > 0 && (
                <div className="card">
                  <h3>Learning Roadmap</h3>
                  <div className="roadmap">
                    {result.roadmap.map((item, idx) => (
                      <div key={item.skill} className="roadmap-item">
                        <div className="roadmap-header">
                          <span className="roadmap-num">{idx + 1}</span>
                          <span className="roadmap-skill">{item.skill}</span>
                          <span className={`priority-badge priority-${item.priority.toLowerCase()}`}>
                            {item.priority} Priority
                          </span>
                          <span className="roadmap-weeks">{item.estimatedWeeks}w</span>
                        </div>
                        <div className="roadmap-resources">
                          {item.resources && item.resources.map((r) => (
                            <a
                              key={r.name}
                              href={r.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="resource-link"
                            >
                              <span className="resource-type">{r.type}</span>
                              {r.name}
                            </a>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
