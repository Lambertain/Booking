// Debug script: dump PurplePort message page DOM structure
require('dotenv').config();
const { openPage } = require('./src/extractor/adspower');
const fs = require('fs');

(async () => {
  // Use kisa profile (has purpleport)
  const config = JSON.parse(fs.readFileSync('./models/kisa/config.json', 'utf8'));
  const profileId = config.adspower.profileId;
  const ppConfig = config.sites?.find(s => s.id === 'purpleport');

  if (!ppConfig) {
    console.log('No purpleport config found for kisa. Add it first.');
    console.log('Current sites:', config.sites.map(s => s.id));
    process.exit(1);
  }

  console.log('Opening AdsPower...');
  const session = await openPage(profileId);

  // Go to messages inbox
  console.log(`Going to ${ppConfig.messageUrl}...`);
  await session.page.goto(ppConfig.messageUrl, { waitUntil: 'domcontentloaded' });
  await session.page.waitForTimeout(5000);

  // Dump inbox structure
  const inboxDump = await session.page.evaluate(() => ({
    title: document.title,
    url: location.href,
    // All links that might be message threads
    links: [...document.querySelectorAll('a')].filter(a =>
      a.href.includes('message') || a.href.includes('conversation') || a.href.includes('inbox')
    ).slice(0, 30).map(a => ({
      href: a.href,
      text: a.textContent.trim().slice(0, 100),
      parent: a.parentElement?.className
    })),
    // Page structure overview
    mainContent: (document.querySelector('main, .content, #content, .container')?.innerHTML || document.body.innerHTML).slice(0, 5000)
  }));

  console.log('\n=== INBOX PAGE ===');
  console.log('Title:', inboxDump.title);
  console.log('URL:', inboxDump.url);
  console.log('\nLinks:');
  console.log(JSON.stringify(inboxDump.links, null, 2));

  // Try to open first message thread
  const threadLinks = inboxDump.links.filter(l =>
    l.href.includes('message') || l.href.includes('conversation') || l.href.includes('thread')
  );

  if (threadLinks.length > 0) {
    console.log(`\nOpening first thread: ${threadLinks[0].href}`);
    await session.page.goto(threadLinks[0].href, { waitUntil: 'domcontentloaded' });
    await session.page.waitForTimeout(3000);

    const threadDump = await session.page.evaluate(() => ({
      title: document.title,
      url: location.href,
      // Find all potential message elements
      messageElements: [...document.querySelectorAll('*')].filter(el =>
        /message|msg|chat|conversation|thread|reply/i.test(el.className) &&
        el.children.length < 20 &&
        el.innerText?.trim().length > 10
      ).slice(0, 10).map(el => ({
        tag: el.tagName,
        className: el.className,
        id: el.id,
        text: el.innerText?.trim().slice(0, 200),
        childCount: el.children.length,
        outerHTML: el.outerHTML.slice(0, 1500)
      })),
      // All elements with username/author/sender in class
      nameElements: [...document.querySelectorAll('*')].filter(el =>
        /user|author|sender|name|from/i.test(el.className) &&
        el.innerText?.trim().length < 100
      ).slice(0, 10).map(el => ({
        tag: el.tagName,
        className: el.className,
        text: el.innerText?.trim().slice(0, 100)
      })),
      // Page HTML snippet
      bodySnippet: document.body.innerHTML.slice(0, 8000)
    }));

    console.log('\n=== THREAD PAGE ===');
    console.log('Title:', threadDump.title);
    console.log('URL:', threadDump.url);
    console.log('\nMessage elements:');
    console.log(JSON.stringify(threadDump.messageElements, null, 2));
    console.log('\nName elements:');
    console.log(JSON.stringify(threadDump.nameElements, null, 2));
  } else {
    console.log('\nNo thread links found. Saving HTML...');
    console.log(inboxDump.mainContent);
  }

  await session.close();
  process.exit(0);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
