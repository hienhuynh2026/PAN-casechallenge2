const READINESS_META = {
  'Ready': { color: '#16a34a', bg: '#f0fdf4', border: '#86efac' },
  'Almost Ready': { color: '#b45309', bg: '#fffbeb', border: '#fcd34d' },
  'Needs Work': { color: '#dc2626', bg: '#fef2f2', border: '#fca5a5' },
};

const PRIORITY_CLASS = { High: 'priority-high', Medium: 'priority-medium', Low: 'priority-low' };

export default function GradeResult({ grade }) {
  const meta = READINESS_META[grade.readinessLevel] || READINESS_META['Needs Work'];
  const score = grade.overallScore;
  const barColor = score >= 80 ? '#16a34a' : score >= 65 ? '#f59e0b' : '#ef4444';

  return (
    <div>
      {grade.isFallback && (
        <div className="fallback-banner">
          AI grading was unavailable — results are rule-based estimates. Restart Groq service for full grading.
        </div>
      )}

      {/* Overall score */}
      <div className="card eval-score-card" style={{ borderLeft: `4px solid ${meta.color}` }}>
        <div className="eval-score-row">
          <div>
            <div className="eval-score-label">LLM Resume Grade</div>
            <div className="eval-score-value" style={{ color: meta.color }}>
              {score}<span className="eval-score-denom">/100</span>
            </div>
            <div className="eval-status-badge" style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}>
              {grade.readinessLevel}
            </div>
          </div>
          <div className="eval-score-ring">
            <svg viewBox="0 0 36 36" className="ring-svg">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e2e8f0" strokeWidth="3" />
              <circle
                cx="18" cy="18" r="15.9" fill="none"
                stroke={barColor} strokeWidth="3"
                strokeDasharray={`${score} ${100 - score}`}
                strokeDashoffset="25"
                strokeLinecap="round"
              />
            </svg>
            <span className="ring-label" style={{ color: barColor }}>{score}</span>
          </div>
        </div>
        <p className="eval-summary-text">{grade.roleFitSummary}</p>
      </div>

      {/* Strengths */}
      {grade.strengths && grade.strengths.length > 0 && (
        <div className="card">
          <h3>Strengths</h3>
          <ul className="eval-list strengths-list">
            {grade.strengths.map((s, i) => (
              <li key={i} className="eval-list-item strength-item">
                <span className="list-icon">&#10003;</span> {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Weak areas */}
      {grade.weakAreas && grade.weakAreas.length > 0 && (
        <div className="card">
          <h3>Weak Areas</h3>
          <div className="eval-weak-list">
            {grade.weakAreas.map((w, i) => (
              <div key={i} className="eval-weak-item">
                <div className="eval-weak-area">{w.area}</div>
                <div className="eval-weak-explanation">{w.explanation}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action steps */}
      {grade.actionSteps && grade.actionSteps.length > 0 && (
        <div className="card">
          <h3>Prioritised Action Steps</h3>
          <div className="roadmap">
            {grade.actionSteps.map((step, i) => (
              <div key={i} className="roadmap-item">
                <div className="roadmap-header">
                  <span className="roadmap-num">{i + 1}</span>
                  <span className="roadmap-skill">{step.step}</span>
                  <span className={`priority-badge ${PRIORITY_CLASS[step.priority] || 'priority-low'}`}>
                    {step.priority}
                  </span>
                </div>
                <p className="eval-step-rationale">{step.rationale}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Resume improvements */}
      {grade.resumeImprovements && grade.resumeImprovements.length > 0 && (
        <div className="card">
          <h3>Resume Improvements</h3>
          <ul className="eval-list">
            {grade.resumeImprovements.map((tip, i) => (
              <li key={i} className="eval-list-item">
                <span className="list-icon">&#8594;</span> {tip}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Bullet rewrites */}
      {grade.bulletRewrites && grade.bulletRewrites.length > 0 && (
        <div className="card">
          <h3>Bullet Rewrite Suggestions</h3>
          <div className="rewrite-list">
            {grade.bulletRewrites.map((rw, i) => (
              <div key={i} className="rewrite-item">
                <div className="rewrite-original">
                  <span className="rewrite-label">Original</span>
                  <p>{rw.original}</p>
                </div>
                <div className="rewrite-improved">
                  <span className="rewrite-label improved">Improved</span>
                  <p>{rw.improved}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
