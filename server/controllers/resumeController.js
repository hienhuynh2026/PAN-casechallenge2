const { parseResume } = require('../services/resumeParserService');
const { extractResumeWithAI } = require('../services/resumeAIService');
const db = require('../db/database');

const ALLOWED_TYPES = {
  'text/plain': 'txt',
  'application/pdf': 'pdf',
};

// ─── Normalise parsed data to a consistent shape ──────────────────────────────

function normaliseParsed(parsed) {
  return {
    name:           parsed.name || '',
    email:          parsed.email || '',
    phone:          parsed.phone || '',
    education:      parsed.education || '',
    educationLevel: parsed.educationLevel || '',
    targetRole:     parsed.targetRole || '',
    skills:         Array.isArray(parsed.skills) ? parsed.skills : [],
    workExperience: Array.isArray(parsed.workExperience) ? parsed.workExperience : [],
    projects:       Array.isArray(parsed.projects) ? parsed.projects : [],
    certifications: Array.isArray(parsed.certifications) ? parsed.certifications : [],
  };
}

// ─── Build confidence map ─────────────────────────────────────────────────────
// AI mode: present fields are 'high' (AI extraction succeeded for that field).
// Rule-based mode: use the parser's own confidence (regex fields → 'high';
// structured arrays → 'medium' when found; role always 'low').

function buildConfidence(parsed, parseMode, parserConfidence) {
  if (parseMode === 'ai') {
    const present = (v) => v && (Array.isArray(v) ? v.length > 0 : String(v).length > 0);
    return {
      name:           present(parsed.name)           ? 'high' : 'low',
      email:          present(parsed.email)          ? 'high' : 'low',
      phone:          present(parsed.phone)          ? 'high' : 'low',
      skills:         present(parsed.skills)         ? 'high' : 'low',
      education:      present(parsed.education)      ? 'high' : 'low',
      educationLevel: present(parsed.educationLevel) ? 'high' : 'low',
      targetRole:     present(parsed.targetRole)     ? 'high' : 'low',
      workExperience: present(parsed.workExperience) ? 'high' : 'low',
      projects:       present(parsed.projects)       ? 'high' : 'low',
      certifications: present(parsed.certifications) ? 'high' : 'low',
    };
  }
  // Rule-based: fall through to parser-provided confidence
  return parserConfidence || {
    name:           parsed.name           ? 'high'   : 'low',
    email:          parsed.email          ? 'high'   : 'low',
    phone:          parsed.phone          ? 'high'   : 'low',
    skills:         parsed.skills?.length > 0 ? 'high' : 'low',
    education:      parsed.education      ? 'medium' : 'low',
    educationLevel: parsed.educationLevel ? 'medium' : 'low',
    targetRole:     'low',
    workExperience: parsed.workExperience?.length > 0 ? 'medium' : 'low',
    projects:       parsed.projects?.length > 0       ? 'medium' : 'low',
    certifications: parsed.certifications?.length > 0 ? 'medium' : 'low',
  };
}

// ─── Build warnings array ─────────────────────────────────────────────────────
// Returns human-readable, actionable hints for fields the parser could not fill.

function buildWarnings(parsed, confidence) {
  const warnings = [];

  if (confidence.name === 'low') {
    warnings.push({ field: 'name', message: 'Your name could not be detected. Please fill it in manually.' });
  }
  if (confidence.targetRole === 'low') {
    warnings.push({ field: 'targetRole', message: 'Target role could not be inferred. Select the role you are applying for.' });
  }
  if (confidence.skills === 'low') {
    warnings.push({ field: 'skills', message: 'No skills were detected. Add them manually or check that your resume has a Skills section.' });
  }
  if (confidence.workExperience === 'low') {
    warnings.push({ field: 'workExperience', message: 'No work experience entries found. Verify your resume uses a standard heading (e.g. WORK EXPERIENCE, EMPLOYMENT HISTORY).' });
  }
  if (confidence.projects === 'low') {
    warnings.push({ field: 'projects', message: 'No projects section detected. If you have projects, add them manually.' });
  }

  return warnings;
}

async function extractText(file) {
  const { mimetype, buffer } = file;
  if (ALLOWED_TYPES[mimetype] === 'pdf') {
    const { PDFParse } = require('pdf-parse');
    const parser = new PDFParse({ data: buffer });
    await parser.load();
    const result = await parser.getText();
    parser.destroy();
    return result.text || '';
  }
  return buffer.toString('utf-8');
}

// ─── Shared parse + respond logic ─────────────────────────────────────────────

async function parseAndRespond(text, res, persistFullProfile = true) {
  let parsed;
  let parseMode;
  let parserConfidence = null;

  try {
    const aiResult = await extractResumeWithAI(text);
    if (aiResult && typeof aiResult === 'object' && Array.isArray(aiResult.skills)) {
      parsed = normaliseParsed(aiResult);
      parseMode = 'ai';
    } else {
      throw new Error('AI returned invalid structure');
    }
  } catch (err) {
    console.warn('AI resume extraction failed, using rule-based fallback:', err.message);
    const ruleResult = parseResume(text);
    parserConfidence = ruleResult.confidence;   // save before normalise strips it
    parsed = normaliseParsed(ruleResult);
    parseMode = 'rule_based';
  }

  if (persistFullProfile) {
    try {
      db.writeFullProfile(parsed);
    } catch (err) {
      console.warn('Failed to persist parsed profile:', err.message);
    }
  }

  const confidence = buildConfidence(parsed, parseMode, parserConfidence);
  const warnings   = buildWarnings(parsed, confidence);
  const parsedAt   = new Date().toISOString();

  return res.json({
    ...parsed,
    parseMode,
    parsedAt,
    confidence,
    warnings,
    // Keep isFallback for backwards compatibility but derive it from parseMode
    isFallback: parseMode === 'rule_based',
  });
}

// ─── POST /api/resume/parse ───────────────────────────────────────────────────

async function parseResumeUpload(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }

  const { mimetype, size, originalname } = req.file;

  if (!ALLOWED_TYPES[mimetype]) {
    return res.status(400).json({
      error: `Unsupported file type: ${mimetype}. Please upload a .txt or .pdf file.`,
    });
  }
  if (size === 0) {
    return res.status(400).json({ error: 'The uploaded file is empty.' });
  }

  let text = '';
  try {
    text = await extractText(req.file);
  } catch {
    return res.status(400).json({
      error: 'Failed to read file content. Please ensure the file is not corrupted.',
    });
  }

  if (!text.trim()) {
    return res.status(400).json({ error: 'No text content could be extracted from the file.' });
  }

  db.saveResumeUpload(originalname || 'resume', text);
  return parseAndRespond(text, res, true);
}

// ─── POST /api/resume/reparse ─────────────────────────────────────────────────

async function reparseResume(req, res) {
  const stored = db.getLatestRawText();
  if (!stored) {
    return res.status(404).json({ error: 'No resume found. Please upload a resume first.' });
  }

  const { raw_text: text, filename } = stored;
  // Update timestamp to reflect reparse time
  db.saveResumeUpload(filename, text);
  return parseAndRespond(text, res, true);
}

module.exports = { parseResumeUpload, reparseResume };
