const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// simple root route
app.get('/', (req, res) => {
	res.send('Consent checker running. Use /api/check to evaluate a consent text.');
});

// Simple rule-based consent checker
function analyzeConsent(text) {
	text = (text || '').toString().trim();
	if (!text) {
		return {
			score: 0,
			remark: 'No text provided',
			details: {},
			missing: ['entire document']
		};
	}

	// Define categories and weights (sum = 100)
	const categories = [
		{ name: 'Purpose of collection', keywords: ['목적', '수집 목적', 'purpose'], weight: 25 },
		{ name: 'Collected items', keywords: ['수집 항목', '개인정보 항목', '수집하는 개인정보', 'personal information', 'items'], weight: 20 },
		{ name: 'Retention period', keywords: ['보유기간', '보관 기간', 'retention'], weight: 15 },
		{ name: 'Third-party sharing', keywords: ['제3자 제공', '제3자', 'third party', '공유', 'share'], weight: 15 },
		{ name: 'Withdrawal / consent withdrawal', keywords: ['동의 철회', '철회', 'withdrawal', 'withdraw consent'], weight: 10 },
		{ name: 'Contact info', keywords: ['연락처', '문의', 'contact', '전화번호', '이메일', 'email'], weight: 10 },
		{ name: 'Signature / agreement mark', keywords: ['서명', '서명란', '동의함', '체크', 'checkbox'], weight: 5 }
	];

	const lower = text.toLowerCase();
	let rawScore = 0;
	const details = {};
	const missing = [];

	for (const cat of categories) {
		const found = cat.keywords.some(k => lower.includes(k.toLowerCase()));
		details[cat.name] = found;
		if (found) rawScore += cat.weight;
		else missing.push(cat.name);
	}

	// adjust for very short documents
	const length = text.length;
	if (length < 50) {
		// very short: heavy penalty
		rawScore = Math.max(0, rawScore - 30);
	} else if (length < 200) {
		// small penalty for being short
		rawScore = Math.max(0, rawScore - 10);
	}

	// clamp and finalize
	const score = Math.max(0, Math.min(100, Math.round(rawScore)));

	let remark = 'Poor';
	if (score >= 85) remark = 'Excellent';
	else if (score >= 65) remark = 'Good';
	else if (score >= 40) remark = 'Fair';
	else remark = 'Poor';

	// short suggestions based on missing items (max 3)
	const suggestions = missing.slice(0, 3).map(m => {
		switch (m) {
			case 'Purpose of collection': return '명확한 수집 목적을 명시하세요.';
			case 'Collected items': return '수집되는 개인정보 항목(예: 이름, 연락처 등)을 구체적으로 적으세요.';
			case 'Retention period': return '개인정보 보유·이용 기간을 명시하세요.';
			case 'Third-party sharing': return '제3자 제공 여부 및 제공 대상·목적을 명시하세요.';
			case 'Withdrawal / consent withdrawal': return '동의 철회 방법과 절차를 안내하세요.';
			case 'Contact info': return '개인정보 보호책임자 또는 문의처 연락처를 기입하세요.';
			case 'Signature / agreement mark': return '동의 표시(서명 또는 체크박스)를 추가하세요.';
			default: return `Consider adding: ${m}`;
		}
	});

	return {
		score,
		remark,
		details,
		missing,
		suggestions
	};
}

// Enhanced analyzer returning { score, label, bullets }
function analyzeConsentV2(text) {
  if (!text || !text.toString().trim()) {
    return { score: 0, label: '분석할 내용이 없습니다', bullets: [] };
  }

  const t = text.toString();

  function count(keyword) {
    const re = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    const m = t.match(re);
    return m ? m.length : 0;
  }

  function anyOf(arr) { return arr.some(k => t.indexOf(k) !== -1); }

  let score = 0;

  // Third-party sharing / outsourcing
  const thirdKW = ['제3자', '제3 자', '제3', '수탁자', '위탁', '제공', '제공받는자', '제공받는 자'];
  let thirdHits = 0; thirdKW.forEach(k => { thirdHits += count(k); });
  const corpHits = count('주식회사') + count('㈜') + count('유한회사');
  const approxThird = Math.max(0, corpHits);
  const thirdScore = Math.min(30, thirdHits * 5);
  score += thirdScore;

  // Sensitive data
  const sensitiveKW = ['민감정보', '고유식별정보', '주민등록번호', '여권번호', '운전면허번호', '건강정보', '바이오정보', '지문', '얼굴인식'];
  const hasSensitive = anyOf(sensitiveKW);
  if (hasSensitive) score += 25;

  // Marketing / advertising
  const mktKW = ['마케팅', '광고', '홍보', '프로모션', '광고성 정보', '맞춤형', '광고성'];
  const hasMarketing = anyOf(mktKW);
  if (hasMarketing) score += 15;

  // Data categories breadth
  const cats = ['이름','성명','생년월일','주소','전화','휴대전화','이메일','계좌','카드','위치','쿠키','결제','기기','IP','식별자','로그'];
  let uniqueCats = 0; cats.forEach(c => { if (t.indexOf(c) !== -1) uniqueCats += 1; });
  const catScore = Math.min(20, uniqueCats * 2);
  score += catScore;

  // Retention period
  let retentionNote = '명시되지 않음/일반';
  const indefiniteKW = ['영구', '무기한', '별도 보유기간', '탈퇴 후에도'];
  const hasPurposeDone = (t.indexOf('목적 달성 시') !== -1) || (t.indexOf('목적달성 시') !== -1);
  if (indefiniteKW.some(k => t.indexOf(k) !== -1)) {
    score += 20; retentionNote = '무기한/불명확';
  } else {
    const m = t.match(/([0-9]{1,2})\s*년/g);
    if (m && m.length) {
      const years = m.map(s => parseInt(s.replace(/[^0-9]/g,''),10)).filter(Boolean);
      const maxY = years.length ? Math.max.apply(null, years) : 0;
      if (maxY >= 3) { score += 10; retentionNote = `${maxY}년 이상`; }
      else if (maxY >= 1) { score += 5; retentionNote = `${maxY}년 내`; }
    }
    if (hasPurposeDone) { retentionNote = '목적 달성 시'; }
  }

  // Mitigations
  const hasOptOut = anyOf(['동의 거부', '철회', '옵트아웃', '수신 거부']);
  const hasAnon = anyOf(['익명', '가명처리', '가명화']);
  if (hasOptOut) score -= 10;
  if (hasAnon) score -= 5;

  // Length-based sanity adjustment (optional minor penalty for very short text)
  if (t.length < 50) score = Math.max(0, score - 10);

  score = Math.max(0, Math.min(100, score));

  let label = '보통';
  if (score < 30) label = '낮음';
  else if (score < 60) label = '보통';
  else if (score < 80) label = '높음';
  else label = '매우 높음';

  const bullets = [];
  bullets.push(`제3자 제공/위탁 징후: ${thirdHits > 0 ? '있음' : '없음'}${approxThird ? ` (사업자 언급 ~${approxThird}회)` : ''}`);
  bullets.push(`민감정보 포함: ${hasSensitive ? '예' : '아니오'}`);
  bullets.push(`마케팅/광고 활용: ${hasMarketing ? '예' : '아니오'}`);
  bullets.push(`수집 항목 다양성: ${uniqueCats}개 항목 감지`);
  bullets.push(`보유기간: ${retentionNote}`);
  if (hasOptOut || hasAnon) bullets.push(`감경 요인: ${[hasOptOut ? '동의 거부/철회 안내' : null, hasAnon ? '익명/가명 처리' : null].filter(Boolean).join(', ')}`);

  const result = { score, label, bullets };
  // Optional aliases for broader compatibility
  result.riskScore = score;
  result.issues = bullets;
  result.result = { score, label, bullets };
  return result;
}

// Support GET and POST
app.get('/api/check', (req, res) => {
	const text = req.query.text || '';
	const result = analyzeConsentV2(text);
	res.json(result);
});

app.post('/api/check', (req, res) => {
	const text = req.body && (req.body.text || req.body);
	const result = analyzeConsentV2(text);
	res.json(result);
});


app.listen(PORT, () => {
	console.log(`Consent checker running on port ${PORT}`);
});
