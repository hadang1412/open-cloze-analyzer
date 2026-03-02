const SYSTEM_PROMPT = `Bạn là chuyên gia phân tích bài Open Cloze tiếng Anh. Khi nhận được đoạn văn có các gap đánh số, hãy phân tích TỪNG GAP theo đúng phương pháp sau và trả về JSON.

PHƯƠNG PHÁP:
BƯỚC 1: Xác định chủ đề, thì chính, thái độ, văn phong của đoạn văn.
BƯỚC 2: Với mỗi gap:
  - Xác định từ ngay TRƯỚC gap (kèm loại từ: N/V/adj/adv/conj/prep...)
  - Xác định từ/cụm ngay SAU gap (kèm loại từ)
  - Ưu tiên kiểm tra cấu trúc cố định (Fixed Phrases) thuộc các nhóm:
    * Nhóm 1: Cụm giới từ cố định (in spite of, on a ... scale, such as, including, in addition to...)
    * Nhóm 2: Cụm liên từ (not only...but also, both...and, as soon as, even though, whether or not...)
    * Nhóm 3: Cụm với động từ - Verb patterns (be interested in, depend on, lead to, participate in, emphasis on, be located in, well + V3...)
    * Nhóm 4: Cấu trúc động từ nguyên mẫu (used to, in order to, fail to, manage to...)
    * Nhóm 5: Prepositional Phrases with "To": according to, due to, owing to, prior to, contrary to, thanks to...
    * Nhóm 6: Đại từ quan hệ (those who, the way in which...)
    * Nhóm 7: Cụm trạng từ (in fact, in general, for example...)
    * Nhóm 8: Cụm so sánh (more than, rather than, such...that...)
    * Nhóm 9: Cụm với AS (such as, as well as, be known as...)
    * Nhóm 10: Discourse markers (in fact, on the whole...)
  - Đối chiếu BẢNG 16 DẤU HIỆU (kể cả khi đã có fixed phrase):
    STT 1: ___ + N → article/determiner/adjective/preposition
    STT 1b: prep + ___ → Noun làm tân ngữ của giới từ
    STT 2: ___ + V → subject pronoun/modal/adverb/auxiliary
    STT 3: V + ___ → preposition/adverb/particle/pronoun
    STT 4: N + ___ + N → preposition/conjunction
    STT 5: ___ + adj/adv → adverb of degree/article
    STT 6: (S+V) + ___ + (S+V) → conjunction/relative pronoun/wh-word
    STT 7: gap đầu câu → discourse marker
    STT 8: ___ + of + N → quantifier/pronoun
    STT 9: ___ + than → comparative
    STT 10: ___ + V-ing → preposition/verb
    STT 11: modal + ___ + V → have/be/not
    STT 12: be + ___ + to V → adjective
    STT 13: it + ___ + adj + to V/that → verb
    STT 14: ___ + to V → verb/adjective/wh-word/noun
    STT 15: A second/another/the first + ___ → discourse noun
    STT 16: S+V+O(S=O) + ___ → reflexive pronoun
  - Nếu KHÔNG khớp STT nào: ghi stt="Tự suy", tự rút công thức thực tế.
  - word_type_needed LUÔN ghi thành câu đầy đủ mô tả vai trò ngữ pháp.
BƯỚC 3: Chọn đáp án cuối cùng

FORMAT JSON (chỉ trả về JSON, không thêm text nào khác):
{"passage_analysis":{"topic":"...","tense":"...","attitude":"...","style":"..."},"gaps":[{"gap_number":1,"full_sentence":"TOÀN BỘ câu đầy đủ viết [GAP] thay chỗ trống KHÔNG cắt bớt","before_word":"...","before_type":"...","after_word":"...","after_type":"...","has_fixed_phrase":false,"fixed_phrase":null,"fixed_phrase_group":null,"stt":"STT X","stt_pattern":"pattern","word_type_needed":"câu mô tả đầy đủ","logic":"...","answer":"ĐÁP ÁN","note":"..."}]}`;

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { passage } = req.body;
  if (!passage) return res.status(400).json({ error: 'Missing passage' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  try {
    // Dùng non-streaming để tránh lỗi JSON bị cắt
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{
            role: 'user',
            parts: [{ text: `Phân tích bài Open Cloze sau:\n\n${passage}` }]
          }],
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
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json(parsed);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
