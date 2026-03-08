const BASE = '/api';

function parseJsonResponse(res, fallbackError) {
  return res.text().then((text) => {
    if (!text) throw new Error('No response from the server. Please try again.');
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error('Something went wrong. Please try again.');
    }
    if (!res.ok) throw new Error(json.error || fallbackError);
    return json;
  });
}

export async function fetchJobs(params = {}) {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`${BASE}/jobs${query ? '?' + query : ''}`);
  return parseJsonResponse(res, 'Failed to fetch jobs');
}

export async function fetchJob(id) {
  const res = await fetch(`${BASE}/jobs/${id}`);
  return parseJsonResponse(res, 'Job not found');
}

export async function fetchProfile() {
  const res = await fetch(`${BASE}/profile`);
  return parseJsonResponse(res, 'Failed to fetch profile');
}

export async function saveProfile(data) {
  const res = await fetch(`${BASE}/profile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return parseJsonResponse(res, 'Failed to save profile');
}

export async function uploadResume(file) {
  const formData = new FormData();
  formData.append('resume', file);
  const res = await fetch(`${BASE}/resume/parse`, {
    method: 'POST',
    body: formData,
  });
  return parseJsonResponse(res, 'Resume parsing failed');
}

export async function reparseResume() {
  const res = await fetch(`${BASE}/resume/reparse`, { method: 'POST' });
  return parseJsonResponse(res, 'Reparse failed');
}

export async function addWorkExperience(data) {
  const res = await fetch(`${BASE}/profile/work-experience`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return parseJsonResponse(res, 'Failed to add work experience');
}

export async function updateWorkExperience(id, data) {
  const res = await fetch(`${BASE}/profile/work-experience/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return parseJsonResponse(res, 'Failed to update work experience');
}

export async function deleteWorkExperience(id) {
  const res = await fetch(`${BASE}/profile/work-experience/${id}`, { method: 'DELETE' });
  return parseJsonResponse(res, 'Failed to delete work experience');
}

export async function addProject(data) {
  const res = await fetch(`${BASE}/profile/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return parseJsonResponse(res, 'Failed to add project');
}

export async function updateProject(id, data) {
  const res = await fetch(`${BASE}/profile/projects/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return parseJsonResponse(res, 'Failed to update project');
}

export async function deleteProject(id) {
  const res = await fetch(`${BASE}/profile/projects/${id}`, { method: 'DELETE' });
  return parseJsonResponse(res, 'Failed to delete project');
}

export async function evaluateResume(resumeText, targetRole) {
  const res = await fetch(`${BASE}/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resumeText, targetRole }),
  });
  return parseJsonResponse(res, 'Evaluation failed');
}

export async function requestDeepGrade(resumeText, targetRole, alignmentResult) {
  const res = await fetch(`${BASE}/evaluate/grade`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resumeText, targetRole, alignmentResult }),
  });
  return parseJsonResponse(res, 'Grading failed');
}

export async function requestAgentRecommendations(targetRole, missingCategories, alignmentScore) {
  const res = await fetch(`${BASE}/evaluate/agent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetRole, missingCategories, alignmentScore }),
  });
  return parseJsonResponse(res, 'Agent failed');
}

export async function fetchDashboard(userSkills, targetRole) {
  const res = await fetch(`${BASE}/dashboard`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userSkills, targetRole }),
  });
  return parseJsonResponse(res, 'Dashboard analysis failed');
}

export async function analyzeGap(userSkills, jobSkills, jobTitle) {
  const res = await fetch(`${BASE}/gap-analysis`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userSkills, jobSkills, jobTitle }),
  });
  return parseJsonResponse(res, 'Gap analysis failed');
}
