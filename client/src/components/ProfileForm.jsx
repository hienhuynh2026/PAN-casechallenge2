import { useState, useEffect } from 'react';
import {
  saveProfile, reparseResume,
  addWorkExperience, updateWorkExperience, deleteWorkExperience,
  addProject, updateProject, deleteProject,
} from '../api';
import ResumeUpload from './ResumeUpload';
import ResumeReview from './ResumeReview';

const EDUCATION_OPTIONS = [
  'High School', 'Associate Degree', "Bachelor's Degree",
  "Master's Degree", 'PhD', 'Bootcamp', 'Self-taught',
];
const ROLE_OPTIONS = [
  'Frontend Developer', 'Backend Developer', 'Full Stack Developer',
  'Cloud Engineer', 'DevOps Engineer', 'Security Analyst',
  'Cybersecurity Engineer', 'Cloud Security Engineer', 'Data Engineer',
  'Data Analyst', 'Machine Learning Engineer', 'Site Reliability Engineer',
];

// ─── Entry cards ──────────────────────────────────────────────────────────────

function ExpCard({ exp, onSave, onDelete }) {
  const [editing, setEditing] = useState(!exp.id); // new entries open immediately
  const [form, setForm] = useState({ ...exp });
  const [saving, setSaving] = useState(false);

  function update(key, val) { setForm((f) => ({ ...f, [key]: val })); }

  function updateBullet(i, val) {
    const bullets = [...(form.bullets || [])];
    bullets[i] = val;
    update('bullets', bullets);
  }
  function addBullet() { update('bullets', [...(form.bullets || []), '']); }
  function deleteBullet(i) { update('bullets', (form.bullets || []).filter((_, j) => j !== i)); }

  async function handleSave() {
    setSaving(true);
    try {
      const clean = { ...form, bullets: (form.bullets || []).filter((b) => b.trim()) };
      await onSave(exp.id, clean);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="entry-card">
        <div className="entry-card-header">
          <div className="entry-card-title">
            <strong>{exp.title || 'Untitled'}</strong>
            {exp.company && <span className="entry-card-company"> — {exp.company}</span>}
            {exp.location && <span className="entry-card-meta"> · {exp.location}</span>}
            {(exp.startDate || exp.endDate) && (
              <span className="entry-card-dates"> · {exp.startDate}{exp.endDate ? ` – ${exp.endDate}` : ''}</span>
            )}
          </div>
          <div className="entry-card-actions">
            <button type="button" className="btn-icon" onClick={() => { setForm({ ...exp }); setEditing(true); }}>Edit</button>
            <button type="button" className="btn-icon btn-icon-danger" onClick={() => onDelete(exp.id)}>Delete</button>
          </div>
        </div>
        {(exp.bullets || []).length > 0 && (
          <ul className="entry-bullets-preview">
            {(exp.bullets || []).map((b, i) => <li key={i}>{b}</li>)}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="entry-card entry-card-editing">
      <div className="entry-row-2">
        <div className="form-group">
          <label>Job Title</label>
          <input type="text" value={form.title || ''} onChange={(e) => update('title', e.target.value)} placeholder="Software Engineer" />
        </div>
        <div className="form-group">
          <label>Company</label>
          <input type="text" value={form.company || ''} onChange={(e) => update('company', e.target.value)} placeholder="Acme Corp" />
        </div>
      </div>
      <div className="entry-row-3">
        <div className="form-group">
          <label>Location</label>
          <input type="text" value={form.location || ''} onChange={(e) => update('location', e.target.value)} placeholder="City, State or Remote" />
        </div>
        <div className="form-group">
          <label>Start Date</label>
          <input type="text" value={form.startDate || ''} onChange={(e) => update('startDate', e.target.value)} placeholder="Jan 2024" />
        </div>
        <div className="form-group">
          <label>End Date</label>
          <input type="text" value={form.endDate || ''} onChange={(e) => update('endDate', e.target.value)} placeholder="Jun 2024 or Present" />
        </div>
      </div>
      <div className="form-group">
        <label>Bullet Points</label>
        {(form.bullets || []).map((b, i) => (
          <div key={i} className="bullet-row">
            <input type="text" value={b} onChange={(e) => updateBullet(i, e.target.value)} placeholder="Key achievement or responsibility" />
            <button type="button" className="btn-icon btn-icon-danger" onClick={() => deleteBullet(i)}>×</button>
          </div>
        ))}
        <button type="button" className="btn-add-bullet" onClick={addBullet}>+ Add bullet</button>
      </div>
      <div className="entry-edit-footer">
        <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </button>
        {exp.id && (
          <button type="button" className="btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
        )}
      </div>
    </div>
  );
}

function ProjectCard({ proj, onSave, onDelete }) {
  const [editing, setEditing] = useState(!proj.id);
  const [form, setForm] = useState({ ...proj });
  const [saving, setSaving] = useState(false);

  function update(key, val) { setForm((f) => ({ ...f, [key]: val })); }
  function updateBullet(i, val) {
    const bullets = [...(form.bullets || [])];
    bullets[i] = val;
    update('bullets', bullets);
  }
  function addBullet() { update('bullets', [...(form.bullets || []), '']); }
  function deleteBullet(i) { update('bullets', (form.bullets || []).filter((_, j) => j !== i)); }

  async function handleSave() {
    setSaving(true);
    try {
      const clean = {
        ...form,
        bullets: (form.bullets || []).filter((b) => b.trim()),
        technologies: Array.isArray(form.technologies) ? form.technologies : [],
      };
      await onSave(proj.id, clean);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="entry-card">
        <div className="entry-card-header">
          <div className="entry-card-title">
            <strong>{proj.name || 'Untitled'}</strong>
            {(proj.technologies || []).length > 0 && (
              <span className="entry-card-tech"> · {proj.technologies.slice(0, 4).join(', ')}</span>
            )}
            {proj.date && <span className="entry-card-dates"> · {proj.date}</span>}
          </div>
          <div className="entry-card-actions">
            <button type="button" className="btn-icon" onClick={() => { setForm({ ...proj }); setEditing(true); }}>Edit</button>
            <button type="button" className="btn-icon btn-icon-danger" onClick={() => onDelete(proj.id)}>Delete</button>
          </div>
        </div>
        {(proj.bullets || []).length > 0 && (
          <ul className="entry-bullets-preview">
            {(proj.bullets || []).map((b, i) => <li key={i}>{b}</li>)}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="entry-card entry-card-editing">
      <div className="entry-row-2">
        <div className="form-group">
          <label>Project Name</label>
          <input type="text" value={form.name || ''} onChange={(e) => update('name', e.target.value)} placeholder="My Project" />
        </div>
        <div className="form-group">
          <label>Date</label>
          <input type="text" value={form.date || ''} onChange={(e) => update('date', e.target.value)} placeholder="Jan 2025" />
        </div>
      </div>
      <div className="form-group">
        <label>Technologies (comma-separated)</label>
        <input
          type="text"
          value={(form.technologies || []).join(', ')}
          onChange={(e) => update('technologies', e.target.value.split(',').map((t) => t.trim()).filter(Boolean))}
          placeholder="React, Node.js, PostgreSQL"
        />
      </div>
      <div className="form-group">
        <label>Bullet Points</label>
        {(form.bullets || []).map((b, i) => (
          <div key={i} className="bullet-row">
            <input type="text" value={b} onChange={(e) => updateBullet(i, e.target.value)} placeholder="What you built / achieved" />
            <button type="button" className="btn-icon btn-icon-danger" onClick={() => deleteBullet(i)}>×</button>
          </div>
        ))}
        <button type="button" className="btn-add-bullet" onClick={addBullet}>+ Add bullet</button>
      </div>
      <div className="entry-edit-footer">
        <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </button>
        {proj.id && (
          <button type="button" className="btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
        )}
      </div>
    </div>
  );
}

// ─── Main profile page ────────────────────────────────────────────────────────

export default function ProfileForm({ profile, onSaved }) {
  const [name, setName] = useState('');
  const [skills, setSkills] = useState([]);
  const [skillInput, setSkillInput] = useState('');
  const [educationLevel, setEducationLevel] = useState('');
  const [targetRole, setTargetRole] = useState('');
  const [workExperience, setWorkExperience] = useState([]);
  const [projects, setProjects] = useState([]);
  const [certifications, setCertifications] = useState([]);
  const [certInput, setCertInput] = useState('');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [resumeStep, setResumeStep] = useState('none'); // 'none' | 'upload' | 'review'
  const [resumeData, setResumeData] = useState(null);
  const [reparsing, setReparsing] = useState(false);

  useEffect(() => {
    if (profile) {
      setName(profile.name || '');
      setSkills(profile.skills || []);
      setEducationLevel(profile.educationLevel || '');
      setTargetRole(profile.targetRole || '');
      setWorkExperience((profile.workExperience || []).map((e) => ({ ...e, bullets: e.bullets || [] })));
      setProjects((profile.projects || []).map((p) => ({ ...p, bullets: p.bullets || [], technologies: p.technologies || [] })));
      setCertifications(profile.certifications || []);
    }
  }, [profile]);

  // ── Skills
  function addSkill(e) {
    e?.preventDefault();
    const s = skillInput.trim();
    if (s && !skills.includes(s)) setSkills([...skills, s]);
    setSkillInput('');
  }
  function removeSkill(s) { setSkills(skills.filter((x) => x !== s)); }

  // ── Certifications
  function addCert(e) {
    e?.preventDefault();
    const c = certInput.trim();
    if (c) setCertifications([...certifications, c]);
    setCertInput('');
  }
  function removeCert(i) { setCertifications(certifications.filter((_, j) => j !== i)); }

  // ── Work experience CRUD
  async function handleExpSave(id, data) {
    if (id) {
      await updateWorkExperience(id, data);
      setWorkExperience((prev) => prev.map((e) => (e.id === id ? { ...e, ...data } : e)));
    } else {
      const result = await addWorkExperience(data);
      setWorkExperience((prev) => prev.map((e) => (!e.id ? { ...result, ...data } : e)));
    }
  }
  async function handleExpDelete(id) {
    if (id) await deleteWorkExperience(id);
    setWorkExperience((prev) => prev.filter((e) => e.id !== id));
  }
  function addNewExp() {
    setWorkExperience((prev) => [
      ...prev,
      { title: '', company: '', location: '', startDate: '', endDate: '', bullets: [] },
    ]);
  }

  // ── Projects CRUD
  async function handleProjSave(id, data) {
    if (id) {
      await updateProject(id, data);
      setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, ...data } : p)));
    } else {
      const result = await addProject(data);
      setProjects((prev) => prev.map((p) => (!p.id ? { ...result, ...data } : p)));
    }
  }
  async function handleProjDelete(id) {
    if (id) await deleteProject(id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
  }
  function addNewProj() {
    setProjects((prev) => [
      ...prev,
      { name: '', technologies: [], date: '', bullets: [] },
    ]);
  }

  // ── Resume upload/reparse flow
  function handleResumeParsed(data) {
    setResumeData(data);
    setResumeStep('review');
  }

  function handleResumeApply() {
    // Data already saved to SQLite by the review form — just reload profile
    setResumeStep('none');
    setResumeData(null);
    setSuccessMsg('Resume data saved. Reloading your profile...');
    onSaved(null); // trigger parent re-fetch
  }

  async function handleReparse() {
    setReparsing(true);
    setSuccessMsg('');
    try {
      const data = await reparseResume();
      setResumeData(data);
      setResumeStep('review');
    } catch (err) {
      setErrors({ reparse: err.message });
    } finally {
      setReparsing(false);
    }
  }

  // ── Core profile save
  function validate() {
    const errs = {};
    if (!name.trim()) errs.name = 'Name is required.';
    if (skills.length === 0) errs.skills = 'At least one skill is required.';
    if (!targetRole) errs.targetRole = 'Target role is required.';
    return errs;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setErrors({});
    setSaving(true);
    setSuccessMsg('');
    try {
      const saved = await saveProfile({
        name, skills, educationLevel, targetRole,
        workExperience, projects, certifications,
      });
      setSuccessMsg('Profile saved!');
      onSaved(saved);
    } catch (err) {
      setErrors({ submit: err.message });
    } finally {
      setSaving(false);
    }
  }

  function handleClearAllFields() {
    const confirmed = window.confirm(
      'Clear all profile fields on this page? This only clears the form until you save.'
    );
    if (!confirmed) return;

    setName('');
    setSkills([]);
    setSkillInput('');
    setEducationLevel('');
    setTargetRole('');
    setWorkExperience([]);
    setProjects([]);
    setCertifications([]);
    setCertInput('');
    setErrors({});
    setSuccessMsg('Form cleared. Upload a new resume or enter fresh profile details.');
  }

  // ── Upload flow
  if (resumeStep === 'upload') {
    return (
      <div className="card">
        <ResumeUpload onParsed={handleResumeParsed} onCancel={() => setResumeStep('none')} />
      </div>
    );
  }

  if (resumeStep === 'review') {
    return (
      <div className="card">
        <ResumeReview
          data={resumeData}
          onApply={handleResumeApply}
          onCancel={() => setResumeStep('none')}
        />
      </div>
    );
  }

  // ── Main profile page
  return (
    <div className="profile-page">
      {/* ── Resume panel ─────────────────────────── */}
      <div className="resume-panel">
        <div className="resume-panel-info">
          {profile?.resumeMeta ? (
            <>
              <span className="resume-filename">{profile.resumeMeta.filename}</span>
              <span className="resume-date">
                Last parsed: {new Date(profile.resumeMeta.uploaded_at).toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric', year: 'numeric',
                })}
              </span>
            </>
          ) : (
            <span className="resume-filename-empty">No resume uploaded yet</span>
          )}
        </div>
        <div className="resume-panel-actions">
          <button type="button" className="btn-secondary" onClick={() => setResumeStep('upload')}>
            Upload Resume
          </button>
          {profile?.resumeMeta && (
            <button type="button" className="btn-secondary" onClick={handleReparse} disabled={reparsing}>
              {reparsing ? 'Reparsing...' : 'Reparse Resume'}
            </button>
          )}
        </div>
      </div>

      {errors.reparse && <div className="error-banner">{errors.reparse}</div>}
      {errors.submit && <div className="error-banner">{errors.submit}</div>}
      {successMsg && <div className="success-banner">{successMsg}</div>}

      <form onSubmit={handleSubmit} noValidate>

        {/* ── Basic info ────────────────────────── */}
        <div className="profile-section card">
          <h3 className="section-heading">{profile ? 'Edit Profile' : 'Create Your Profile'}</h3>
          <div className="entry-row-3">
            <div className="form-group">
              <label htmlFor="name">Full Name *</label>
              <input
                id="name" type="text" value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
              />
              {errors.name && <span className="field-error">{errors.name}</span>}
            </div>
            <div className="form-group">
              <label htmlFor="targetRole">Target Role *</label>
              <select id="targetRole" value={targetRole} onChange={(e) => setTargetRole(e.target.value)}>
                <option value="">Select a target role</option>
                {ROLE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
              {errors.targetRole && <span className="field-error">{errors.targetRole}</span>}
            </div>
            <div className="form-group">
              <label htmlFor="education">Education Level</label>
              <select id="education" value={educationLevel} onChange={(e) => setEducationLevel(e.target.value)}>
                <option value="">Select education level</option>
                {EDUCATION_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* ── Skills ───────────────────────────── */}
        <div className="profile-section card">
          <h3 className="section-heading">Skills {skills.length === 0 && '*'}</h3>
          <div className="skill-input-row">
            <input
              type="text" value={skillInput}
              onChange={(e) => setSkillInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addSkill(e); }}
              placeholder="Type a skill and press Enter"
            />
            <button type="button" className="btn-secondary" onClick={addSkill}>Add</button>
          </div>
          {skills.length > 0 ? (
            <div className="skill-tags">
              {skills.map((s) => (
                <span key={s} className="skill-tag">
                  {s}
                  <button type="button" onClick={() => removeSkill(s)} aria-label={`Remove ${s}`}>&times;</button>
                </span>
              ))}
            </div>
          ) : (
            <p className="field-hint">Upload a resume to extract skills, or add them manually.</p>
          )}
          {errors.skills && <span className="field-error">{errors.skills}</span>}
        </div>

        {/* ── Work Experience ───────────────────── */}
        <div className="profile-section card">
          <div className="section-heading-row">
            <h3 className="section-heading">Work Experience</h3>
            <button type="button" className="btn-add" onClick={addNewExp}>+ Add Entry</button>
          </div>
          {workExperience.length === 0 && (
            <p className="field-hint">Upload a resume to auto-fill, or add entries manually.</p>
          )}
          {workExperience.map((exp, i) => (
            <ExpCard
              key={exp.id ?? `new-${i}`}
              exp={exp}
              onSave={handleExpSave}
              onDelete={handleExpDelete}
            />
          ))}
        </div>

        {/* ── Projects ──────────────────────────── */}
        <div className="profile-section card">
          <div className="section-heading-row">
            <h3 className="section-heading">Projects</h3>
            <button type="button" className="btn-add" onClick={addNewProj}>+ Add Project</button>
          </div>
          {projects.length === 0 && (
            <p className="field-hint">Upload a resume to auto-fill, or add projects manually.</p>
          )}
          {projects.map((proj, i) => (
            <ProjectCard
              key={proj.id ?? `new-proj-${i}`}
              proj={proj}
              onSave={handleProjSave}
              onDelete={handleProjDelete}
            />
          ))}
        </div>

        {/* ── Certifications ────────────────────── */}
        <div className="profile-section card">
          <h3 className="section-heading">Certifications</h3>
          <div className="cert-list">
            {certifications.map((c, i) => (
              <div key={i} className="cert-item">
                <span>{c}</span>
                <button type="button" className="btn-icon btn-icon-danger" onClick={() => removeCert(i)}>×</button>
              </div>
            ))}
          </div>
          <div className="skill-input-row">
            <input
              type="text" value={certInput}
              onChange={(e) => setCertInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addCert(e); }}
              placeholder="e.g. AWS Cloud Practitioner — Amazon, 2024"
            />
            <button type="button" className="btn-secondary" onClick={addCert}>Add</button>
          </div>
        </div>

        <div className="profile-save-row">
          <button
            type="button"
            className="btn-secondary btn-danger-outline"
            onClick={handleClearAllFields}
            disabled={saving}
          >
            Clear All Fields
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving...' : profile ? 'Save Changes' : 'Create Profile & Browse Jobs'}
          </button>
        </div>
      </form>
    </div>
  );
}
