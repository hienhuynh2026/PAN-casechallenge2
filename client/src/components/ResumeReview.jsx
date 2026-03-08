import { useState } from 'react';
import { saveProfile } from '../api';

const ROLE_OPTIONS = [
  'Frontend Developer', 'Backend Developer', 'Full Stack Developer',
  'Cloud Engineer', 'DevOps Engineer', 'Security Analyst',
  'Cybersecurity Engineer', 'Cloud Security Engineer', 'Data Engineer',
  'Data Analyst', 'Machine Learning Engineer', 'Site Reliability Engineer',
];
const EDUCATION_OPTIONS = [
  'High School', 'Associate Degree', "Bachelor's Degree",
  "Master's Degree", 'PhD', 'Bootcamp', 'Self-taught',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ConfidenceBadge({ level }) {
  if (!level || level === 'high') return null;
  const cls = level === 'medium' ? 'confidence-medium' : 'confidence-low';
  const label = level === 'medium' ? 'Needs Review' : 'Not Detected';
  return <span className={`confidence-badge ${cls}`}>{label}</span>;
}

/** Match a raw targetRole string against our dropdown options. */
function matchRole(raw) {
  if (!raw) return '';
  const lower = raw.toLowerCase();
  return (
    ROLE_OPTIONS.find((o) => o.toLowerCase() === lower) ||
    ROLE_OPTIONS.find((o) => o.toLowerCase().includes(lower) || lower.includes(o.toLowerCase())) ||
    ''
  );
}

// ─── Parse-mode banner ────────────────────────────────────────────────────────

function ParseModeBanner({ parseMode, warnings }) {
  const hasBlockingWarnings = warnings.some((w) =>
    ['name', 'skills', 'workExperience'].includes(w.field)
  );

  if (parseMode === 'ai' && warnings.length === 0) return null;

  if (parseMode === 'rule_based' && !hasBlockingWarnings) {
    return (
      <div className="parse-banner parse-banner-info">
        Auto-filled using document parsing. Please review before saving.
      </div>
    );
  }

  return (
    <div className="parse-banner parse-banner-warn">
      {parseMode === 'rule_based'
        ? 'Some fields could not be detected automatically — please fill them in below.'
        : 'Some fields may need your attention before saving.'}
    </div>
  );
}

// ─── Work experience card ─────────────────────────────────────────────────────

function ExpCard({ exp, index, onChange, onDelete }) {
  const [open, setOpen] = useState(false);

  // Null-safe accessors
  const bullets = exp.bullets || [];
  const title   = exp.title   ?? '';
  const company = exp.company ?? '';

  const update = (key, val) => onChange(index, { ...exp, [key]: val });
  const updateBullet = (i, val) => {
    const next = [...bullets];
    next[i] = val;
    update('bullets', next);
  };

  return (
    <div className="entry-card">
      <div className="entry-card-header">
        <div className="entry-card-title">
          <strong>{title || 'Untitled'}</strong>
          {company && <span className="entry-card-company"> — {company}</span>}
          {(exp.startDate || exp.endDate) && (
            <span className="entry-card-dates">
              {' '}· {exp.startDate}{exp.endDate ? ` – ${exp.endDate}` : ''}
            </span>
          )}
        </div>
        <div className="entry-card-actions">
          <button type="button" className="btn-icon" onClick={() => setOpen(!open)}>
            {open ? 'Close' : 'Edit'}
          </button>
          <button type="button" className="btn-icon btn-icon-danger" onClick={() => onDelete(index)}>
            Delete
          </button>
        </div>
      </div>

      {!open && bullets.length > 0 && (
        <ul className="entry-bullets-preview">
          {bullets.slice(0, 2).map((b, i) => <li key={i}>{b}</li>)}
          {bullets.length > 2 && <li className="more-bullets">+{bullets.length - 2} more</li>}
        </ul>
      )}

      {open && (
        <div className="entry-edit-form">
          <div className="entry-row-2">
            <div className="form-group">
              <label>Job Title</label>
              <input type="text" value={title} onChange={(e) => update('title', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Company</label>
              <input type="text" value={company} onChange={(e) => update('company', e.target.value)} />
            </div>
          </div>
          <div className="entry-row-3">
            <div className="form-group">
              <label>Location</label>
              <input type="text" value={exp.location || ''} onChange={(e) => update('location', e.target.value)} placeholder="City, State or Remote" />
            </div>
            <div className="form-group">
              <label>Start Date</label>
              <input type="text" value={exp.startDate || ''} onChange={(e) => update('startDate', e.target.value)} placeholder="Jan 2024" />
            </div>
            <div className="form-group">
              <label>End Date</label>
              <input type="text" value={exp.endDate || ''} onChange={(e) => update('endDate', e.target.value)} placeholder="Jun 2024 or Present" />
            </div>
          </div>
          <div className="form-group">
            <label>Bullet Points</label>
            {bullets.map((b, i) => (
              <div key={i} className="bullet-row">
                <input type="text" value={b} onChange={(e) => updateBullet(i, e.target.value)} />
                <button type="button" className="btn-icon btn-icon-danger"
                  onClick={() => update('bullets', bullets.filter((_, j) => j !== i))}>×</button>
              </div>
            ))}
            <button type="button" className="btn-add-bullet" onClick={() => update('bullets', [...bullets, ''])}>
              + Add bullet
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Project card ─────────────────────────────────────────────────────────────

function ProjectCard({ proj, index, onChange, onDelete }) {
  const [open, setOpen] = useState(false);

  const bullets      = proj.bullets      || [];
  const technologies = proj.technologies || [];
  const name         = proj.name         ?? '';

  const update = (key, val) => onChange(index, { ...proj, [key]: val });
  const updateBullet = (i, val) => {
    const next = [...bullets];
    next[i] = val;
    update('bullets', next);
  };

  return (
    <div className="entry-card">
      <div className="entry-card-header">
        <div className="entry-card-title">
          <strong>{name || 'Untitled'}</strong>
          {technologies.length > 0 && (
            <span className="entry-card-tech"> · {technologies.slice(0, 3).join(', ')}</span>
          )}
          {proj.date && <span className="entry-card-dates"> · {proj.date}</span>}
        </div>
        <div className="entry-card-actions">
          <button type="button" className="btn-icon" onClick={() => setOpen(!open)}>
            {open ? 'Close' : 'Edit'}
          </button>
          <button type="button" className="btn-icon btn-icon-danger" onClick={() => onDelete(index)}>
            Delete
          </button>
        </div>
      </div>

      {!open && bullets.length > 0 && (
        <ul className="entry-bullets-preview">
          {bullets.slice(0, 2).map((b, i) => <li key={i}>{b}</li>)}
          {bullets.length > 2 && <li className="more-bullets">+{bullets.length - 2} more</li>}
        </ul>
      )}

      {open && (
        <div className="entry-edit-form">
          <div className="entry-row-2">
            <div className="form-group">
              <label>Project Name</label>
              <input type="text" value={name} onChange={(e) => update('name', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Date</label>
              <input type="text" value={proj.date || ''} onChange={(e) => update('date', e.target.value)} placeholder="Jan 2025" />
            </div>
          </div>
          <div className="form-group">
            <label>Technologies (comma-separated)</label>
            <input
              type="text"
              value={technologies.join(', ')}
              onChange={(e) => update('technologies', e.target.value.split(',').map((t) => t.trim()).filter(Boolean))}
              placeholder="React, Node.js, PostgreSQL"
            />
          </div>
          <div className="form-group">
            <label>Bullet Points</label>
            {bullets.map((b, i) => (
              <div key={i} className="bullet-row">
                <input type="text" value={b} onChange={(e) => updateBullet(i, e.target.value)} />
                <button type="button" className="btn-icon btn-icon-danger"
                  onClick={() => update('bullets', bullets.filter((_, j) => j !== i))}>×</button>
              </div>
            ))}
            <button type="button" className="btn-add-bullet" onClick={() => update('bullets', [...bullets, ''])}>
              + Add bullet
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main review component ────────────────────────────────────────────────────

export default function ResumeReview({ data, onApply, onCancel }) {
  const confidence = data.confidence || {};
  const warnings   = data.warnings   || [];
  const parseMode  = data.parseMode  || (data.isFallback ? 'rule_based' : 'ai');

  const [name, setName]           = useState(data.name || '');
  const [email, setEmail]         = useState(data.email || '');
  const [phone, setPhone]         = useState(data.phone || '');
  const [role, setRole]           = useState(() => matchRole(data.targetRole) || data.targetRole || '');
  const [educationLevel, setEd]   = useState(data.educationLevel || '');
  const [skills, setSkills]       = useState(data.skills || []);
  const [skillInput, setSI]       = useState('');
  const [workExperience, setWork] = useState(
    (data.workExperience || []).map((e) => ({ ...e, bullets: e.bullets || [] }))
  );
  const [projects, setProjects]   = useState(
    (data.projects || []).map((p) => ({ ...p, bullets: p.bullets || [], technologies: p.technologies || [] }))
  );
  const [certifications, setCerts] = useState(
    Array.isArray(data.certifications) ? data.certifications : []
  );
  const [certInput, setCI]  = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  // ── Skills
  function addSkill(e) {
    e?.preventDefault();
    const s = skillInput.trim();
    if (s && !skills.includes(s)) setSkills([...skills, s]);
    setSI('');
  }

  // ── Certifications
  function addCert(e) {
    e?.preventDefault();
    const c = certInput.trim();
    if (c) setCerts([...certifications, c]);
    setCI('');
  }

  // ── Work experience
  function updateExp(i, val) { setWork(workExperience.map((e, j) => j === i ? val : e)); }
  function deleteExp(i)      { setWork(workExperience.filter((_, j) => j !== i)); }
  function addExp()          { setWork([...workExperience, { title: '', company: '', location: '', startDate: '', endDate: '', bullets: [] }]); }

  // ── Projects
  function updateProj(i, val) { setProjects(projects.map((p, j) => j === i ? val : p)); }
  function deleteProj(i)      { setProjects(projects.filter((_, j) => j !== i)); }
  function addProj()          { setProjects([...projects, { name: '', technologies: [], date: '', bullets: [] }]); }

  async function handleApply() {
    setSaving(true);
    setError('');
    try {
      await saveProfile({
        name, email, phone, educationLevel, targetRole: role,
        skills, workExperience, projects, certifications,
      });
      onApply();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // Per-field warning lookup
  const warningFor = (field) => warnings.find((w) => w.field === field);

  return (
    <div className="resume-review">
      <div className="review-header">
        <h3>Review Extracted Data</h3>
        <p className="subtitle">
          Edit anything that looks wrong, then click &ldquo;Confirm &amp; Save Profile.&rdquo;
        </p>
        <ParseModeBanner parseMode={parseMode} warnings={warnings} />
        {error && <div className="error-banner">{error}</div>}
      </div>

      {/* Contact */}
      <div className="review-section">
        <h4 className="section-heading">Contact</h4>
        <div className="entry-row-3">
          <div className="form-group">
            <label>Full Name <ConfidenceBadge level={confidence.name} /></label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
            {warningFor('name') && <span className="field-warning">{warningFor('name').message}</span>}
          </div>
          <div className="form-group">
            <label>Email <ConfidenceBadge level={confidence.email} /></label>
            <input type="text" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Phone <ConfidenceBadge level={confidence.phone} /></label>
            <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Role & Education */}
      <div className="review-section">
        <h4 className="section-heading">Role &amp; Education</h4>
        <div className="entry-row-2">
          <div className="form-group">
            <label>Target Role <ConfidenceBadge level={confidence.targetRole} /></label>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="">Select a target role</option>
              {ROLE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            {warningFor('targetRole') && <span className="field-warning">{warningFor('targetRole').message}</span>}
          </div>
          <div className="form-group">
            <label>Education Level <ConfidenceBadge level={confidence.educationLevel} /></label>
            <select value={educationLevel} onChange={(e) => setEd(e.target.value)}>
              <option value="">Select education level</option>
              {EDUCATION_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Skills */}
      <div className="review-section">
        <h4 className="section-heading">
          Skills <ConfidenceBadge level={confidence.skills} />
        </h4>
        <div className="skill-input-row">
          <input
            type="text" value={skillInput}
            onChange={(e) => setSI(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addSkill(e); }}
            placeholder="Add a skill"
          />
          <button type="button" className="btn-secondary" onClick={addSkill}>Add</button>
        </div>
        {warningFor('skills') && <span className="field-warning">{warningFor('skills').message}</span>}
        <div className="skill-tags" style={{ marginTop: '0.5rem' }}>
          {skills.map((s) => (
            <span key={s} className="skill-tag">
              {s}
              <button type="button" onClick={() => setSkills(skills.filter((x) => x !== s))} aria-label={`Remove ${s}`}>&times;</button>
            </span>
          ))}
        </div>
      </div>

      {/* Work Experience */}
      <div className="review-section">
        <div className="section-heading-row">
          <h4 className="section-heading">
            Work Experience <ConfidenceBadge level={confidence.workExperience} />
          </h4>
          <button type="button" className="btn-add" onClick={addExp}>+ Add Entry</button>
        </div>
        {warningFor('workExperience') && (
          <p className="field-warning">{warningFor('workExperience').message}</p>
        )}
        {workExperience.length === 0 && !warningFor('workExperience') && (
          <p className="empty-hint">No work experience extracted. Click &quot;+ Add Entry&quot; to add one.</p>
        )}
        {workExperience.map((exp, i) => (
          <ExpCard key={i} exp={exp} index={i} onChange={updateExp} onDelete={deleteExp} />
        ))}
      </div>

      {/* Projects */}
      <div className="review-section">
        <div className="section-heading-row">
          <h4 className="section-heading">
            Projects <ConfidenceBadge level={confidence.projects} />
          </h4>
          <button type="button" className="btn-add" onClick={addProj}>+ Add Project</button>
        </div>
        {warningFor('projects') && (
          <p className="field-warning">{warningFor('projects').message}</p>
        )}
        {projects.length === 0 && !warningFor('projects') && (
          <p className="empty-hint">No projects extracted. Click &quot;+ Add Project&quot; to add one.</p>
        )}
        {projects.map((proj, i) => (
          <ProjectCard key={i} proj={proj} index={i} onChange={updateProj} onDelete={deleteProj} />
        ))}
      </div>

      {/* Certifications */}
      <div className="review-section">
        <h4 className="section-heading">Certifications</h4>
        <div className="cert-list">
          {certifications.map((c, i) => (
            <div key={i} className="cert-item">
              <span>{c}</span>
              <button type="button" className="btn-icon btn-icon-danger"
                onClick={() => setCerts(certifications.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
        </div>
        <div className="skill-input-row">
          <input
            type="text" value={certInput}
            onChange={(e) => setCI(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addCert(e); }}
            placeholder="e.g. AWS Cloud Practitioner — Amazon, 2024"
          />
          <button type="button" className="btn-secondary" onClick={addCert}>Add</button>
        </div>
      </div>

      <div className="review-actions">
        <button type="button" className="btn-primary" onClick={handleApply} disabled={saving}>
          {saving ? 'Saving...' : 'Confirm & Save Profile'}
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
