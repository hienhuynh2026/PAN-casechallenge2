const TYPE_CLASS = { Course: 'type-course', Docs: 'type-docs', Tutorial: 'type-tutorial', Book: 'type-book' };

export default function GapCloser({ agent }) {
  return (
    <div>
      {agent.isFallback && (
        <div className="fallback-banner">
          AI agent was unavailable — showing curated static resources from the knowledge base.
        </div>
      )}

      {/* Summary */}
      <div className="card agent-summary-card">
        <div className="agent-header">
          <span className="agent-icon">&#128272;</span>
          <div>
            <h3>Agent Gap-Closing Report</h3>
            <p className="subtitle">{agent.summary}</p>
          </div>
        </div>

        {agent.timelineEstimate && (
          <div className="agent-timeline">
            Estimated time to close gaps: <strong>{agent.timelineEstimate}</strong>
          </div>
        )}

        {agent.quickWins && agent.quickWins.length > 0 && (
          <div className="agent-quick-wins">
            <div className="quick-wins-label">Quick wins (this week)</div>
            <ul className="eval-list">
              {agent.quickWins.map((win, i) => (
                <li key={i} className="eval-list-item">
                  <span className="list-icon">&#9889;</span> {win}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Per-gap categories */}
      {agent.categories && agent.categories.map((cat, i) => (
        <div key={i} className="card agent-gap-card">
          <div className="agent-gap-title">
            <span className="agent-gap-num">{i + 1}</span>
            <h3>{cat.gap}</h3>
          </div>

          {/* Learn resources */}
          {cat.learn && cat.learn.length > 0 && (
            <div className="agent-section">
              <div className="agent-section-label">Learn</div>
              <div className="agent-resources">
                {cat.learn.map((r, j) => (
                  <a
                    key={j}
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="agent-resource-link"
                  >
                    <span className={`resource-type ${TYPE_CLASS[r.type] || ''}`}>{r.type}</span>
                    <div>
                      <div className="agent-resource-name">{r.name}</div>
                      {r.description && <div className="agent-resource-desc">{r.description}</div>}
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Build ideas */}
          {cat.build && cat.build.length > 0 && (
            <div className="agent-section">
              <div className="agent-section-label">Build</div>
              <ul className="eval-list">
                {cat.build.map((idea, j) => (
                  <li key={j} className="eval-list-item">
                    <span className="list-icon">&#9998;</span> {idea}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Add to resume */}
          {cat.addToResume && cat.addToResume.length > 0 && (
            <div className="agent-section">
              <div className="agent-section-label">Add to Resume</div>
              <ul className="eval-list">
                {cat.addToResume.map((tip, j) => (
                  <li key={j} className="eval-list-item">
                    <span className="list-icon">&#43;</span> {tip}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Next step */}
          {cat.improveNext && (
            <div className="agent-next">
              <span className="agent-next-label">Next step</span>
              <span>{cat.improveNext}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
