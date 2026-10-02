const openrouter = require('./openrouterClient');

const DEFAULT_ENHANCER_MODEL = 'anthropic/claude-sonnet-4.5';

const STYLE_PRESETS = {
  none: '',
  cinematic: 'Cinematic film look: deliberate camera moves, motivated lighting, shallow depth of field, anamorphic feel, rich color grade.',
  documentary: 'Observational documentary: handheld or tripod, natural available light, authentic textures, unstaged moments.',
  product: 'Premium product commercial: clean studio or lifestyle set, controlled highlights, macro details, smooth slider/turntable moves, the product is the hero.',
  social: 'Vertical-friendly social/UGC: energetic, immediate hook in the first second, phone-camera authenticity, bold readable action.',
  anime: 'Hand-drawn anime style: expressive key poses, painterly backgrounds, cel shading, dynamic speed lines where fitting.',
  animation3d: 'Stylized 3D animation: soft global illumination, appealing character shapes, polished studio-quality render.',
  surreal: 'Dreamlike surrealism: impossible physics handled gracefully, strong symbolic imagery, slow evolving transformations.'
};

// Light-touch hints keyed by substrings of the OpenRouter model id.
const MODEL_HINTS = [
  { match: /veo/i, hint: 'Google Veo responds well to explicit shot language (e.g. "low-angle dolly-in"), and when audio is on, to quoted dialogue and described ambient sound/SFX.' },
  { match: /sora/i, hint: 'Sora handles rich scene descriptions and multi-beat action well; describe beats in chronological order and keep physics plausible.' },
  { match: /kling/i, hint: 'Kling works best with one clear subject action and one camera move; avoid overloading the shot with simultaneous events.' },
  { match: /wan/i, hint: 'Wan benefits from concise, concrete descriptions of subject, motion, and camera; avoid abstract adjectives.' },
  { match: /seedance|bytedance/i, hint: 'Seedance handles multi-shot prompts; if helpful, describe up to two shots with clear cut points.' },
  { match: /hailuo|minimax/i, hint: 'Hailuo/MiniMax follows camera instructions literally; specify the camera move explicitly.' },
  { match: /runway|gen-?4/i, hint: 'Runway prefers direct visual descriptions of motion; avoid negative phrasing ("no X").' },
  { match: /luma|ray/i, hint: 'Luma Ray benefits from natural-language descriptions with clear camera motion and lighting.' }
];

function buildSystemPrompt() {
  return [
    'You are an expert prompt engineer for AI text-to-video and image-to-video models.',
    'Rewrite the user\'s idea into production-ready video prompts. Preserve the user\'s core intent, subject, and any specific details they gave; never contradict them.',
    '',
    'A strong video prompt covers, in flowing prose (not a bullet list):',
    '- Subject: who/what, with concrete visual specifics.',
    '- Action & motion: what happens over time, paced to fit the clip duration. One clear arc per clip.',
    '- Camera: shot size, angle, and movement (e.g. "slow push-in", "tracking shot", "static wide"), lens feel if useful.',
    '- Setting & time: environment, era, time of day, weather.',
    '- Lighting & color: light source, quality, palette, grade.',
    '- Style & mood: medium/aesthetic and emotional tone.',
    '- Audio (ONLY when audio generation is enabled): ambient sound, SFX, music feel, and any dialogue in quotes.',
    '',
    'Rules:',
    '- Use positive phrasing; describe what IS in the shot rather than what is not.',
    '- Keep each prompt between 60 and 160 words unless the user asks otherwise.',
    '- Do not include technical parameters (resolution, fps, aspect ratio, duration numbers) as text unless they shape composition (e.g. vertical framing).',
    '- For image-to-video: the first frame already defines the look. Focus on motion, camera movement, and how the scene evolves; do not re-describe the image in detail or change its subjects.',
    '- For start+end frame: describe the transition/motion that plausibly gets from the first frame to the last frame.',
    '- When multiple variations are requested, make them meaningfully different (camera approach, pacing, mood) while all honoring the user\'s intent.',
    '',
    'Respond with ONLY a JSON object, no markdown fences, in this exact shape:',
    '{"variants":[{"title":"short 2-5 word label","prompt":"the full enhanced prompt","notes":"one sentence on what this variant emphasizes"}]}'
  ].join('\n');
}

function buildUserMessage(input) {
  const lines = [`User idea:\n"""${input.prompt.trim()}"""`, ''];
  lines.push(`Number of variations: ${input.variations}`);
  lines.push(`Generation mode: ${describeMode(input.mode)}`);
  if (input.targetModel) lines.push(`Target video model: ${input.targetModel}`);
  if (input.duration) lines.push(`Clip duration: ${input.duration} seconds`);
  if (input.aspectRatio) lines.push(`Aspect ratio: ${input.aspectRatio}`);
  lines.push(`Audio generation: ${input.generateAudio ? 'enabled' : 'disabled (do not describe sound)'}`);

  const style = STYLE_PRESETS[input.style];
  if (style) lines.push(`Requested style: ${style}`);
  if (input.instructions) lines.push(`Extra instructions from the user: ${input.instructions}`);

  const hint = MODEL_HINTS.find((item) => input.targetModel && item.match.test(input.targetModel));
  if (hint) lines.push(`Model tip: ${hint.hint}`);

  return lines.join('\n');
}

function describeMode(mode) {
  if (mode === 'image') return 'image-to-video (a first-frame image is provided)';
  if (mode === 'start_end') return 'start + end frame (both first and last frame images are provided)';
  return 'text-to-video';
}

function parseVariants(content) {
  const text = String(content || '').trim();
  const candidates = [text];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) candidates.push(fenced[1]);
  const braces = text.match(/\{[\s\S]*\}/);
  if (braces) candidates.push(braces[0]);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const variants = Array.isArray(parsed) ? parsed : parsed.variants;
      if (Array.isArray(variants)) {
        const cleaned = variants
          .map((item) => (typeof item === 'string' ? { prompt: item } : item))
          .filter((item) => item && typeof item.prompt === 'string' && item.prompt.trim())
          .map((item, index) => ({
            title: String(item.title || `Variation ${index + 1}`).trim(),
            prompt: item.prompt.trim(),
            notes: item.notes ? String(item.notes).trim() : ''
          }));
        if (cleaned.length) return cleaned;
      }
    } catch {
      // try next candidate
    }
  }

  // Fall back to treating the whole reply as a single prompt.
  if (text) return [{ title: 'Enhanced', prompt: text, notes: '' }];
  return [];
}

async function enhancePrompt(apiKey, rawInput, enhancerModel) {
  const prompt = String(rawInput.prompt || '').trim();
  if (!prompt) {
    throw Object.assign(new Error('Enter a prompt to enhance.'), { status: 400 });
  }

  const input = {
    prompt,
    variations: Math.min(3, Math.max(1, Number.parseInt(rawInput.variations, 10) || 1)),
    mode: rawInput.mode || 'text',
    targetModel: rawInput.targetModel || '',
    duration: rawInput.duration || '',
    aspectRatio: rawInput.aspectRatio || '',
    generateAudio: Boolean(rawInput.generateAudio),
    style: STYLE_PRESETS[rawInput.style] !== undefined ? rawInput.style : 'none',
    instructions: String(rawInput.instructions || '').trim().slice(0, 1000)
  };

  const model = enhancerModel || DEFAULT_ENHANCER_MODEL;
  const response = await openrouter.createChatCompletion(apiKey, {
    model,
    temperature: input.variations > 1 ? 0.9 : 0.7,
    max_tokens: 1800,
    messages: [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: buildUserMessage(input) }
    ]
  });

  const content = response.choices?.[0]?.message?.content;
  const variants = parseVariants(Array.isArray(content) ? content.map((part) => part.text || '').join('') : content);
  if (variants.length === 0) {
    throw Object.assign(new Error('The enhancer model returned an empty response.'), { status: 502 });
  }

  return {
    model,
    original: prompt,
    variants: variants.slice(0, input.variations),
    usage: response.usage || null
  };
}

module.exports = {
  DEFAULT_ENHANCER_MODEL,
  STYLE_PRESETS,
  enhancePrompt,
  parseVariants
};
