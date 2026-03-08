/**
 * resumeParserService.js — 4-stage rule-based resume parser
 *
 * Stage 1: Receive raw text (caller extracts from PDF/txt)
 * Stage 2: Segment by section headers into named buckets
 * Stage 3: Parse each section into structured records
 *   - workExperience: [{title, company, location, startDate, endDate, bullets[]}]
 *   - projects:       [{name, technologies[], date, bullets[]}]
 *   - skills:         string[]
 *   - certifications: string[]
 *   - education:      string
 * Stage 4: Validate and normalise (trim, de-dup, handle empty)
 */

const KNOWN_SKILLS = [
  'JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'C#', 'Go', 'Rust', 'Ruby', 'PHP',
  'React', 'Angular', 'Vue', 'Next.js', 'Node.js', 'Express', 'Django', 'Flask', 'Spring Boot',
  'HTML', 'CSS', 'Sass', 'Tailwind', 'Bootstrap',
  'SQL', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'DynamoDB',
  'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Terraform',
  'Git', 'GitHub', 'GitLab', 'CI/CD', 'Jenkins', 'GitHub Actions',
  'Linux', 'Bash',
  'REST', 'GraphQL', 'gRPC',
  'Machine Learning', 'TensorFlow', 'PyTorch', 'Pandas', 'NumPy',
  'Agile', 'Scrum', 'Jira',
  'SIEM', 'Splunk', 'Wireshark', 'Nmap',
  'Penetration Testing', 'Network Security', 'Firewalls',
  'Apache Spark', 'Hadoop', 'Kafka',
  'Tableau', 'Power BI', 'Data Visualization',
  'Statistics', 'R',
];

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const PHONE_REGEX = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;

// Month names for date detection
const MONTHS = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
const DATE_TOKEN = `(?:(?:${MONTHS})\\s+)?\\d{4}`;
const DATE_RANGE_RE = new RegExp(
  `^(${DATE_TOKEN})\\s*[–\\-—]\\s*(${DATE_TOKEN}|present|current|now)`,
  'i'
);
const DATE_RANGE_ANY_RE = new RegExp(
  `(${DATE_TOKEN})\\s*[–\\-—]\\s*(${DATE_TOKEN}|present|current|now)`,
  'i'
);
const COMPANY_SUFFIX_TOKENS = new Set([
  'llc', 'llp', 'inc', 'corp', 'co', 'company', 'group', 'labs', 'technologies', 'tech', 'systems',
]);

const SECTION_HEADERS = {
  summary:        /^(?:summary|objective|about|profile|professional summary|career summary)\b/i,
  education:      /^(?:education|academic|qualifications?|degree)\b/i,
  experience:     /^(?:(?:work\s+)?experiences?|employment|work\s+history|professional\s+experiences?|positions?)\b/i,
  skills:         /^(?:(?:technical\s+)?skills|core\s+(?:skills|competencies)|competencies|technologies|tech\s+stack|tools)\b/i,
  projects:       /^(?:projects?|personal\s+projects?|notable\s+projects?|key\s+projects?|portfolio|side\s+projects?)\b/i,
  certifications: /^(?:certifications?|certificates?|licenses?|credentials?|awards?)\b/i,
};

// ─── Stage 2: Section segmentation ───────────────────────────────────────────

function segmentSections(text) {
  const lines = text.split('\n');
  const sections = {};
  let current = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let matched = false;
    if (trimmed.length < 80) {
      for (const [name, pattern] of Object.entries(SECTION_HEADERS)) {
        if (pattern.test(trimmed)) {
          current = name;
          sections[current] = sections[current] || [];
          matched = true;
          break;
        }
      }
    }

    if (!matched && current) {
      sections[current].push(trimmed);
    }
  }

  return sections;
}

// ─── Stage 3a: Parse work experience section ──────────────────────────────────

function parseWorkExperienceLines(lines) {
  const entries = [];
  let current = null;

  const cleanLines = lines.map((l) => l.trim()).filter(Boolean);

  for (let i = 0; i < cleanLines.length; i += 1) {
    const trimmed = cleanLines[i];
    if (!trimmed) continue;

    // Bullet line
    if (/^[-–—•*▪·►]\s/.test(trimmed)) {
      if (current) {
        current.bullets.push(trimmed.replace(/^[-–—•*▪·►]\s+/, '').trim());
      }
      continue;
    }

    // Combined title + date line, e.g. "AI Trainer Feb 2026 – Present"
    // Handles common PDF extraction format where company and location are on a separate line.
    const dateMatch = trimmed.match(DATE_RANGE_ANY_RE);
    if (dateMatch) {
      const [fullRange, start, end] = dateMatch;
      const beforeDate = trimmed.slice(0, trimmed.indexOf(fullRange)).trim();

      if (current) {
        if (!current.title && beforeDate) current.title = beforeDate;
        current.startDate = start.trim();
        current.endDate = end.trim();
      } else {
        current = {
          title: beforeDate,
          company: '',
          location: '',
          startDate: start.trim(),
          endDate: end.trim(),
          bullets: [],
        };
      }
      continue;
    }

    // Company/location line followed by title/date line
    const nextLine = cleanLines[i + 1] || '';
    if (nextLine && DATE_RANGE_ANY_RE.test(nextLine)) {
      const shouldStartNewEntry = !current || current.startDate || current.bullets.length > 0;
      if (!shouldStartNewEntry) continue;

      if (current) entries.push(current);

      let company = trimmed;
      let location = '';

      const remoteMatch = trimmed.match(/^(.*)\s+(remote)$/i);
      const cityStateMatch = trimmed.match(/^(.*?)\s+([A-Za-z]+(?:\s+[A-Za-z]+){0,2},\s*[A-Z]{2})$/);

      if (remoteMatch) {
        company = remoteMatch[1].trim();
        location = remoteMatch[2].trim();
      } else if (cityStateMatch) {
        company = cityStateMatch[1].trim();
        location = cityStateMatch[2].trim();

        // PDF extraction can glue company suffixes into the city chunk
        // (e.g., "Cooley LLP San Francisco, CA"). Shift leading suffix token
        // back to company when detected.
        const commaIdx = location.lastIndexOf(',');
        if (commaIdx > 0) {
          const cityPart = location.slice(0, commaIdx).trim();
          const statePart = location.slice(commaIdx + 1).trim();
          const cityTokens = cityPart.split(/\s+/);
          if (cityTokens.length > 1 && COMPANY_SUFFIX_TOKENS.has(cityTokens[0].toLowerCase())) {
            company = `${company} ${cityTokens[0]}`.trim();
            location = `${cityTokens.slice(1).join(' ')}, ${statePart}`.trim();
          }
        }
      }

      current = {
        title: '',
        company,
        location,
        startDate: '',
        endDate: '',
        bullets: [],
      };
      continue;
    }

    // Location-only line (follows entry header, short, contains comma or keyword)
    if (
      current && !current.startDate && !current.bullets.length &&
      (trimmed.includes(',') || /\b(remote|on-?site|hybrid|san francisco|new york|seattle|boston|austin|chicago|los angeles)\b/i.test(trimmed)) &&
      trimmed.length < 60
    ) {
      current.location = trimmed;
      continue;
    }

    // Entry header: contains em-dash, en-dash, or " - " with content on both sides
    const separatorMatch = trimmed.match(/^(.+?)\s*[—–]\s*(.+)$/) ||
                           trimmed.match(/^(.+?)\s{1,3}-\s{1,3}(.+)$/);
    if (separatorMatch) {
      if (current) entries.push(current);
      const [, left, right] = separatorMatch;
      current = {
        title: left.trim(),
        company: right.trim(),
        location: '',
        startDate: '',
        endDate: '',
        bullets: [],
      };
      continue;
    }

    // Fallback: standalone non-bullet line (e.g. company-only header)
    if (current && current.startDate && !current.bullets.length && trimmed.length < 80) {
      // Could be a secondary line — ignore (already captured in title/company)
    }
  }

  if (current) entries.push(current);
  return entries;
}

// ─── Stage 3b: Parse projects section ────────────────────────────────────────

function parseProjectLines(lines) {
  const entries = [];
  let current = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Bullet line
    if (/^[-–—•*▪·►]\s/.test(trimmed)) {
      if (current) {
        current.bullets.push(trimmed.replace(/^[-–—•*▪·►]\s+/, '').trim());
      }
      continue;
    }

    // Date range standalone
    const dateMatch = trimmed.match(DATE_RANGE_RE);
    if (dateMatch && current) {
      current.date = trimmed;
      continue;
    }

    // Technology list line (comma-separated, short, no bullet)
    // Appears after project name, before bullets
    if (current && !current.bullets.length && /,/.test(trimmed) && trimmed.length < 120) {
      const cleaned = trimmed.replace(/^[([{]|[)\]}]$/g, '');
      const techs = cleaned.split(/[,|;]/).map((t) => t.trim()).filter((t) => t.length > 0 && t.length < 30);
      if (techs.length >= 2) {
        current.technologies = techs;
        continue;
      }
    }

    // Project name: extract technologies from parentheses "(React, Node.js)"
    const techInParens = trimmed.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
    if (techInParens && !techInParens[1].match(/^[-–—•*▪·►]/)) {
      if (current) entries.push(current);
      const techs = techInParens[2].split(/[,|;+]/).map((t) => t.trim()).filter(Boolean);
      current = { name: techInParens[1].trim(), technologies: techs, date: '', bullets: [] };
      continue;
    }

    // New project header: non-bullet line, not a date, not obviously a continuation
    if (!trimmed.match(/^[-–—•*▪·►]/) && !dateMatch) {
      if (current) entries.push(current);
      current = { name: trimmed, technologies: [], date: '', bullets: [] };
    }
  }

  if (current) entries.push(current);
  return entries;
}

// ─── Stage 3c: Parse skills section ──────────────────────────────────────────

function parseSkillLines(lines) {
  const skills = [];
  for (const line of lines) {
    let content = line.replace(/^[-–—•*▪·►]\s*/, '');
    // Strip "Category: " prefix (e.g. "Languages: JavaScript, Python")
    content = content.replace(/^[\w\s&/()]+:\s*/, '');
    const parts = content.split(/[,|;]\s*/);
    for (const part of parts) {
      const s = part.trim();
      if (s && s.length > 0 && s.length < 50) skills.push(s);
    }
  }
  return skills;
}

function scanForKnownSkills(text) {
  const found = [];
  for (const skill of KNOWN_SKILLS) {
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(text)) {
      found.push(skill);
    }
  }
  return found;
}

// ─── Stage 3d: Parse certifications ──────────────────────────────────────────

function parseCertLines(lines) {
  return lines
    .map((l) => l.replace(/^[-–—•*▪·►]\s*/, '').trim())
    .filter((l) => l.length > 0);
}

// ─── Stage 4: Validate and normalise ─────────────────────────────────────────

function dedup(arr) {
  const seen = new Set();
  return arr.filter((s) => {
    const k = s.toLowerCase().trim();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function extractName(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const first = lines[0] || '';
  if (EMAIL_REGEX.test(first) || PHONE_REGEX.test(first)) return '';
  for (const pattern of Object.values(SECTION_HEADERS)) {
    if (pattern.test(first)) return '';
  }
  const wordCount = first.split(/\s+/).length;
  if (wordCount >= 2 && wordCount <= 5 && first.length <= 60 && !first.includes('.')) {
    return first.replace(/[|,].*$/, '').trim();
  }
  return '';
}

// ─── Stage 4b: Infer education level from raw education text ─────────────────

function inferEducationLevel(text) {
  if (!text) return '';
  if (/ph\.?d|doctor/i.test(text)) return 'PhD';
  if (/master|m\.s\.|m\.eng|mba/i.test(text)) return "Master's Degree";
  if (/bachelor|b\.s\.|b\.a\.|b\.eng/i.test(text)) return "Bachelor's Degree";
  if (/associate/i.test(text)) return 'Associate Degree';
  if (/bootcamp|boot\s*camp/i.test(text)) return 'Bootcamp';
  if (/self.?taught|autodidact/i.test(text)) return 'Self-taught';
  if (/high\s*school|secondary/i.test(text)) return 'High School';
  return '';
}

// ─── Main export ──────────────────────────────────────────────────────────────

function parseResume(text) {
  // Stage 2
  const sections = segmentSections(text);

  // Stage 3
  const workExperience = parseWorkExperienceLines(sections.experience || []);
  const projects = parseProjectLines(sections.projects || []);

  let skills = parseSkillLines(sections.skills || []);
  const scanned = scanForKnownSkills(text);
  skills = dedup([...skills, ...scanned]);

  const certifications = parseCertLines(sections.certifications || []);
  const education = (sections.education || []).join('\n').trim();

  // Stage 4
  const name = extractName(text);
  const email = (text.match(EMAIL_REGEX) || [])[0] || '';
  const phone = (text.match(PHONE_REGEX) || [])[0] || '';
  const educationLevel = inferEducationLevel(education);

  return {
    name,
    email,
    phone,
    education,
    educationLevel,
    skills,
    workExperience,
    projects,
    certifications,
    targetRole: '',
    confidence: {
      name: name ? 'high' : 'low',
      email: email ? 'high' : 'low',
      phone: phone ? 'high' : 'low',
      skills: skills.length > 0 ? 'high' : 'low',
      education: education ? 'medium' : 'low',
      educationLevel: educationLevel ? 'medium' : 'low',
      workExperience: workExperience.length > 0 ? 'medium' : 'low',
      projects: projects.length > 0 ? 'medium' : 'low',
      certifications: certifications.length > 0 ? 'medium' : 'low',
      targetRole: 'low',
    },
  };
}

module.exports = { parseResume, parseWorkExperienceLines, parseProjectLines, inferEducationLevel };
