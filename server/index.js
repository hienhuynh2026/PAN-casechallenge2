require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');

const jobRoutes = require('./routes/jobs');
const profileRoutes = require('./routes/profile');
const gapRoutes = require('./routes/gap');
const resumeRoutes = require('./routes/resume');
const dashboardRoutes = require('./routes/dashboard');
const evaluateRoutes = require('./routes/evaluate');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/jobs', jobRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/gap-analysis', gapRoutes);
app.use('/api/resume', resumeRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/evaluate', evaluateRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Only start listening when this file is run directly (not imported by tests)
if (require.main === module) {
  const PORT = process.env.PORT || 3847;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
