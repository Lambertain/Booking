require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { openPage } = require('./adspower');
const modelKartei = require('./model-kartei');
const adultfolioExtractor = require('./adultfolio');
const modelmayhemExtractor = require('./modelmayhem');
const { qualifyDialog, generateDraft, classifyDraft } = require('../ai/grok');

const MODELS_DIR = path.resolve(__dirname, '../../models');
const DATA_DIR = path.resolve(__dirname, '../../data');

async function test() {
  const config = JSON.parse(fs.readFileSync(path.join(MODELS_DIR, 'ana-v', 'config.json'), 'utf8'));
  const modelName = config.modelName;
  const profileId = config.adspower.profileId;
  const modelDir = path.join(MODELS_DIR, 'ana-v');

  console.log(`Opening AdsPower profile for ${modelName} (${profileId})...`);
  const { browser, page } = await openPage(profileId);
  console.log('Browser connected!\n');

  const allDialogs = {};

  for (const siteConfig of config.sites) {
    const id = siteConfig.id;
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Extracting from: ${siteConfig.label}`);
    console.log('='.repeat(60));

    let extractor;
    if (id === 'model-kartei') extractor = modelKartei;
    else if (id === 'adultfolio') extractor = adultfolioExtractor;
    else if (id === 'modelmayhem') extractor = modelmayhemExtractor;
    else { console.log(`No extractor for ${id}`); continue; }

    try {
      const dialogs = await extractor.extract(page, siteConfig, modelName);
      allDialogs[id] = dialogs;
      console.log(`Extracted: ${dialogs.length} dialogs`);
      for (const d of dialogs) {
        console.log(`  💬 ${d.photographer} (${d.messages.length} msgs)`);
      }
    } catch (err) {
      console.error(`Error: ${err.message}`);
      allDialogs[id] = [];
    }
  }

  await browser.close();
  console.log('\nBrowser closed.\n');

  // Qualify all with Grok
  console.log('='.repeat(60));
  console.log('PHASE 2: Grok AI Qualification');
  console.log('='.repeat(60));

  const allFlat = Object.values(allDialogs).flat();
  const qualified = [];
  const rejected = [];

  for (const d of allFlat) {
    try {
      const q = await qualifyDialog(d.messages, d.photographer, d.siteLabel);
      d.qualified = q.qualified;
      d.qualificationReason = q.reason;
      const icon = q.qualified ? '✅' : '❌';
      console.log(`${icon} ${d.photographer} (${d.siteLabel}): ${q.raw}`);
      (q.qualified ? qualified : rejected).push(d);
    } catch (err) {
      console.error(`Qualify error for ${d.photographer}: ${err.message}`);
      rejected.push(d);
    }
  }

  // Generate drafts + classify for qualified
  if (qualified.length > 0) {
    console.log(`\n${'='.repeat(60)}`);
    console.log('PHASE 3: Draft Generation + Classification');
    console.log('='.repeat(60));

    for (const d of qualified) {
      try {
        const draft = await generateDraft(modelDir, modelName, d.messages, d.lastIncoming, d.photographer, d.language);
        d.draft = draft;
        const draftType = await classifyDraft(modelDir, draft, d.messages, d.photographer);
        d.draftType = draftType;

        const icon = draftType === 'standard' ? '📤' : '🔔';
        console.log(`\n${icon} ${d.photographer} (${d.siteLabel}) — ${draftType.toUpperCase()}`);
        console.log(`   Draft:\n${draft.split('\n').map(l => '   | ' + l).join('\n')}`);
      } catch (err) {
        console.error(`Draft error for ${d.photographer}: ${err.message}`);
      }
    }
  }

  // Save
  const outDir = path.join(DATA_DIR, 'ana-v', 'test-run');
  fs.mkdirSync(outDir, { recursive: true });
  const ts = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  fs.writeFileSync(path.join(outDir, `full-test-${ts}.json`), JSON.stringify({ qualified, rejected }, null, 2), 'utf8');

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`  Extracted: ${allFlat.length}`);
  console.log(`  Qualified: ${qualified.length}`);
  console.log(`  Rejected: ${rejected.length}`);
  const standard = qualified.filter(d => d.draftType === 'standard');
  const custom = qualified.filter(d => d.draftType === 'custom');
  console.log(`  Standard (auto-send): ${standard.length}`);
  console.log(`  Custom (needs approval): ${custom.length}`);
  for (const d of standard) console.log(`    📤 ${d.photographer} (${d.siteLabel})`);
  for (const d of custom) console.log(`    🔔 ${d.photographer} (${d.siteLabel})`);
  console.log(`\nSaved to ${outDir}`);
}

test().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
