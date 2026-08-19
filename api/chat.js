// /api/chat.js
// JAVIS 챗봇이 부르는 "중간 다리" 서버 함수.
// Gemini API 키는 여기(Vercel 서버)에만 있고, 브라우저는 절대 키를 들고 있지 않습니다.
// 키는 Vercel 프로젝트 Settings → Environment Variables 에서 GEMINI_API_KEY 로 등록합니다.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST 요청만 허용됩니다.' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'GEMINI_API_KEY가 설정되지 않았습니다. Vercel 환경변수를 확인하세요.' });
    return;
  }

  try {
    const { system = '', history = [], message = '', files = [] } = req.body || {};

    // 첨부 파일을 Gemini가 이해하는 형식으로 변환
    const parts = [];
    for (const f of files) {
      if (f.b64 && f.mime === 'application/pdf') {
        parts.push({ inlineData: { mimeType: 'application/pdf', data: f.b64 } });
      } else if (f.b64 && f.mime && f.mime.startsWith('image/')) {
        parts.push({ inlineData: { mimeType: f.mime, data: f.b64 } });
      } else if (f.text) {
        parts.push({ text: `[첨부파일: ${f.name}]\n${f.text}` });
      }
    }
    parts.push({
      text: message || '첨부한 데이터를 요약하고 대시보드 시장 데이터와 비교해 해석해줘.',
    });

    // 이전 대화 기록 + 이번 질문을 Gemini 형식(contents)으로 구성
    const contents = [
      ...history.map((h) => ({
        role: h.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: String(h.content || '') }],
      })),
      { role: 'user', parts },
    ];

    const model = 'gemini-3.6-flash'; // 무료 티어 대상 최신 모델
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const geminiRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents,
        generationConfig: { maxOutputTokens: 1200 },
      }),
    });

    if (!geminiRes.ok) {
      const detail = await geminiRes.text();
      res.status(502).json({ error: `Gemini API 오류 (${geminiRes.status})`, detail });
      return;
    }

    const data = await geminiRes.json();
    const text = (data.candidates?.[0]?.content?.parts || [])
      .map((p) => p.text || '')
      .join('\n')
      .trim();

    if (!text) {
      res.status(502).json({ error: '빈 응답' });
      return;
    }

    res.status(200).json({ text });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}
