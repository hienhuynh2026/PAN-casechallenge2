const path = require('path');
const jobs = require(path.join(__dirname, '../../data/sample_jobs.json'));

function getAllJobs(req, res) {
  const { search, skill, level } = req.query;
  let results = [...jobs];

  if (search) {
    const q = search.toLowerCase();
    results = results.filter(
      (j) =>
        j.title.toLowerCase().includes(q) ||
        j.company.toLowerCase().includes(q) ||
        j.description.toLowerCase().includes(q)
    );
  }

  if (skill) {
    const s = skill.toLowerCase();
    results = results.filter(
      (j) =>
        j.requiredSkills.some((sk) => sk.toLowerCase().includes(s)) ||
        j.preferredSkills.some((sk) => sk.toLowerCase().includes(s))
    );
  }

  if (level) {
    results = results.filter(
      (j) => j.experienceLevel.toLowerCase() === level.toLowerCase()
    );
  }

  res.json(results);
}

function getJobById(req, res) {
  const job = jobs.find((j) => j.id === req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json(job);
}

module.exports = { getAllJobs, getJobById };
