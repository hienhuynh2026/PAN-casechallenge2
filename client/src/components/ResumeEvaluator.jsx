import { useState, useRef } from 'react';
import { evaluateResume, requestDeepGrade, requestAgentRecommendations } from '../api';
import AlignmentResult from './AlignmentResult';
import GradeResult from './GradeResult';
import GapCloser from './GapCloser';
import RetrievalResult from './RetrievalResult';
import MissingSkillsHelp from './MissingSkillsHelp';
import ScoringMethodBadge from './ScoringMethodBadge';

const ROLE_OPTIONS = [
  'Frontend Developer',
  'Backend Developer',
  'Full Stack Developer',
  'Cloud Engineer',
  'DevOps Engineer',
  'Security Analyst',
  'Cybersecurity Engineer',
  'Cloud Security Engineer',
  'Data Engineer',
  'Data Analyst',
  'Machine Learning Engineer',
  'Site Reliability Engineer',
];

export default function ResumeEvaluator() {
  const [targetRole, setTargetRole] = useState('');
  const [resumeText, setResumeText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [gradeLoading, setGradeLoading] = useState(false);
  const [agentLoading, setAgentLoading] = useState(false);
  const fileInputRef = useRef();

  async function handleEvaluate(e) {
    e.preventDefault();
    if (!targetRole) { setError('Please select a target role.'); return; }
    if (!resumeText.trim()) { setError('Please paste your resume text.'); return; }

    setError('');
    setResult(null);
    setLoading(true);
    try {
      const data = await evaluateResume(resumeText, targetRole);
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRequestGrade() {
    if (!result) return;
    setGradeLoading(true);
    try {
      const data = await requestDeepGrade(resumeText, targetRole, result.alignment);
      setResult((prev) => ({ ...prev, grade: data.grade }));
    } catch (err) {
      setError(err.message);
    } finally {
      setGradeLoading(false);
    }
  }

  async function handleRequestAgent() {
    if (!result) return;
    setAgentLoading(true);
    try {
      const data = await requestAgentRecommendations(
        targetRole,
        result.alignment.missingCategories,
        result.alignment.alignmentScore
      );
      setResult((prev) => ({ ...prev, agent: data.agent }));
    } catch (err) {
      setError(err.message);
    } finally {
      setAgentLoading(false);
    }
  }

  function handleFileLoad(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.name.endsWith('.txt')) {
      setError('Only .txt files are supported for direct load. For PDF, copy-paste the text.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setResumeText(ev.target.result);
      setError('');
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function handleReset() {
    setResult(null);
    setError('');
  }

  return (
    <div>
      {/* Input form */}
      <div className="card">
        <h2>Resume Evaluator</h2>
        <p className="subtitle">
          Select a target role, paste your resume, and get a score showing how well it matches real job postings.
          <br />
          <span className="eval-pipeline-hint">
            Step 1: rule-based alignment check scores your resume across 7 dimensions (0-100) &rarr; Step 2: semantic retrieval finds the 5 most relevant jobs &rarr; Strong (70+): AI gives line-by-line coaching &rarr; Weak (&lt;55): curated resources to close your gaps &rarr; Borderline (55-69): you can request either.
          </span>
        </p>

        {error && <div className="error-banner">{error}</div>}

        <form onSubmit={handleEvaluate} noValidate>
          <div className="form-group">
            <label htmlFor="eval-role">Target Role *</label>
            <select
              id="eval-role"
              value={targetRole}
              onChange={(e) => { setTargetRole(e.target.value); setResult(null); }}
            >
              <option value="">Select a target role</option>
              {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          <div className="form-group">
            <div className="eval-textarea-label-row">
              <label htmlFor="eval-resume">Resume Text *</label>
              <div className="eval-load-actions">
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Load .txt file
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt"
                  onChange={handleFileLoad}
                  className="file-input-hidden"
                />
              </div>
            </div>
            <textarea
              id="eval-resume"
              className="eval-textarea"
              rows={14}
              value={resumeText}
              onChange={(e) => { setResumeText(e.target.value); setResult(null); }}
              placeholder="Paste your full resume text here (copy from a PDF or .txt file)..."
            />
            <span className="eval-char-count">{resumeText.length} characters</span>
          </div>

          <div className="eval-form-actions">
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Evaluating...' : 'Evaluate Resume'}
            </button>
            {result && (
              <button type="button" className="btn-secondary" onClick={handleReset}>
                Clear Results
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Results */}
      {loading && (
        <div className="card loading-card">
          <div className="spinner" />
          <p>Running alignment check and semantic retrieval...</p>
        </div>
      )}

      {result && !loading && (
        <div>
          {/* Scoring method badge */}
          {result.scoringMethod && (
            <ScoringMethodBadge method={result.scoringMethod} />
          )}

          {/* Section: Alignment */}
          <div className="eval-section-header">
            <span className="eval-section-step">Step 1</span>
            <h3>Resume Alignment Check</h3>
          </div>
          <AlignmentResult
            alignment={result.alignment}
            composite={result.composite}
            onRequestGrade={handleRequestGrade}
            onRequestAgent={handleRequestAgent}
            gradeLoading={gradeLoading}
            agentLoading={agentLoading}
          />

          {/* Section: Retrieval */}
          {result.retrieval && result.retrieval.topJobs && result.retrieval.topJobs.length > 0 && (
            <div>
              <div className="eval-section-header">
                <span className="eval-section-step">Step 2</span>
                <h3>Top Matching Jobs (Semantic Retrieval)</h3>
              </div>
              <RetrievalResult
                retrieval={result.retrieval}
                explainability={result.explainability}
              />
            </div>
          )}

          {/* Missing Skills Help */}
          {result.missingSkillsHelp && result.missingSkillsHelp.length > 0 && (
            <MissingSkillsHelp skills={result.missingSkillsHelp} />
          )}

          {/* LLM Grade */}
          {gradeLoading && (
            <div className="card loading-card">
              <div className="spinner" />
              <p>AI grading your resume...</p>
            </div>
          )}
          {result.grade && !gradeLoading && (
            <div>
              <div className="eval-section-header">
                <span className="eval-section-step">Step 3</span>
                <h3>AI Deep Grade</h3>
              </div>
              <GradeResult grade={result.grade} />
            </div>
          )}

          {/* Agent recommendations */}
          {agentLoading && (
            <div className="card loading-card">
              <div className="spinner" />
              <p>Searching for courses, certifications, and bootcamps...</p>
            </div>
          )}
          {result.agent && !agentLoading && (
            <div>
              <div className="eval-section-header">
                <span className="eval-section-step">Step 3</span>
                <h3>Gap-Closing Plan</h3>
              </div>
              <GapCloser agent={result.agent} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
