// Debug script: dump Model-Kartei dialog DOM structure
require('dotenv').config();
const { openPage } = require('./src/extractor/adspower');

(async () => {
  const config = JSON.parse(require('fs').readFileSync('./models/violet-spes/config.json', 'utf8'));
  const profileId = config.adspower.profileId;
  const mkConfig = config.sites.find(s => s.id === 'model-kartei');

  console.log('Opening AdsPower...');
  const session = await openPage(profileId);

  // Go to unread messages
  console.log('Going to unread...');
  await session.page.goto(mkConfig.unreadUrl, { waitUntil: 'domcontentloaded' });
  await session.page.waitForTimeout(4000);

  // Get first dialog URL
  const urls = await session.page.evaluate(() => {
    return [...document.querySelectorAll('a[href*="/pn/"]')]
      .map(a => a.href)
      .filter(href => /\/pn\/\d+\/?$/.test(href));
  });

  if (urls.length === 0) {
    console.log('No dialog URLs found, trying all messages...');
    await session.page.goto(mkConfig.messageUrl, { waitUntil: 'domcontentloaded' });
    await session.page.waitForTimeout(4000);
    const allUrls = await session.page.evaluate(() => {
      return [...document.querySelectorAll('a[href*="/pn/"]')]
        .map(a => a.href)
        .filter(href => /\/pn\/\d+\/?$/.test(href));
    });
    if (allUrls.length > 0) urls.push(...allUrls);
  }

  console.log(`Found ${urls.length} URLs, opening first: ${urls[0]}`);
  await session.page.goto(urls[0], { waitUntil: 'domcontentloaded' });
  await session.page.waitForTimeout(3000);

  // Dump .mailWrapper structure
  const dump = await session.page.evaluate(() => {
    const rows = [...document.querySelectorAll('.mailWrapper')];
    return rows.slice(0, 3).map((row, i) => {
      return {
        index: i,
        className: row.className,
        outerHTML: row.outerHTML.slice(0, 2000),
        // All links
        links: [...row.querySelectorAll('a')].map(a => ({
          href: a.getAttribute('href'),
          className: a.className,
          text: a.textContent.trim().slice(0, 100)
        })),
        // All elements with class containing 'user' or 'name'
        nameElements: [...row.querySelectorAll('*')].filter(el =>
          /user|name|author|sender/i.test(el.className) || el.tagName === 'STRONG' || el.tagName === 'B'
        ).map(el => ({
          tag: el.tagName,
          className: el.className,
          text: el.textContent.trim().slice(0, 100)
        }))
      };
    });
  });

  // Also dump page title and header area
  const pageInfo = await session.page.evaluate(() => {
    return {
      title: document.title,
      h1: document.querySelector('h1')?.textContent?.trim(),
      h2: document.querySelector('h2')?.textContent?.trim(),
      // Elements that might contain the conversation partner's name
      breadcrumb: document.querySelector('.breadcrumb, .bc, nav')?.textContent?.trim()?.slice(0, 200),
      // Any element with "username" class
      allUsernames: [...document.querySelectorAll('.username, [class*="username"]')].map(el => ({
        tag: el.tagName,
        className: el.className,
        text: el.textContent.trim(),
        parent: el.parentElement?.className
      }))
    };
  });

  console.log('\n=== PAGE INFO ===');
  console.log(JSON.stringify(pageInfo, null, 2));

  console.log('\n=== MAIL WRAPPERS ===');
  console.log(JSON.stringify(dump, null, 2));

  await session.close();
  process.exit(0);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
