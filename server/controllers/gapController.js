const { analyzeGapWithAI } = require('../services/groqService');
const { analyzeGapFallback } = require('../services/fallbackService');

async function analyzeGap(req, res) {
  const { userSkills, jobSkills, jobTitle } = req.body;

  if (!userSkills || !Array.isArray(userSkills) || userSkills.length === 0) {
    return res.status(400).json({ error: 'userSkills array is required.' });
  }
  if (!jobSkills || !Array.isArray(jobSkills) || jobSkills.length === 0) {
    return res.status(400).json({ error: 'jobSkills array is required.' });
  }

  try {
    const result = await analyzeGapWithAI(userSkills, jobSkills, jobTitle || 'the target role');
    res.json({ ...result, isFallback: false });
  } catch (err) {
    console.warn('Groq API unavailable, using fallback:', err.message);
    const fallbackResult = analyzeGapFallback(userSkills, jobSkills);
    res.json(fallbackResult);
  }
}

module.exports = { analyzeGap };
