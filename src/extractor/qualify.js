const REJECT_PATTERNS = [
  /not interested/i, /no interest/i, /no thank you/i, /not now/i,
  /maybe next time/i, /maybe later/i, /currently unavailable/i,
  /not available/i, /i'?m not available/i, /i am not available/i,
  /have to cancel/i, /already have .*shoots?/i, /keep me posted/i,
  /i don'?t do pay ?shoots?/i, /can'?t pay/i, /cannot pay/i,
  /kein interesse/i, /kein budget/i, /leider .* kein interesse/i,
  /sorry.*not interested/i, /focus(?:es)? exclusively on male models/i,
  /keep (?:you|your profile) (?:in mind|on file)/i, /get back to you/i,
  /on vacation/i, /too far/i, /out of budget/i, /schedule is full/i,
  /stopped shooting/i, /no new shoots/i, /not booking/i,
  /financially? (?:in trouble|reasons)/i, /can'?t afford/i,
  /won'?t be able to/i, /not planning to do/i,
  /i don'?t offer payment/i, /do not offer payment/i
];

const STRONG_PATTERNS = [
  [/rates?|price|honorar|kosten|fee|budget/i, 'asks rates/budget'],
  [/date|time|duration|uhr|when|what day/i, 'asks schedule'],
  [/what level|what style|concept|location|city/i, 'asks level/style/location'],
  [/would that work|could that fit|can you travel/i, 'tests practical fit'],
  [/interested in doing|interested to shoot|would love to work|delighted to collaborate/i, 'shows collaboration intent'],
  [/available|arrange|shoot|shooting|book|collaboration/i, 'booking question'],
  [/would you|can you|could you/i, 'tests practical fit']
];

const HISTORY_SIGNALS = [
  /rates?|price|honorar|kosten|fee|budget/i,
  /date|time|duration|uhr|when|what day/i,
  /location|city|travel/i,
  /shoot|shooting|book|collaboration/i,
  /available/i
];

function qualifiesInterest(messages, lastIncoming) {
  const t = (lastIncoming || '').toLowerCase().trim();
  const history = messages
    .filter(m => m.role === 'interlocutor')
    .map(m => m.text || '')
    .join('\n')
    .toLowerCase();

  if (!history.trim()) return { qualified: false, reason: 'empty incoming' };
  if (REJECT_PATTERNS.some(re => re.test(t))) return { qualified: false, reason: 'rejection' };

  for (const [re, reason] of STRONG_PATTERNS) {
    if (re.test(t)) return { qualified: true, reason };
  }

  const historyScore = HISTORY_SIGNALS.reduce((acc, re) => acc + (re.test(history) ? 1 : 0), 0);
  if (historyScore >= 2 && !REJECT_PATTERNS.some(re => re.test(history))) {
    return { qualified: true, reason: 'thread context indicates booking discussion' };
  }

  return { qualified: false, reason: 'no clear booking intent' };
}

function detectLanguage(text) {
  const t = (text || '').trim();
  if (!t) return 'en';
  if (/[а-яіїєґ]/i.test(t)) return 'ru/uk';
  if (/[äöüß]/i.test(t) || /\b(hallo|bitte|honorar|shooting|uhr|grüße|gruesse|lg)\b/i.test(t)) return 'de';
  return 'en';
}

module.exports = { qualifiesInterest, detectLanguage };
