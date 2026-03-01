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
    * Nhóm 5: Prepositional Phrases with "To" — cụm kết thúc bằng "to" đứng TRƯỚC DANH TỪ (không phải to-infinitive): according to, due to, owing to, prior to, contrary to, thanks to, with regard to, in response to, as opposed to, subject to... → nhận diện qua pattern: ___ + to + N → cần điền phần đầu của cụm
    * Nhóm 6: Đại từ quan hệ (those who, the way in which...)
    * Nhóm 7: Cụm trạng từ (in fact, in general, for example...)
    * Nhóm 8: Cụm so sánh (more than, rather than, such...that...)
    * Nhóm 9: Cụm với AS (such as, as well as, be known as...)
    * Nhóm 10: Discourse markers (in fact, on the whole...)
  - Đối chiếu BẢNG 16 DẤU HIỆU sau (kể cả khi đã có fixed phrase, vẫn phải đối chiếu để tìm dấu hiệu chính xác nhất):

    STT 1: ___ + N → article / determiner / adjective / preposition
    STT 2: ___ + V → subject pronoun / modal / adverb / auxiliary
    STT 3: V + ___ → preposition / adverb / particle / pronoun / object
    STT 4: N + ___ + N → preposition / conjunction
    STT 5: ___ + adj/adv → adverb of degree / article
    STT 6: (S+V) + ___ + (S+V) → conjunction / relative pronoun / wh-word
    STT 7: gap đầu câu → discourse marker
    STT 8: ___ + of + N → quantifier / pronoun
    STT 9: ___ + than → comparative
    STT 10: ___ + V-ing → preposition / verb
    STT 11: modal + ___ + V → have / be / not
    STT 12: be + ___ + to V → adjective
    STT 13: it + ___ + (adj) + (to V/that) → verb
    STT 14: ___ + to V → verb / adjective / wh-word / noun
    STT 15: A second/another/the first/... + ___ + is/was → discourse noun
    STT 16: S + V + O (S = O) + ___ → reflexive pronoun

  - QUAN TRỌNG: Nếu pattern thực tế KHÔNG khớp chính xác với bất kỳ STT nào, hãy TỰ SUY CÔNG THỨC từ context thực tế.
  - "word_type_needed" LUÔN ghi thành câu đầy đủ, mô tả chính xác vai trò ngữ pháp.
BƯỚC 3: Chọn đáp án cuối cùng

QUAN TRỌNG - FORMAT JSON trả về:
{
  "passage_analysis": { "topic": "...", "tense": "...", "attitude": "...", "style": "..." },
  "gaps": [
    {
      "gap_number": 1,
      "full_sentence": "TOÀN BỘ câu đầy đủ, viết [GAP] thay cho chỗ trống. KHÔNG cắt bớt.",
      "before_word": "từ ngay trước gap",
      "before_type": "loại từ",
      "after_word": "từ/cụm ngay sau gap",
      "after_type": "loại từ",
      "has_fixed_phrase": true,
      "fixed_phrase": "tên cụm cố định nếu có",
      "fixed_phrase_group": "Nhóm X",
      "stt": "STT X",
      "stt_pattern": "pattern",
      "word_type_needed": "câu mô tả đầy đủ vai trò ngữ pháp",
      "logic": "giải thích logic",
      "answer": "ĐÁP ÁN",
      "note": "ghi chú nếu có"
    }
  ]
}

Chỉ trả về JSON, không thêm bất kỳ text nào khác.`;

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

  // Set headers for SSE streaming
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse&key=${apiKey}`,
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
          }
        })
      }
    );

    if (!response.ok) {
      const err = await response.text();
      res.write(`data: ${JSON.stringify({ error: err })}\n\n`);
      return res.end();
    }

    // Pipe SSE stream from Gemini to client
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete line

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              // Forward as SSE event matching Anthropic format expected by frontend
              res.write(`data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text } })}\n\n`);
            }
          } catch (_) {}
        }
      }
    }

    res.write('data: {"type":"message_stop"}\n\n');
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
}
