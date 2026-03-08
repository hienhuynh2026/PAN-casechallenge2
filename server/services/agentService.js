/**
 * agentService.js
 *
 * Gap-closing resource engine — deterministic-first architecture.
 *
 * Architecture:
 *   1. Resources are ALWAYS sourced from roleKnowledgeBase (curated, stable, free)
 *   2. Groq is called ONLY to write a short (~200-token) personalized summary
 *   3. If Groq is unavailable, a template summary is generated — nothing else breaks
 *
 * This replaces the previous DuckDuckGo + Groq tool-calling approach which was
 * unreliable because:
 *   - DuckDuckGo's instant-answer API returns Wikipedia abstracts, not course pages
 *   - LLM tool-calling is non-deterministic; Groq does not always call the search tool
 *   - Two-round API calls doubled latency and failure surface
 */

const Groq = require('groq-sdk');
const { getRoleProfile } = require('../data/roleKnowledgeBase');

let client = null;

function getClient() {
  if (!client && process.env.GROQ_API_KEY) {
    client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return client;
}

// ─── Deterministic resource builder ──────────────────────────────────────────
// Pulls curated learn links, project ideas, and resume tips directly from the
// role knowledge base. Always returns useful output — no network calls needed.
function buildCategories(missingCategories, profile) {
  return missingCategories.slice(0, 4).map((gap) => {
    const learnResources = (profile?.resourceHints?.[gap.category] || [])
      .slice(0, 3)
      .map((r) => ({
        ...r,
        description: `Covers ${gap.missing.slice(0, 2).join(' and ') || gap.category} — directly targets your gap`,
      }));

    const buildIdeas = (profile?.projectIdeas?.[gap.category] || [
      `Build a small project demonstrating ${gap.missing[0] || gap.category}`,
      `Add a ${gap.category} section to an existing portfolio project`,
    ]).slice(0, 2);

    const addToResume = [
      `Add a project entry showing specific use of: ${gap.missing.slice(0, 3).join(', ')}`,
      `Quantify impact — e.g. "built X using ${gap.missing[0] || gap.category}, reducing Y by Z%"`,
    ];

    return {
      gap: gap.category,
      learn: learnResources,
      build: buildIdeas,
      addToResume,
      improveNext: learnResources.length > 0
        ? `Start with "${learnResources[0].name}" this week — it directly covers your missing ${gap.category} skills`
        : `Start a small project this week demonstrating ${gap.missing[0] || gap.category}`,
    };
  });
}

function buildQuickWins(missingCategories, profile) {
  const wins = [];

  // Win 1: always actionable
  wins.push('Update your resume summary to explicitly mention your target role and most relevant skills');

  // Win 2: first gap's top resource if available
  const firstGap = missingCategories[0];
  if (firstGap) {
    const firstResource = profile?.resourceHints?.[firstGap.category]?.[0];
    if (firstResource) {
      wins.push(`Complete the first module of "${firstResource.name}" to start closing your biggest gap`);
    } else {
      wins.push(`Start a 1-day mini-project demonstrating ${firstGap.missing[0] || firstGap.category}`);
    }
  }

  // Win 3: resume improvement
  wins.push('Add specific tool and technology names to your skills section — exact matches matter for keyword filtering');

  return wins;
}

function buildTemplateSummary(targetRole, missingCategories, alignmentScore) {
  const topGaps = missingCategories.slice(0, 2).map((g) => g.category).join(' and ');
  const gapCount = missingCategories.length;
  const urgency = alignmentScore < 40
    ? 'Your resume needs significant strengthening before applying.'
    : 'You are in range to close these gaps with focused effort.';
  return `Your resume has ${gapCount} gap area${gapCount !== 1 ? 's' : ''} for the ${targetRole} role, primarily in ${topGaps || 'core skills'}. ${urgency} Use the resources below to build demonstrated experience — project entries in your Experience and Projects sections carry the most weight.`;
}

// ─── Optional: Groq writes a short personalized summary ──────────────────────
// ~200 tokens, single round, no tool-calling. Falls back gracefully on any error.
async function getGroqSummary(targetRole, missingCategories, alignmentScore) {
  const groq = getClient();
  if (!groq) return null;

  const gapList = missingCategories
    .slice(0, 4)
    .map((g) => `${g.category} (missing: ${g.missing.slice(0, 2).join(', ')})`)
    .join('; ');

  try {
    const res = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: 'You are a concise career coach. Write a 2-3 sentence personalised summary only — no headings, no bullet points, no lists.',
        },
        {
          role: 'user',
          content: `Candidate alignment score: ${alignmentScore}/100 for ${targetRole}.\nGap areas: ${gapList}.\nWrite a short, direct 2-3 sentence summary of their situation and single most important focus. Be specific, not generic.`,
        },
      ],
      temperature: 0.4,
      max_tokens: 180,
    });
    const text = res.choices[0]?.message?.content?.trim();
    return text && text.length > 20 ? text : null;
  } catch {
    return null;
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────
// Always returns a full, useful response. Groq failure only affects the summary.
async function findGapResources(targetRole, missingCategories, alignmentScore) {
  const profile = getRoleProfile(targetRole);
  const totalGaps = missingCategories.length;

  // 1. Build all resources deterministically — never fails
  const categories = buildCategories(missingCategories, profile);
  const quickWins = buildQuickWins(missingCategories, profile);
  const timelineEstimate = `${totalGaps * 3}–${totalGaps * 5 + 2} weeks of focused learning and project work`;

  // 2. Attempt Groq summary — degrades gracefully
  const groqSummary = await getGroqSummary(targetRole, missingCategories, alignmentScore);
  const summary = groqSummary || buildTemplateSummary(targetRole, missingCategories, alignmentScore);
  const isFallback = !groqSummary;

  return { summary, categories, quickWins, timelineEstimate, isFallback };
}

// Synchronous alias used by the controller for borderline path (no Groq call).
// Also used as the catch branch when findGapResources itself throws.
function findGapResourcesFallback(targetRole, missingCategories) {
  const profile = getRoleProfile(targetRole);
  const totalGaps = missingCategories.length;
  const categories = buildCategories(missingCategories, profile);
  const quickWins = buildQuickWins(missingCategories, profile);
  const timelineEstimate = `${totalGaps * 3}–${totalGaps * 5 + 2} weeks of focused learning and project work`;
  const summary = buildTemplateSummary(targetRole, missingCategories, 0);
  return { summary, categories, quickWins, timelineEstimate, isFallback: true };
}

module.exports = { findGapResources, findGapResourcesFallback };
