export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { passage } = req.body;
  if (!passage) {
    return res.status(400).json({ error: 'Missing passage' });
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [
            {
              role: 'user',
              parts: [{ text: `Phân tích bài Open Cloze sau:\n\n${passage}` }]
            }
          ],
          generationConfig: {
            maxOutputTokens: 8192,
            temperature: 0.1,
            responseMimeType: 'application/json'
          }
        })
      }
    );

    if (!response.ok) {
      const err = await response.text();
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Gemini API lỗi: ' + err })}\n\n`);
      res.end();
      return;
    }

    const data = await response.json();

    // ✅ Kiểm tra candidates có tồn tại không
    const candidates = data?.candidates;
    if (!candidates || candidates.length === 0) {
      const reason = data?.promptFeedback?.blockReason || 'Không rõ';
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Gemini không trả về kết quả. Lý do: ' + reason })}\n\n`);
      res.end();
      return;
    }

    const text = candidates[0]?.content?.parts?.[0]?.text;

    // ✅ Kiểm tra text có rỗng không
    if (!text || text.trim() === '') {
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Gemini trả về nội dung rỗng' })}\n\n`);
      res.end();
      return;
    }

    res.write(`data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text } })}\n\n`);
    res.write('data: {"type":"message_stop"}\n\n');
    res.end();

  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
    res.end();
  }
}
