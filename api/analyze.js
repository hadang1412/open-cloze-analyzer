const SYSTEM_PROMPT = `Bạn là chuyên gia phân tích bài Open Cloze tiếng Anh. Khi nhận được đoạn văn có các gap đánh số, hãy phân tích TỪNG GAP theo đúng phương pháp sau và trả về JSON.

PHƯƠNG PHÁP:
BƯỚC 1: Xác định chủ đề, thì chính, thái độ, văn phong của đoạn văn.
BƯỚC 2: Với mỗi gap:
  - Xác định từ ngay TRƯỚC gap (kèm loại từ: N/V/adj/adv/conj/prep...)
  - Xác định từ/cụm ngay SAU gap (kèm loại từ)
  - Ưu tiên kiểm tra cấu trúc cố định (Fixed Phrases)
  - Đối chiếu BẢNG 16 DẤU HIỆU (STT 1-16)
  - word_type_needed LUÔN ghi thành câu đầy đủ
BƯỚC 3: Chọn đáp án cuối cùng

FORMAT JSON (CHỈ JSON THUẦN, KHÔNG markdown, KHÔNG backtick):
{
  "passage_analysis": { "topic": "...", "tense": "...", "attitude": "...", "style": "..." },
  "gaps": [
    {
      "gap_number": 1,
      "full_sentence": "Câu đầy đủ với [GAP] thay cho chỗ trống",
      "before_word": "từ trước gap",
      "before_type": "loại từ",
      "after_word": "từ sau gap",
      "after_type": "loại từ",
      "has_fixed_phrase": false,
      "fixed_phrase": null,
      "fixed_phrase_group": null,
      "stt": "STT X",
      "stt_pattern": "pattern",
      "word_type_needed": "mô tả đầy đủ vai trò ngữ pháp",
      "logic": "giải thích",
      "answer": "ĐÁP ÁN",
      "note": ""
    }
  ]
}`;

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
      return res.status(500).json({ error: err });
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Access-Control-Allow-Origin', '*');

    res.write(`data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text } })}\n\n`);
    res.write('data: {"type":"message_stop"}\n\n');
    res.end();

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
