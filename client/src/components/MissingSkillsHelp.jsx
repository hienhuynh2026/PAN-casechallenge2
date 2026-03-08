import { useState } from 'react';

export default function MissingSkillsHelp({ skills }) {
  const [expanded, setExpanded] = useState(false);

  if (!skills || skills.length === 0) return null;

  const visible = expanded ? skills : skills.slice(0, 4);

  return (
    <div className="card missing-skills-help">
      <h4>Missing Skills Help</h4>
      <p className="subtitle">
        Top gaps identified from your best-matching job postings, with curated resources to close each one.
      </p>

      <div className="missing-skills-grid">
        {visible.map((item) => (
          <div key={item.skill} className="missing-skill-card">
            <div className="missing-skill-header">
              <span className="missing-skill-name">{item.skill}</span>
              <span className={`missing-skill-tag ${item.isRequired ? 'tag-required' : 'tag-preferred'}`}>
                {item.isRequired ? 'Required' : 'Preferred'}
              </span>
            </div>

            <p className="missing-skill-why">{item.whyItMatters}</p>

            {item.howToImprove && (
              <p className="missing-skill-improve">
                <strong>Try:</strong> {item.howToImprove}
              </p>
            )}

            {item.resources && item.resources.length > 0 && (
              <div className="missing-skill-resources">
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
          </div>
        ))}
      </div>

      {skills.length > 4 && (
        <button
          type="button"
          className="btn-secondary btn-sm"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Show fewer' : `Show ${skills.length - 4} more`}
        </button>
      )}
    </div>
  );
}
