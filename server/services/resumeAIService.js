const Groq = require('groq-sdk');

let client = null;

function getClient() {
  if (!client && process.env.GROQ_API_KEY) {
    client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return client;
}

async function extractResumeWithAI(text) {
  const groq = getClient();
  if (!groq) {
    throw new Error('GROQ_API_KEY not configured');
  }

  const prompt = `You are a resume parser. Extract structured information from the resume below.

Return ONLY a raw JSON object (no markdown, no code fences). Use this exact schema:
{
  "name": "Full Name",
  "email": "email@example.com",
  "phone": "phone number or empty string",
  "educationLevel": "one of: High School | Associate Degree | Bachelor's Degree | Master's Degree | PhD | Bootcamp | Self-taught | or empty string",
  "targetRole": "inferred job title based on skills and experience",
  "skills": ["skill1", "skill2"],
  "workExperience": [
    {
      "title": "Job Title",
      "company": "Company Name",
      "location": "City, State or Remote or empty string",
      "startDate": "Mon YYYY or YYYY",
      "endDate": "Mon YYYY or YYYY or Present",
      "bullets": ["Achievement or responsibility 1", "Achievement or responsibility 2"]
    }
  ],
  "projects": [
    {
      "name": "Project Name",
      "technologies": ["tech1", "tech2"],
      "date": "Mon YYYY or date range or empty string",
      "bullets": ["Description 1", "Description 2"]
    }
  ],
  "certifications": ["Certification Name — Issuer, Year"]
}

Rules:
- workExperience: one object per distinct job/role. Most recent first. Include ALL jobs found.
- projects: one object per project. Include ALL projects found.
- skills: individual technical skills only (e.g. "React", not "React framework").
- certifications: each certification as a single string.
- educationLevel: map the highest degree found to one of the listed values.
- targetRole: infer from skills, experience title, and any stated objective.
- If a field is not found, use empty string or empty array.

Resume text:
${text}`;

  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
    max_tokens: 2500,
  });

  const content = response.choices[0]?.message?.content || '';
  // Strip accidental markdown code fences
  const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  return JSON.parse(cleaned);
}

module.exports = { extractResumeWithAI };
