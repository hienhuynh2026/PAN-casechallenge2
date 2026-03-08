const Groq = require('groq-sdk');

let client = null;

function getClient() {
  if (!client && process.env.GROQ_API_KEY) {
    client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return client;
}

async function analyzeGapWithAI(userSkills, jobSkills, jobTitle) {
  const groq = getClient();
  if (!groq) {
    throw new Error('GROQ_API_KEY not configured');
  }

  const prompt = `You are a career development advisor. Analyze the skills gap for a candidate applying for a "${jobTitle}" role.

Candidate's current skills: ${userSkills.join(', ')}
Job required skills: ${jobSkills.join(', ')}

Respond with a JSON object (no markdown, just raw JSON) with this exact structure:
{
  "missingSkills": ["skill1", "skill2"],
  "roadmap": [
    {
      "skill": "skill name",
      "priority": "High|Medium|Low",
      "resources": [
        { "name": "Resource Name", "url": "https://example.com", "type": "Course|Docs|Tutorial" }
      ],
      "estimatedWeeks": 4
    }
  ],
  "totalEstimatedWeeks": 10,
  "summary": "Brief encouraging summary"
}

If the candidate already has all required skills, return missingSkills as an empty array and a congratulatory summary.`;

  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    max_tokens: 1500,
  });

  const content = response.choices[0]?.message?.content || '';
  return JSON.parse(content);
}

module.exports = { analyzeGapWithAI };
