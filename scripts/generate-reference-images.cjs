#!/usr/bin/env node
// generate-reference-images.cjs — Generate multi-angle reference images using Gemini CLI + nanobanana
// Usage: node scripts/generate-reference-images.cjs /path/to/photo.jpg [analysis.json]
//
// Requires:
//   - Gemini CLI installed (/opt/homebrew/bin/gemini)
//   - nanobanana extension installed (gemini extensions install https://github.com/gemini-cli-extensions/nanobanana)
//   - NANOBANANA_API_KEY environment variable set
//
// Output: saves <basename>.ref.<angle>.{png,jpg} files + <basename>.references.json
// Load into partwright via the Images tab "Attach image…" button or console:
//   partwright.setImages({ perspective: "data:...", front: "data:...", ... })

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// --- Configuration ---
const GEMINI_PATH = '/opt/homebrew/bin/gemini';

const ANGLES = [
  { key: 'front', desc: 'directly from the front, straight-on, at eye level, showing the full front facade' },
  { key: 'right', desc: 'from the right side, straight-on, at eye level, showing the full right elevation' },
  { key: 'back', desc: 'from the back/rear, straight-on, at eye level, showing the full rear elevation' },
  { key: 'left', desc: 'from the left side, straight-on, at eye level, showing the full left elevation' },
];

function checkPrerequisites() {
  try {
    execSync(`${GEMINI_PATH} --version`, { stdio: 'pipe' });
  } catch {
    console.error('Error: Gemini CLI not found at', GEMINI_PATH);
    process.exit(1);
  }

  // Check nanobanana is installed
  const extList = execSync(`${GEMINI_PATH} -l`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
  if (!extList.includes('nanobanana')) {
    console.error('Error: nanobanana extension not installed.');
    console.error('Install: gemini extensions install https://github.com/gemini-cli-extensions/nanobanana');
    process.exit(1);
  }
}

function validateInputs() {
  const photoPath = process.argv[2];
  if (!photoPath) {
    console.error('Usage: node scripts/generate-reference-images.cjs /path/to/photo.jpg [analysis.json]');
    process.exit(1);
  }

  const resolved = path.resolve(photoPath);
  if (!fs.existsSync(resolved)) {
    console.error('Error: Photo not found at', resolved);
    process.exit(1);
  }

  let analysis = null;
  const analysisPath = process.argv[3];
  if (analysisPath) {
    const resolvedAnalysis = path.resolve(analysisPath);
    if (fs.existsSync(resolvedAnalysis)) {
      analysis = JSON.parse(fs.readFileSync(resolvedAnalysis, 'utf-8'));
    }
  } else {
    // Auto-detect analysis JSON next to the photo
    const dir = path.dirname(resolved);
    const base = path.basename(resolved, path.extname(resolved));
    const autoPath = path.join(dir, `${base}.analysis.json`);
    if (fs.existsSync(autoPath)) {
      analysis = JSON.parse(fs.readFileSync(autoPath, 'utf-8'));
      console.log(`Found analysis: ${autoPath}`);
    }
  }

  return { photoPath: resolved, analysis };
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }[ext] || 'image/jpeg';
}

function generateAngleImage(photoPath, angle, elevationDesc, outputDir) {
  const prompt = `Look at this reference photo of a building: ${photoPath}

Using the /edit command with nanobanana, take this photo and transform it to show the EXACT same building as viewed ${angle.desc}.

The generated image should:
- Show the same building with identical architectural style, materials, colors, and proportions
- Be a clean architectural elevation view
- Show the full building from foundation to roof peak
- Use similar lighting as the original photo
${elevationDesc ? `\nDescription of what this ${angle.key} view should show:\n${elevationDesc}` : ''}

Use the edit_image tool with the file "${photoPath}" and generate the ${angle.key} elevation view. Save the output to "${outputDir}".`;

  try {
    const output = execSync(
      `${GEMINI_PATH} -p ${JSON.stringify(prompt)} -e nanobanana --sandbox -y -o text`,
      {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 120000,
        maxBuffer: 10 * 1024 * 1024,
      }
    );
    return output.trim();
  } catch (err) {
    console.error(`  Error: ${err.stderr?.substring(0, 200) || err.message}`);
    return null;
  }
}

function findGeneratedImage(output, outputDir, angle) {
  if (!output) return null;

  // Look for file paths in the output (nanobanana reports "Generated files: • /path/to/file")
  const filePatterns = [
    /[•\-]\s*(.+\.(?:png|jpg|jpeg|webp))/gi,
    /(\/[^\s]+\.(?:png|jpg|jpeg|webp))/gi,
    /saved?\s+(?:to\s+)?['""]?([^\s'"]+\.(?:png|jpg|jpeg|webp))/gi,
  ];

  for (const pattern of filePatterns) {
    const matches = [...output.matchAll(pattern)];
    for (const match of matches) {
      const filePath = match[1].trim();
      if (fs.existsSync(filePath)) {
        return filePath;
      }
    }
  }

  // Also check output dir for any recently created images
  if (fs.existsSync(outputDir)) {
    const files = fs.readdirSync(outputDir)
      .filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f))
      .map(f => ({ name: f, path: path.join(outputDir, f), time: fs.statSync(path.join(outputDir, f)).mtimeMs }))
      .sort((a, b) => b.time - a.time);

    if (files.length > 0) {
      const recent = files[0];
      // If created in the last 2 minutes, it's likely our output
      if (Date.now() - recent.time < 120000) {
        return recent.path;
      }
    }
  }

  return null;
}

function main() {
  checkPrerequisites();
  const { photoPath, analysis } = validateInputs();
  const photoDir = path.dirname(photoPath);
  const photoBase = path.basename(photoPath, path.extname(photoPath));
  const mimeType = getMimeType(photoPath);

  console.log(`Photo:    ${photoPath}`);
  console.log(`Analysis: ${analysis ? 'loaded' : 'none'}`);
  console.log('');

  // Include original as perspective reference
  const photoBuffer = fs.readFileSync(photoPath);
  const references = {
    perspective: `data:${mimeType};base64,${photoBuffer.toString('base64')}`,
  };

  let successCount = 0;

  for (const angle of ANGLES) {
    const elevationDesc = analysis?.elevations?.[angle.key] || '';
    console.log(`Generating ${angle.key} view...`);

    const output = generateAngleImage(photoPath, angle, elevationDesc, photoDir);

    if (output) {
      // Find the generated file
      const generatedFile = findGeneratedImage(output, photoDir, angle);

      if (generatedFile) {
        // Copy/rename to our naming convention
        const ext = path.extname(generatedFile);
        const destPath = path.join(photoDir, `${photoBase}.ref.${angle.key}${ext}`);
        if (generatedFile !== destPath) {
          fs.copyFileSync(generatedFile, destPath);
        }
        console.log(`  Saved: ${destPath}`);

        // Add to references bundle as data URL
        const imgBuffer = fs.readFileSync(destPath);
        const imgMime = getMimeType(destPath);
        references[angle.key] = `data:${imgMime};base64,${imgBuffer.toString('base64')}`;
        successCount++;
      } else {
        console.warn(`  Could not find generated image file in output`);
        console.warn(`  Output: ${output.substring(0, 200)}`);
      }
    }
  }

  // Save references.json bundle
  const refsPath = path.join(photoDir, `${photoBase}.references.json`);
  fs.writeFileSync(refsPath, JSON.stringify(references, null, 2), 'utf-8');

  console.log('');
  console.log(`Generated ${successCount}/${ANGLES.length} angle views`);
  console.log(`Original photo included as perspective reference`);
  console.log(`References bundle: ${refsPath}`);
  console.log('');
  console.log('To load in partwright:');
  console.log('  1. Open the Images tab, click "Attach image…", and select the .ref.*.png files, OR');
  console.log('  2. In browser console, paste the references.json content into partwright.setImages(...)');
}

main();
