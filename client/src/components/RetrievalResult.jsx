const MATCH_COLORS = {
  strong: { color: '#166534', bg: '#dcfce7' },
  moderate: { color: '#854d0e', bg: '#fef9c3' },
  weak: { color: '#991b1b', bg: '#fee2e2' },
  none: { color: '#64748b', bg: '#f1f5f9' },
};

function MatchBadge({ strength }) {
  const style = MATCH_COLORS[strength] || MATCH_COLORS.none;
  return (
    <span style={{
      background: style.bg,
      color: style.color,
      borderRadius: '12px',
      padding: '0.15rem 0.55rem',
      fontSize: '0.72rem',
      fontWeight: 700,
      textTransform: 'capitalize',
    }}>
      {strength} match
    </span>
  );
}

export default function RetrievalResult({ retrieval, explainability }) {
  if (!retrieval || !retrieval.topJobs || retrieval.topJobs.length === 0) return null;

  const { topJobs, bestMatch, method, embeddingUsed, fallbackReason, metrics } = retrieval;

  return (
    <div>
      {/* Best match highlight */}
      {bestMatch && (
        <div className="card" style={{ borderLeft: '4px solid #0369a1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.2rem' }}>
                Best Match
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e3a5f' }}>{bestMatch.title}</div>
              <div style={{ fontSize: '0.85rem', color: '#64748b' }}>{bestMatch.company} &middot; {bestMatch.experienceLevel}</div>
            </div>
            <MatchBadge strength={bestMatch.matchStrength} />
          </div>
          {bestMatch.evidence && bestMatch.evidence.matchingSkills.length > 0 && (
            <div style={{ marginTop: '0.5rem' }}>
              <div className="skill-tags">
                {bestMatch.evidence.matchingSkills.map((s) => (
                  <span key={s} className="skill-tag has-skill">{s}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* All top 5 */}
      <div className="card">
        <h3>Retrieved Jobs (Top 5)</h3>
        <p className="subtitle">
          Jobs ranked by semantic similarity to your profile
          {fallbackReason && (
            <span style={{ color: '#b45309' }}> (fallback: {fallbackReason})</span>
          )}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {topJobs.map((job, idx) => (
            <div key={job.id} style={{
              border: '1.5px solid #e2e8f0',
              borderRadius: '10px',
              padding: '0.85rem 1rem',
              background: idx === 0 ? '#f0f9ff' : '#fafbfc',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{
                      width: '22px', height: '22px', borderRadius: '50%', background: '#1e3a5f', color: 'white',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, flexShrink: 0,
                    }}>
                      {idx + 1}
                    </span>
                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e3a5f' }}>{job.title}</span>
                    <span style={{ fontSize: '0.82rem', color: '#64748b' }}>{job.company}</span>
                    <span className={`level-badge level-${(job.experienceLevel || '').toLowerCase()}`}>
                      {job.experienceLevel}
                    </span>
                    <MatchBadge strength={job.matchStrength} />
                  </div>
                  {job.description && (
                    <p style={{ fontSize: '0.8rem', color: '#4b5563', margin: '0.3rem 0 0 2rem', lineHeight: 1.4 }}>
                      {job.description}
                    </p>
                  )}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#1e3a5f' }}>
                    {Math.round((job.retrievalScore || 0) * 100)}
                  </div>
                  <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>score</div>
                </div>
              </div>

              {/* Evidence */}
              {job.evidence && (
                <div style={{ marginTop: '0.4rem', paddingLeft: '2rem' }}>
                  {job.evidence.matchingSkills.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap', marginBottom: '0.2rem' }}>
                      <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>Skills:</span>
                      {job.evidence.matchingSkills.slice(0, 8).map((s) => (
                        <span key={s} style={{ fontSize: '0.72rem', background: '#dcfce7', color: '#166534', borderRadius: '10px', padding: '0.1rem 0.4rem' }}>{s}</span>
                      ))}
                    </div>
                  )}
                  {job.evidence.domainTerms.length > 0 && (
                    <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                      Domain overlap: {job.evidence.domainTerms.slice(0, 5).join(', ')}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Explainability summary */}
      {explainability && (
        <div className="card">
          <h3>Evaluation Summary</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            {explainability.overallStrengths.length > 0 && (
              <div>
                <div className="eval-skill-label matched">Your strengths across top matches</div>
                <div className="skill-tags">
                  {explainability.overallStrengths.map((s) => (
                    <span key={s} className="skill-tag has-skill">{s}</span>
                  ))}
                </div>
              </div>
            )}
            {explainability.overallGaps.length > 0 && (
              <div>
                <div className="eval-skill-label missing">Gaps to close</div>
                <div className="skill-tags">
                  {explainability.overallGaps.slice(0, 10).map((s) => (
                    <span key={s} className="skill-tag missing-skill">{s}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
          {explainability.thresholdComparison && (
            <div style={{ marginTop: '0.75rem', fontSize: '0.82rem', color: '#64748b' }}>
              Heuristic: {explainability.thresholdComparison.heuristicScore}/100 &middot;
              Composite: {explainability.thresholdComparison.compositeScore}/100 &middot;
              Strong threshold: {explainability.thresholdComparison.strongThreshold} &middot;
              Borderline threshold: {explainability.thresholdComparison.borderlineThreshold}
            </div>
          )}
        </div>
      )}

      {/* Retrieval metrics (collapsed by default) */}
      {metrics && (
        <details style={{ marginBottom: '1rem' }}>
          <summary style={{ cursor: 'pointer', fontSize: '0.82rem', color: '#64748b', padding: '0.3rem 0' }}>
            Retrieval metrics &middot; Method: {method || 'unknown'}
            {embeddingUsed && <span style={{ color: '#059669' }}> (embeddings active)</span>}
          </summary>
          <div className="card" style={{ marginTop: '0.3rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', fontSize: '0.82rem' }}>
              <div><strong>P@5:</strong> {metrics.precisionAtK}</div>
              <div><strong>R@5:</strong> {metrics.recallAtK}</div>
              <div><strong>MRR:</strong> {metrics.mrr}</div>
              <div><strong>nDCG@5:</strong> {metrics.ndcgAtK}</div>
            </div>
          </div>
        </details>
      )}
    </div>
  );
}
