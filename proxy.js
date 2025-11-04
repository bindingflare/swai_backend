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

// Support GET and POST
app.get('/api/check', (req, res) => {
	const text = req.query.text || '';
	const result = analyzeConsent(text);
	res.json(result);
});

app.post('/api/check', (req, res) => {
	const text = req.body && (req.body.text || req.body);
	const result = analyzeConsent(text);
	res.json(result);
});


app.listen(PORT, () => {
	console.log(`Consent checker running on port ${PORT}`);
});
