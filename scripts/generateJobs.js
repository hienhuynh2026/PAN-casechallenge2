const COMPANIES = [
  'Acme Corp','Horizon Tech','Nimbus Systems','Pipeline Inc','Sentinel Security',
  'DataFlow Analytics','LaunchPad Ventures','Uptime Solutions','Cortex AI','FortiNet Labs',
  'CloudGuard Inc','Insight Analytics','NovaTech','Quantum Solutions','StackBridge',
  'ByteForge','Hyperion Cloud','Nexus Digital','Apex Software','ZeroDay Security',
  'MetaScale','Stratosphere Systems','PulseDev','CoreLogic','InfraVault',
  'DataNexus','Vertex Labs','CipherTech','ElasticOps','TerraformIO',
  'NetShield','DeepSight AI','FlowState','SkyNet Cloud','CodePath',
  'BrightData','OmniStack','SecureLayer','CloudFront Labs','ScaleMind',
];

const LEVELS = ['Entry', 'Mid', 'Senior'];

const ROLE_CONFIGS = {
  'Frontend Developer': {
    core: ['JavaScript', 'React', 'HTML', 'CSS'],
    variable: ['TypeScript','Vue','Angular','Next.js','Redux','Webpack','Jest','Sass','Tailwind','REST APIs','GraphQL','Git','Figma','Accessibility','Storybook','Vite'],
    preferred: ['TypeScript','Next.js','GraphQL','Jest','Storybook','Figma','Sass','Tailwind','Webpack','Performance Optimization'],
    descriptions: [
      'Build responsive web interfaces and collaborate with backend engineers to deliver high-quality user experiences.',
      'Develop and maintain modern frontend applications using component-based architecture and design systems.',
      'Create pixel-perfect, accessible UIs from design mockups and ensure cross-browser compatibility.',
      'Lead frontend development efforts, mentor junior developers, and champion best practices in code quality.',
      'Build performant single-page applications with real-time data visualization and interactive dashboards.',
    ],
    count: 10,
  },
  'Backend Developer': {
    core: ['Node.js', 'JavaScript', 'REST APIs', 'SQL'],
    variable: ['TypeScript','Python','Java','Docker','PostgreSQL','MongoDB','Redis','Express','GraphQL','Git','Microservices','RabbitMQ','Kafka','AWS'],
    preferred: ['TypeScript','Docker','PostgreSQL','Redis','Microservices','Kafka','GraphQL','Kubernetes','CI/CD','Monitoring'],
    descriptions: [
      'Design and maintain server-side applications and APIs that power our platform services.',
      'Build scalable microservices and event-driven architectures to handle millions of requests per day.',
      'Develop robust backend systems with a focus on security, performance, and reliability.',
      'Create and optimize database schemas, API endpoints, and background job processing systems.',
      'Architect distributed backend services that integrate with third-party APIs and message queues.',
    ],
    count: 9,
  },
  'Full Stack Developer': {
    core: ['JavaScript', 'React', 'Node.js'],
    variable: ['TypeScript','Python','SQL','MongoDB','PostgreSQL','Docker','Git','REST APIs','HTML','CSS','Express','Next.js','AWS','GraphQL','Redis','Tailwind'],
    preferred: ['TypeScript','Docker','AWS','Next.js','GraphQL','CI/CD','PostgreSQL','Redis','Kubernetes','Testing'],
    descriptions: [
      'Develop end-to-end features across the entire stack, from database design to pixel-perfect UIs.',
      'Own full product features from concept to deployment, working across frontend and backend systems.',
      'Build and ship user-facing features rapidly in a fast-paced startup environment.',
      'Collaborate with designers and product managers to deliver seamless full-stack experiences.',
      'Maintain and extend a modern web application with both customer-facing and internal admin interfaces.',
    ],
    count: 9,
  },
  'Cloud Engineer': {
    core: ['AWS', 'Linux', 'Python'],
    variable: ['Terraform','Kubernetes','Docker','Networking','Azure','GCP','CI/CD','Git','Bash','Ansible','CloudFormation','Monitoring','IAM','S3','EC2','Lambda'],
    preferred: ['Terraform','Kubernetes','Docker','Ansible','CloudFormation','Monitoring','Prometheus','Grafana','Multi-cloud','Cost Optimization'],
    descriptions: [
      'Architect, deploy, and manage scalable cloud infrastructure on AWS to support growing business needs.',
      'Design and implement cloud-native solutions with high availability and disaster recovery.',
      'Migrate on-premise workloads to the cloud and optimize infrastructure costs across environments.',
      'Build and maintain Infrastructure-as-Code pipelines for repeatable, auditable deployments.',
      'Manage multi-region cloud deployments and implement security best practices across all services.',
    ],
    count: 10,
  },
  'DevOps Engineer': {
    core: ['Docker', 'CI/CD', 'Linux'],
    variable: ['Kubernetes','Terraform','AWS','Azure','Git','Jenkins','GitHub Actions','Ansible','Python','Bash','Monitoring','Prometheus','Grafana','ArgoCD','Helm','Networking'],
    preferred: ['Kubernetes','Terraform','AWS','Prometheus','Grafana','ArgoCD','Helm','GitOps','Incident Response','SLO/SLI'],
    descriptions: [
      'Build and maintain CI/CD pipelines, automate deployments, and improve developer productivity.',
      'Design and operate container orchestration platforms and infrastructure automation systems.',
      'Implement GitOps workflows and ensure reliable, repeatable deployments across environments.',
      'Monitor system health, respond to incidents, and continuously improve infrastructure reliability.',
      'Automate infrastructure provisioning and configuration management across cloud environments.',
    ],
    count: 9,
  },
  'Security Analyst': {
    core: ['Network Security', 'SIEM', 'Linux'],
    variable: ['Splunk','Wireshark','Nmap','Firewalls','Python','Penetration Testing','Risk Assessment','Incident Response','Compliance','Vulnerability Assessment','IDS/IPS','Malware Analysis','TCP/IP'],
    preferred: ['Splunk','Python','Penetration Testing','Incident Response','Compliance','Risk Assessment','OSINT','Threat Intelligence','SOC Operations'],
    descriptions: [
      'Monitor security events, investigate incidents, and maintain SIEM rules and dashboards.',
      'Conduct vulnerability assessments, analyze threats, and recommend security improvements.',
      'Perform security monitoring, log analysis, and incident triage in a 24/7 SOC environment.',
      'Develop and enforce security policies, conduct audits, and ensure regulatory compliance.',
      'Analyze network traffic for anomalies, investigate alerts, and support forensic investigations.',
    ],
    count: 8,
  },
  'Cybersecurity Engineer': {
    core: ['Network Security', 'Linux', 'Python'],
    variable: ['Penetration Testing','SIEM','Splunk','Firewalls','Docker','AWS','Kubernetes','Compliance','Cryptography','IDS/IPS','Vulnerability Assessment','Bash','Terraform','IAM'],
    preferred: ['Penetration Testing','SIEM','AWS','Docker','Cryptography','Compliance','Threat Modeling','Zero Trust','Cloud Security'],
    descriptions: [
      'Design and implement security controls, conduct penetration tests, and harden infrastructure.',
      'Build security automation tools and integrate security into CI/CD pipelines (DevSecOps).',
      'Architect secure cloud environments and implement zero-trust networking principles.',
      'Develop incident response playbooks and lead security breach investigations.',
      'Perform red team exercises and build defensive security tooling for the engineering org.',
    ],
    count: 8,
  },
  'Cloud Security Engineer': {
    core: ['AWS', 'Network Security', 'Linux'],
    variable: ['Terraform','Docker','Kubernetes','IAM','Compliance','SIEM','Python','Azure','GCP','Firewalls','Monitoring','CloudTrail','GuardDuty','Security Hub','Bash'],
    preferred: ['Terraform','Kubernetes','Compliance','IAM','Python','SIEM','CloudTrail','GuardDuty','Multi-cloud','Threat Detection'],
    descriptions: [
      'Secure cloud infrastructure, implement IAM policies, and monitor for security threats.',
      'Design and enforce cloud security architecture across AWS, ensuring compliance with standards.',
      'Build automated security scanning and remediation pipelines for cloud resources.',
      'Conduct cloud security assessments, implement guardrails, and train engineering teams.',
      'Monitor cloud environments using SIEM and native security tools, respond to incidents.',
    ],
    count: 8,
  },
  'Data Engineer': {
    core: ['Python', 'SQL', 'AWS'],
    variable: ['Apache Spark','Kafka','Hadoop','Docker','Airflow','PostgreSQL','MongoDB','Terraform','Redshift','Git','Snowflake','dbt','ETL','Data Modeling','Databricks','S3'],
    preferred: ['Apache Spark','Kafka','Airflow','Snowflake','dbt','Databricks','Data Modeling','Redshift','Streaming','Data Quality'],
    descriptions: [
      'Build and maintain data pipelines that process terabytes of data for analytics and ML teams.',
      'Design data warehouse schemas and ETL workflows to support business intelligence reporting.',
      'Develop real-time streaming data pipelines using Kafka and Spark for low-latency analytics.',
      'Optimize data infrastructure for cost and performance across cloud-based data platforms.',
      'Build reliable, scalable data ingestion systems and ensure data quality across the org.',
    ],
    count: 9,
  },
  'Data Analyst': {
    core: ['SQL', 'Python', 'Statistics'],
    variable: ['Tableau','Power BI','Excel','R','Data Visualization','Pandas','NumPy','A/B Testing','Git','Machine Learning','Looker','dbt','Google Analytics','Jupyter'],
    preferred: ['Tableau','Power BI','A/B Testing','Machine Learning','Looker','R','Google Analytics','Data Storytelling','Dashboard Design'],
    descriptions: [
      'Analyze business data, create dashboards, and present insights to stakeholders.',
      'Design and run A/B tests, track KPIs, and support data-driven decision making.',
      'Build interactive dashboards and self-service analytics tools for product and marketing teams.',
      'Conduct exploratory data analysis, identify trends, and translate findings into recommendations.',
      'Support cross-functional teams with ad-hoc analyses, cohort studies, and funnel optimization.',
    ],
    count: 8,
  },
  'Machine Learning Engineer': {
    core: ['Python', 'Machine Learning', 'Statistics'],
    variable: ['TensorFlow','PyTorch','Pandas','NumPy','SQL','Docker','AWS','Git','Scikit-learn','Deep Learning','NLP','Computer Vision','Kubernetes','MLflow','Spark','Feature Engineering'],
    preferred: ['TensorFlow','PyTorch','Docker','AWS','MLflow','Kubernetes','NLP','Computer Vision','Model Deployment','Experiment Tracking'],
    descriptions: [
      'Train, evaluate, and deploy machine learning models to production at scale.',
      'Build end-to-end ML pipelines from data preprocessing to model serving and monitoring.',
      'Research and implement state-of-the-art deep learning models for NLP and computer vision.',
      'Optimize model performance, reduce inference latency, and manage ML infrastructure.',
      'Collaborate with data scientists to productionize experimental models and A/B test them.',
    ],
    count: 9,
  },
  'Site Reliability Engineer': {
    core: ['Linux', 'Docker', 'Python'],
    variable: ['Kubernetes','AWS','Terraform','CI/CD','Monitoring','Prometheus','Grafana','Go','Bash','Git','Networking','Incident Response','Helm','ArgoCD','Datadog','PagerDuty'],
    preferred: ['Kubernetes','Terraform','Prometheus','Grafana','Go','AWS','Incident Response','Chaos Engineering','SLO/SLI','Toil Reduction'],
    descriptions: [
      'Ensure system reliability, define SLOs, and build automation to reduce operational toil.',
      'Design and operate highly available distributed systems with robust monitoring and alerting.',
      'Lead incident response, conduct blameless postmortems, and drive reliability improvements.',
      'Build platform tooling and self-service infrastructure for engineering teams.',
      'Implement chaos engineering practices and continuously improve system resilience.',
    ],
    count: 8,
  },
};

function pick(arr, min, max) {
  const count = min + Math.floor(Math.random() * (max - min + 1));
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, arr.length));
}

function generateJobs() {
  const jobs = [];
  let id = 1;
  const usedCompanies = {};

  for (const [role, config] of Object.entries(ROLE_CONFIGS)) {
    usedCompanies[role] = new Set();

    for (let i = 0; i < config.count; i++) {
      let company;
      do {
        company = COMPANIES[Math.floor(Math.random() * COMPANIES.length)];
      } while (usedCompanies[role].has(company));
      usedCompanies[role].add(company);

      const extraRequired = pick(config.variable, 1, 4);
      const requiredSkills = [...new Set([...config.core, ...extraRequired])];
      const remainingForPreferred = config.preferred.filter((s) => !requiredSkills.includes(s));
      const preferredSkills = pick(remainingForPreferred, 2, 4);
      const level = i < config.count * 0.4 ? 'Entry' : i < config.count * 0.75 ? 'Mid' : 'Senior';
      const description = config.descriptions[i % config.descriptions.length];

      jobs.push({
        id: String(id++),
        title: role,
        company,
        requiredSkills,
        preferredSkills,
        experienceLevel: level,
        description,
      });
    }
  }

  return jobs;
}

const jobs = generateJobs();
console.log(JSON.stringify(jobs, null, 2));
console.error(`Generated ${jobs.length} jobs`);
