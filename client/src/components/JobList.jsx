import { useState, useEffect, useCallback } from 'react';
import { fetchJobs } from '../api';

const LEVELS = ['', 'Entry', 'Mid', 'Senior'];

export default function JobList({ profile, onSelectJob }) {
  const [jobs, setJobs] = useState([]);
  const [search, setSearch] = useState('');
  const [skill, setSkill] = useState('');
  const [level, setLevel] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadJobs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (search) params.search = search;
      if (skill) params.skill = skill;
      if (level) params.level = level;
      const data = await fetchJobs(params);
      setJobs(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [search, skill, level]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  function matchCount(job) {
    const userSkills = profile.skills.map((s) => s.toLowerCase());
    return job.requiredSkills.filter((s) => userSkills.includes(s.toLowerCase())).length;
  }

  function matchPercent(job) {
    if (!job.requiredSkills.length) return 100;
    return Math.round((matchCount(job) / job.requiredSkills.length) * 100);
  }

  return (
    <div>
      <div className="card">
        <h2>Job Postings</h2>
        <p className="subtitle">
          Logged in as <strong>{profile.name}</strong> &mdash; targeting{' '}
          <strong>{profile.targetRole}</strong>
        </p>

        <div className="filter-row">
          <input
            type="text"
            placeholder="Search by title, company, or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <input
            type="text"
            placeholder="Filter by skill..."
            value={skill}
            onChange={(e) => setSkill(e.target.value)}
          />
          <select value={level} onChange={(e) => setLevel(e.target.value)}>
            {LEVELS.map((l) => (
              <option key={l} value={l}>{l || 'All Levels'}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <div className="loading">Loading jobs...</div>
      ) : jobs.length === 0 ? (
        <div className="card"><p>No jobs found matching your filters.</p></div>
      ) : (
        <div className="job-grid">
          {jobs.map((job) => {
            const pct = matchPercent(job);
            return (
              <div key={job.id} className="job-card">
                <div className="job-header">
                  <div>
                    <h3 className="job-title">{job.title}</h3>
                    <span className="job-company">{job.company}</span>
                  </div>
                  <span className={`level-badge level-${job.experienceLevel.toLowerCase()}`}>
                    {job.experienceLevel}
                  </span>
                </div>

                <p className="job-description">{job.description}</p>

                <div className="skills-section">
                  <div className="skills-label">Required Skills</div>
                  <div className="skill-tags small">
                    {job.requiredSkills.map((s) => {
                      const has = profile.skills.map((p) => p.toLowerCase()).includes(s.toLowerCase());
                      return (
                        <span key={s} className={`skill-tag ${has ? 'has-skill' : 'missing-skill'}`}>
                          {s}
                        </span>
                      );
                    })}
                  </div>
                </div>

                <div className="match-bar-container">
                  <div className="match-bar-label">
                    Skills match: <strong>{pct}%</strong> ({matchCount(job)}/{job.requiredSkills.length})
                  </div>
                  <div className="match-bar-track">
                    <div
                      className="match-bar-fill"
                      style={{ width: `${pct}%`, backgroundColor: pct >= 80 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444' }}
                    />
                  </div>
                </div>

                <button className="btn-primary full-width" onClick={() => onSelectJob(job)}>
                  Analyze Skills Gap
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
