const METHOD_STYLES = {
  semantic_retrieval_plus_llm: { color: '#059669', bg: '#ecfdf5', border: '#6ee7b7', icon: 'S+AI' },
  semantic_retrieval_plus_rules: { color: '#0369a1', bg: '#f0f9ff', border: '#7dd3fc', icon: 'S+R' },
  heuristic_plus_llm: { color: '#7c3aed', bg: '#f5f3ff', border: '#c4b5fd', icon: 'R+AI' },
  heuristic_plus_tfidf: { color: '#b45309', bg: '#fffbeb', border: '#fcd34d', icon: 'R+T' },
  heuristic_only: { color: '#64748b', bg: '#f8fafc', border: '#cbd5e1', icon: 'R' },
};

export default function ScoringMethodBadge({ method }) {
  if (!method) return null;
  const style = METHOD_STYLES[method.id] || METHOD_STYLES.heuristic_only;

  return (
    <div className="scoring-method-badge" style={{
      background: style.bg,
      border: `1.5px solid ${style.border}`,
      color: style.color,
      borderRadius: '10px',
      padding: '0.6rem 1rem',
      marginBottom: '1rem',
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
      fontSize: '0.85rem',
    }}>
      <span style={{
        background: style.color,
        color: 'white',
        borderRadius: '6px',
        padding: '0.15rem 0.5rem',
        fontSize: '0.72rem',
        fontWeight: 700,
        letterSpacing: '0.04em',
      }}>
        {style.icon}
      </span>
      <div>
        <strong>{method.label}</strong>
        <span style={{ display: 'block', fontSize: '0.78rem', opacity: 0.8, marginTop: '0.1rem' }}>
          {method.description}
        </span>
      </div>
    </div>
  );
}
