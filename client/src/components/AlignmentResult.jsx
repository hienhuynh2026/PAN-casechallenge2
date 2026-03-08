const STATUS_META = {
  strong:    { label: 'Ready to Apply',  color: '#16a34a', bg: '#f0fdf4', border: '#86efac', icon: '✓', detail: 'Your resume is well-aligned with this role. Proceed to deeper LLM grading below for specific coaching.' },
  borderline: { label: 'Almost There',  color: '#b45309', bg: '#fffbeb', border: '#fcd34d', icon: '~', detail: 'Your resume is close but not yet competitive. A few targeted improvements could push you over the threshold.' },
  weak:      { label: 'Needs Work',     color: '#dc2626', bg: '#fef2f2', border: '#fca5a5', icon: '!', detail: 'Your resume is missing key signals for this role. Use the agent recommendations below to close the gaps.' },
};

const CONFIDENCE_LABELS = { high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence' };

// Human-readable labels and descriptions for each scoring dimension
const DIM_INFO = {
  coreSkills:      { label: 'Must-Have Skills',     max: 40, desc: 'The core technical skills required by nearly every employer for this role — most important for your score' },
  preferredSkills: { label: 'Nice-to-Have Skills',  max: 15, desc: 'Bonus skills listed as "preferred" in job postings — these make you stand out from other candidates' },
  tools:           { label: 'Tools & Platforms',    max: 10, desc: 'Specific software, cloud platforms, or named tools mentioned in job listings' },
  projectSignals:  { label: 'Domain Experience',    max: 15, desc: 'Evidence you have actually worked in this field — project types, domain words, industry vocabulary in your resume' },
  relatedConcepts: { label: 'Technical Breadth',    max: 10, desc: 'Broader understanding of the field beyond the core skill list — shows you understand the wider ecosystem' },
  actionVerbs:     { label: 'Achievement Language', max: 5,  desc: 'Strong action verbs showing what you built, led, or improved (e.g. "deployed", "optimised", "reduced")' },
  impactLanguage:  { label: 'Quantified Results',   max: 5,  desc: 'Numbers and measurable outcomes in your resume — percentages, cost savings, performance gains' },
};

export default function AlignmentResult({ alignment, onRequestGrade, onRequestAgent, gradeLoading, agentLoading }) {
  const meta = STATUS_META[alignment.status] || STATUS_META.weak;
  const score = alignment.alignmentScore;
  const barColor = score >= 75 ? '#16a34a' : score >= 55 ? '#f59e0b' : '#ef4444';

  return (
    <div>
      {/* Score card */}
      <div className="card eval-score-card" style={{ borderLeft: `4px solid ${meta.color}` }}>
        <div className="eval-score-row">
          <div>
            <div className="eval-score-label">Resume Alignment Score</div>
            <div className="eval-score-value" style={{ color: meta.color }}>{score}<span className="eval-score-denom">/100</span></div>
            <div className="eval-status-badge" style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}>
              {meta.icon} {meta.label}
            </div>
            <div className="eval-status-detail">{meta.detail}</div>
            <div className="eval-confidence">{CONFIDENCE_LABELS[alignment.confidence]} · Targeting <strong>{alignment.targetRole}</strong></div>
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

        {/* Score breakdown with intuitive labels */}
        <div className="eval-breakdown">
          <div className="breakdown-heading">Score breakdown — hover each row to learn what it means</div>
          {Object.entries(alignment.breakdown).map(([dim, pts]) => {
            const info = DIM_INFO[dim] || { label: dim, max: 10, desc: '' };
            const pct = Math.round((pts / info.max) * 100);
            return (
              <div key={dim} className="breakdown-row" title={info.desc}>
                <span className="breakdown-dim">{info.label}</span>
                <div className="breakdown-bar-track">
                  <div className="breakdown-bar-fill" style={{ width: `${pct}%`, background: barColor }} />
                </div>
                <span className="breakdown-pts">{pts}/{info.max}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Guardrail issues — shown when a high score was demoted to borderline */}
      {alignment.guardrailIssues && alignment.guardrailIssues.length > 0 && (
        <div className="card guardrail-card">
          <h3>Why Your Score Was Held Back</h3>
          <p className="subtitle">Your total score was high enough to qualify, but these specific requirements were not met. Fix these first — they have the most impact on your rating.</p>
          <ul className="guardrail-list">
            {alignment.guardrailIssues.map((issue, i) => (
              <li key={i} className="guardrail-item">
                <span className="guardrail-icon">⚠</span>
                <span>{issue}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Core skills matched / missed */}
      {(alignment.coreMatched.length > 0 || alignment.coreMissed.length > 0) && (
        <div className="card">
          <h3>Must-Have Skills</h3>
          <p className="subtitle">These are required by nearly every employer for this role — they carry the most weight in your score</p>
          {alignment.coreMatched.length > 0 && (
            <div className="eval-skill-group">
              <span className="eval-skill-label matched">You have these ✓</span>
              <div className="skill-tags">
                {alignment.coreMatched.map((s) => <span key={s} className="skill-tag has-skill">{s}</span>)}
              </div>
            </div>
          )}
          {alignment.coreMissed.length > 0 && (
            <div className="eval-skill-group">
              <span className="eval-skill-label missing">Missing from your resume</span>
              <div className="skill-tags">
                {alignment.coreMissed.map((s) => <span key={s} className="skill-tag missing-skill">{s}</span>)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Matched strengths */}
      {alignment.matchedStrengths.length > 0 && (
        <div className="card">
          <h3>Areas Where You Are Strong</h3>
          <p className="subtitle">Skill categories where your resume covers at least half of what employers look for</p>
          <div className="eval-category-grid">
            {alignment.matchedStrengths.map((s) => (
              <div key={s.category} className="eval-category-chip strength">
                <span className="eval-category-name">{s.category}</span>
                <span className="eval-category-skills">{s.matched.join(', ')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Missing categories */}
      {alignment.missingCategories.length > 0 && (
        <div className="card">
          <h3>Skill Gaps — Where to Focus</h3>
          <p className="subtitle">Areas where your resume is weak. "Critical" means less than 20% of that category is present — fix these first.</p>
          <div className="eval-category-grid">
            {alignment.missingCategories.map((g) => (
              <div key={g.category} className={`eval-category-chip gap ${g.critical ? 'critical' : ''}`}>
                <div className="eval-category-header">
                  <span className="eval-category-name">{g.category}</span>
                  {g.critical && <span className="critical-badge">Critical gap</span>}
                </div>
                <span className="eval-category-skills missing">Missing: {g.missing.join(', ')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gate-specific call to action */}
      {alignment.status === 'strong' && (
        <div className="eval-gate-banner success">
          <strong>Score above 75 — passed the threshold.</strong> Your resume was automatically sent to the AI for deeper grading below.
        </div>
      )}

      {alignment.status === 'borderline' && (
        <div className="eval-gate-banner borderline">
          <div>
            <strong>Score {score}/100 — almost there.</strong> You are close to the 75-point threshold. Requesting a deep grade will give you specific line-by-line coaching on how to push past it.
          </div>
          <button
            className="btn-primary"
            onClick={onRequestGrade}
            disabled={gradeLoading}
          >
            {gradeLoading ? 'Grading...' : 'Get Deep Grade + Coaching'}
          </button>
        </div>
      )}

      {alignment.status === 'weak' && (
        <div className="eval-gate-banner weak">
          <div>
            <strong>Score {score}/100 — needs work.</strong> Your resume is missing too many signals to be graded usefully yet. Use the agent recommendations below — they include curated courses, project ideas, and resume tips tailored to your specific gaps.
          </div>
          <button
            className="btn-secondary"
            onClick={onRequestAgent}
            disabled={agentLoading}
          >
            {agentLoading ? 'Searching for resources...' : 'Refresh Agent Recommendations'}
          </button>
        </div>
      )}
    </div>
  );
}
