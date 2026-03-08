const RESOURCE_MAP = {
  Python: [
    { name: 'CS50P on edX', url: 'https://cs50.harvard.edu/python/', type: 'Course' },
    { name: 'Python.org Official Tutorial', url: 'https://docs.python.org/3/tutorial/', type: 'Docs' },
  ],
  JavaScript: [
    { name: 'The Odin Project', url: 'https://www.theodinproject.com/', type: 'Course' },
    { name: 'MDN JavaScript Guide', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide', type: 'Docs' },
  ],
  React: [
    { name: 'React Official Docs', url: 'https://react.dev/learn', type: 'Docs' },
    { name: 'Scrimba React Course', url: 'https://scrimba.com/learn/learnreact', type: 'Course' },
  ],
  TypeScript: [
    { name: 'TypeScript Handbook', url: 'https://www.typescriptlang.org/docs/handbook/intro.html', type: 'Docs' },
  ],
  'Node.js': [
    { name: 'Node.js Official Docs', url: 'https://nodejs.org/en/docs/guides', type: 'Docs' },
    { name: 'The Odin Project - Node', url: 'https://www.theodinproject.com/paths/full-stack-javascript/courses/nodejs', type: 'Course' },
  ],
  AWS: [
    { name: 'AWS Cloud Practitioner Essentials (free)', url: 'https://explore.skillbuilder.aws/learn/course/134', type: 'Course' },
    { name: 'AWS Free Tier', url: 'https://aws.amazon.com/free/', type: 'Tutorial' },
  ],
  Docker: [
    { name: 'Docker Getting Started', url: 'https://docs.docker.com/get-started/', type: 'Docs' },
    { name: 'Play with Docker', url: 'https://labs.play-with-docker.com/', type: 'Tutorial' },
  ],
  Kubernetes: [
    { name: 'KodeKloud Free Kubernetes Labs', url: 'https://kodekloud.com/courses/kubernetes-for-the-absolute-beginners-hands-on/', type: 'Course' },
    { name: 'Kubernetes Official Tutorial', url: 'https://kubernetes.io/docs/tutorials/', type: 'Docs' },
  ],
  SQL: [
    { name: 'SQLZoo', url: 'https://sqlzoo.net/', type: 'Tutorial' },
    { name: 'Mode SQL Tutorial', url: 'https://mode.com/sql-tutorial/', type: 'Tutorial' },
  ],
  Git: [
    { name: 'Pro Git (free book)', url: 'https://git-scm.com/book/en/v2', type: 'Docs' },
    { name: 'Learn Git Branching', url: 'https://learngitbranching.js.org/', type: 'Tutorial' },
  ],
  Linux: [
    { name: 'Linux Journey', url: 'https://linuxjourney.com/', type: 'Course' },
    { name: 'OverTheWire: Bandit', url: 'https://overthewire.org/wargames/bandit/', type: 'Tutorial' },
  ],
  'Network Security': [
    { name: 'Cybrary Network Security', url: 'https://www.cybrary.it/course/network-security/', type: 'Course' },
    { name: 'SANS Cyber Aces', url: 'https://www.sans.org/cyberaces/', type: 'Course' },
  ],
  SIEM: [
    { name: 'Splunk Free Training', url: 'https://www.splunk.com/en_us/training/free-courses/splunk-fundamentals-1.html', type: 'Course' },
  ],
  Terraform: [
    { name: 'HashiCorp Terraform Tutorials', url: 'https://developer.hashicorp.com/terraform/tutorials', type: 'Tutorial' },
  ],
  'Machine Learning': [
    { name: 'Google ML Crash Course', url: 'https://developers.google.com/machine-learning/crash-course', type: 'Course' },
    { name: 'Fast.ai', url: 'https://www.fast.ai/', type: 'Course' },
  ],
  TensorFlow: [
    { name: 'TensorFlow Tutorials', url: 'https://www.tensorflow.org/tutorials', type: 'Docs' },
  ],
  'Apache Spark': [
    { name: 'Databricks Free Training', url: 'https://customer-academy.databricks.com/', type: 'Course' },
    { name: 'Apache Spark Docs', url: 'https://spark.apache.org/docs/latest/', type: 'Docs' },
  ],
  'CI/CD': [
    { name: 'GitHub Actions Docs', url: 'https://docs.github.com/en/actions', type: 'Docs' },
    { name: 'GitLab CI/CD Tutorial', url: 'https://docs.gitlab.com/ee/ci/quick_start/', type: 'Tutorial' },
  ],
  'Penetration Testing': [
    { name: 'TryHackMe', url: 'https://tryhackme.com/', type: 'Tutorial' },
    { name: 'Hack The Box', url: 'https://www.hackthebox.com/', type: 'Tutorial' },
  ],
  'Data Visualization': [
    { name: 'Tableau Free Training', url: 'https://www.tableau.com/learn/training', type: 'Course' },
  ],
  Statistics: [
    { name: 'Khan Academy Statistics', url: 'https://www.khanacademy.org/math/statistics-probability', type: 'Course' },
  ],
};

const DEFAULT_RESOURCES = [
  { name: 'freeCodeCamp', url: 'https://www.freecodecamp.org/', type: 'Course' },
  { name: 'Coursera (audit free)', url: 'https://www.coursera.org/', type: 'Course' },
];

const PRIORITY_ORDER = ['High', 'High', 'Medium', 'Medium', 'Low'];

function analyzeGapFallback(userSkills, jobSkills) {
  const normalizedUser = userSkills.map((s) => s.toLowerCase().trim());
  const missingSkills = jobSkills.filter(
    (s) => !normalizedUser.includes(s.toLowerCase().trim())
  );

  if (missingSkills.length === 0) {
    return {
      missingSkills: [],
      roadmap: [],
      totalEstimatedWeeks: 0,
      summary:
        'Congratulations! Your skills match all required skills for this role. Consider brushing up on the preferred skills to stand out.',
      isFallback: true,
    };
  }

  let totalWeeks = 0;
  const roadmap = missingSkills.map((skill, idx) => {
    const resources = RESOURCE_MAP[skill] || DEFAULT_RESOURCES;
    const priority = PRIORITY_ORDER[idx] || 'Low';
    const weeks = priority === 'High' ? 6 : priority === 'Medium' ? 4 : 2;
    totalWeeks += weeks;
    return { skill, priority, resources, estimatedWeeks: weeks };
  });

  return {
    missingSkills,
    roadmap,
    totalEstimatedWeeks: totalWeeks,
    summary: `You are missing ${missingSkills.length} skill(s) for this role. Follow the roadmap below to close the gap.`,
    isFallback: true,
  };
}

module.exports = { analyzeGapFallback };
