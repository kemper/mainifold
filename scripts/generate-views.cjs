#!/usr/bin/env node
// generate-views.js — Analyze a reference photo from multiple angles using Gemini
// Usage: node scripts/generate-views.js /path/to/photo.jpg

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// --- Configuration ---
const GEMINI_PATH = '/opt/homebrew/bin/gemini';

// --- Validate prerequisites ---
function checkGeminiCli() {
  try {
    execSync(`${GEMINI_PATH} --version`, { stdio: 'pipe' });
  } catch {
    console.error('Error: Gemini CLI not found at', GEMINI_PATH);
    console.error('Install it or update GEMINI_PATH in this script.');
    process.exit(1);
  }
}

function validatePhotoPath(photoPath) {
  if (!photoPath) {
    console.error('Usage: node scripts/generate-views.js /path/to/photo.jpg');
    process.exit(1);
  }
  const resolved = path.resolve(photoPath);
  if (!fs.existsSync(resolved)) {
    console.error('Error: Photo not found at', resolved);
    process.exit(1);
  }
  return resolved;
}

// --- Build the analysis prompt ---
const ANALYSIS_PROMPT = `You are an architectural analyst preparing data for a 3D CSG (Constructive Solid Geometry) modeler. Analyze this building photo and produce a structured JSON description.

Your response MUST be valid JSON only — no markdown fences, no commentary, no text before or after the JSON object.

Return a JSON object with exactly this structure:

{
  "description": "A 2-3 sentence plain-language description of the building, its style, materials, and overall character.",

  "proportions": {
    "width": <number, the front-facing dimension, normalized so the longest of width/depth/height = 100>,
    "depth": <number, the side dimension, estimated from visible perspective cues>,
    "height": <number, from ground to roof peak>,
    "wallHeight": <number, from ground to where the roof starts (eave line)>,
    "units": "relative"
  },

  "roofStyle": "<one of: gable, hip, gambrel, mansard, flat, shed, cross-gable, dutch-gable, pyramid, combination>",
  "roofPitch": <number, estimated angle in degrees from horizontal, e.g. 35>,
  "roofOverhang": {
    "front": <number, overhang past the wall as % of width, e.g. 5>,
    "sides": <number, overhang past the wall as % of depth, e.g. 3>
  },

  "features": [
    {
      "type": "<window|door|garage|chimney|porch|deck|balcony|dormer|column|shutter|gutter|other>",
      "description": "Brief description of the feature",
      "position": {
        "x": <number, 0-100, percentage from left edge of front face>,
        "y": <number, 0-100, percentage from ground level upward>,
        "z": <number, 0-100, percentage from front face going backward, 0 = flush with wall>
      },
      "size": {
        "width": <number, as % of building width>,
        "height": <number, as % of building height>,
        "depth": <number, as % of building depth, for protruding features>
      },
      "elevation": "<front|right|back|left|roof, which face this feature is on>"
    }
  ],

  "elevations": {
    "front": "Detailed description of what the front elevation looks like: wall layout, window placement, door positions, porch details, materials, symmetry. Describe from left to right, bottom to top.",
    "right": "Detailed description of the right side elevation. Estimate what is not visible from the photo based on building style and symmetry cues.",
    "back": "Estimated description of the rear elevation, noting which elements are inferred vs. visible.",
    "left": "Detailed description of the left side elevation. Estimate what is not visible."
  },

  "buildingMasses": [
    {
      "name": "<descriptive name, e.g. 'main_block', 'garage_wing', 'porch_roof'>",
      "shape": "<box|cylinder|prism|wedge, the closest CSG primitive>",
      "dimensions": {
        "width": <number, in the same relative units as proportions>,
        "depth": <number>,
        "height": <number>
      },
      "position": {
        "x": <number, center X relative to building center, in relative units>,
        "y": <number, center Y relative to building center>,
        "z": <number, bottom Z, where 0 = ground level>
      },
      "rotation": <number, degrees around Z axis, 0 = aligned with front>,
      "operation": "<add|subtract, whether this mass is added to or subtracted from the model>",
      "notes": "Any relevant details for modeling (e.g. 'triangular prism for gable roof, ridge runs left-right')"
    }
  ],

  "materials": [
    {
      "surface": "<walls|roof|trim|foundation|porch|other>",
      "material": "Material description (e.g. 'white painted wood siding', 'asphalt shingles - dark gray')",
      "color": "<approximate hex color>"
    }
  ],

  "symmetry": {
    "frontSymmetric": <boolean, is the front elevation roughly symmetric?>,
    "axisOffset": <number, if symmetric, offset of symmetry axis from center as % of width, 0 = centered>
  }
}

IMPORTANT GUIDELINES:
- All numeric dimensions use the same relative scale where the longest building dimension = 100.
- Estimate depth and hidden faces based on architectural conventions for the building style.
- For buildingMasses, decompose the building into the minimum set of CSG primitives needed. Think of it as: what boxes and prisms would you combine (union) and cut (subtract) to approximate this shape?
- The buildingMasses should be ordered: largest/most fundamental first, then additive details, then subtractive details (windows, doors as subtract operations are optional — just note them in features).
- Roof masses should be separate from wall masses.
- Include porch roofs, dormers, chimneys as separate masses.
- Position coordinates: X = left-right (positive = right), Y = front-back (positive = toward back), Z = up (0 = ground).
- Be as precise as you can with proportions — the goal is to recreate this building programmatically.`;

// --- Main execution ---
function main() {
  checkGeminiCli();
  const photoPath = validatePhotoPath(process.argv[2]);

  const photoDir = path.dirname(photoPath);
  const photoBase = path.basename(photoPath, path.extname(photoPath));
  const outputPath = path.join(photoDir, `${photoBase}.analysis.json`);

  console.log(`Analyzing: ${photoPath}`);
  console.log(`Output:    ${outputPath}`);
  console.log('');
  console.log('Calling Gemini CLI for architectural analysis...');

  // Build the full prompt — include the file path so Gemini's file-reading tools can access it
  const fullPrompt = `Read and analyze the image file at: ${photoPath}\n\n${ANALYSIS_PROMPT}`;

  let rawOutput;
  try {
    rawOutput = execSync(
      `${GEMINI_PATH} -p ${JSON.stringify(fullPrompt)} --sandbox -y -o text`,
      {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 180000, // 3 minute timeout (agentic CLI may take longer)
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      }
    );
  } catch (err) {
    console.error('Error calling Gemini CLI:');
    console.error(err.stderr || err.message);
    process.exit(1);
  }

  // Extract JSON from output — Gemini may include thinking text before/after the JSON
  let jsonText = rawOutput.trim();

  // Strip markdown code fences if present
  if (jsonText.includes('```json')) {
    jsonText = jsonText.replace(/[\s\S]*?```json\s*\n?/, '');
    jsonText = jsonText.replace(/\n?```[\s\S]*$/, '');
  } else if (jsonText.includes('```')) {
    jsonText = jsonText.replace(/[\s\S]*?```\s*\n?/, '');
    jsonText = jsonText.replace(/\n?```[\s\S]*$/, '');
  }

  // If still not valid JSON, try to find the first { and last } to extract the JSON object
  if (!jsonText.startsWith('{')) {
    const firstBrace = jsonText.indexOf('{');
    const lastBrace = jsonText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      jsonText = jsonText.substring(firstBrace, lastBrace + 1);
    }
  }

  // Parse and validate JSON
  let analysis;
  try {
    analysis = JSON.parse(jsonText);
  } catch (parseErr) {
    console.error('Error: Gemini output is not valid JSON.');
    console.error('Parse error:', parseErr.message);
    console.error('');
    console.error('Raw output (first 500 chars):');
    console.error(rawOutput.substring(0, 500));

    // Save raw output for debugging
    const rawPath = path.join(photoDir, `${photoBase}.analysis.raw.txt`);
    fs.writeFileSync(rawPath, rawOutput, 'utf-8');
    console.error('');
    console.error('Raw output saved to:', rawPath);
    process.exit(1);
  }

  // Validate expected top-level keys
  const expectedKeys = ['description', 'proportions', 'roofStyle', 'features', 'elevations', 'buildingMasses'];
  const missingKeys = expectedKeys.filter(k => !(k in analysis));
  if (missingKeys.length > 0) {
    console.warn(`Warning: Analysis is missing expected keys: ${missingKeys.join(', ')}`);
  }

  // Add metadata
  analysis._meta = {
    sourcePhoto: photoPath,
    generatedAt: new Date().toISOString(),
    generator: 'generate-views.js + Gemini CLI',
  };

  // Write the analysis file
  fs.writeFileSync(outputPath, JSON.stringify(analysis, null, 2), 'utf-8');

  console.log('');
  console.log('Analysis complete.');
  console.log(outputPath);

  // Print a brief summary
  if (analysis.proportions) {
    const p = analysis.proportions;
    console.log('');
    console.log(`Proportions: ${p.width} x ${p.depth} x ${p.height} (W x D x H, relative)`);
  }
  if (analysis.roofStyle) {
    console.log(`Roof: ${analysis.roofStyle}, pitch ~${analysis.roofPitch || '?'}deg`);
  }
  if (analysis.buildingMasses) {
    console.log(`Building masses: ${analysis.buildingMasses.length} CSG primitives`);
  }
  if (analysis.features) {
    console.log(`Features: ${analysis.features.length} identified`);
  }
}

main();
