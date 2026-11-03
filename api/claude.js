const ADVISOR_MODEL_RATES_USD = {
  'anthropic/claude-sonnet-4.5': { inputPer1M: 3, outputPer1M: 15 },
  'claude-sonnet-4-5': { inputPer1M: 3, outputPer1M: 15 }
};

/** Server-owned model. Browser must not choose this. */
const ADVISOR_MODEL = process.env.ADVISOR_MODEL || 'anthropic/claude-sonnet-4.5';

/** Server-owned reply lengths by feature. Browser max_tokens is ignored. */
const FEATURE_MAX_TOKENS = {
  v2_chat: 700,
  v2_exploration: 450,
  v2_paths: 900,
  v2_more_paths: 900,
  v2_paths_regen: 900,
  v2_path_replace: 700,
  v2_path_discuss: 320,
  v2_missions: 1200,
  v2_missions_more: 1100,
  v2_plan_summary: 500,
  v2_difficulty: 500,
  v2_draft: 500,
  v2_resource_draft: 450,
  v2_circle_back: 700,
  v2_task_chat: 700,
  v2_intake_clarifying: 280
};

function estimateAdvisorCostUsd(model, inputTokens = 0, outputTokens = 0) {
  const rates = ADVISOR_MODEL_RATES_USD[model] || ADVISOR_MODEL_RATES_USD['anthropic/claude-sonnet-4.5'];
  return Number(
    ((inputTokens / 1_000_000) * rates.inputPer1M + (outputTokens / 1_000_000) * rates.outputPer1M).toFixed(6)
  );
}

function logAdvisorUsage(entry) {
  console.log(JSON.stringify({ type: 'advisor_api_call', ...entry }));
}

function toOpenRouterModel(model) {
  const map = {
    'claude-sonnet-4-5': 'anthropic/claude-sonnet-4.5',
    'claude-3-5-sonnet-20241022': 'anthropic/claude-3.5-sonnet'
  };
  return map[model] || model;
}

function maxTokensForFeature(feature) {
  const key = String(feature || '').trim();
  if (FEATURE_MAX_TOKENS[key]) return FEATURE_MAX_TOKENS[key];
  if (/path/i.test(key)) return 900;
  if (/mission/i.test(key)) return 1100;
  return 700;
}

// OpenRouter (OpenAI-style) → Anthropic shape your frontend expects
function toAnthropicShape(openRouterData, modelUsed) {
  const text = openRouterData?.choices?.[0]?.message?.content || '';
  return {
    id: openRouterData?.id || 'openrouter',
    type: 'message',
    role: 'assistant',
    model: modelUsed,
    content: [{ type: 'text', text }],
    usage: {
      input_tokens: openRouterData?.usage?.prompt_tokens || 0,
      output_tokens: openRouterData?.usage?.completion_tokens || 0
    }
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const startedAt = Date.now();
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.ANTHROPIC_API_KEY;

  try {
    const { messages, feature, callId } = req.body || {};
    const modelUsed = toOpenRouterModel(ADVISOR_MODEL);
    const maxTokens = maxTokensForFeature(feature);

    if (!apiKey) {
      return res.status(500).json({ error: 'API key is missing (set OPENROUTER_API_KEY in Vercel).' });
    }

    const safeMessages = Array.isArray(messages)
      ? messages.map((message) => {
          if (!message || typeof message.content !== 'string') return message;
          let content = message.content;
          content = content.replace(/\nRECOVERY\s*\/\s*REBUILDING[\s\S]*?(?=\n[A-Z][A-Z /]+(?:\n|$)|$)/gi, '');
          if (!/PRIVACY & SCOPE \(non-negotiable/i.test(content)) {
            content =
              '\nPRIVACY & SCOPE: Career/productivity tool only — do not collect or retain medical, substance-use, or mental-health information.\n' +
              content;
          }
          return { ...message, content };
        })
      : messages;

    const openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.SITE_URL || 'https://whatimado.com',
        'X-Title': process.env.SITE_NAME || 'whatimado'
      },
      body: JSON.stringify({
        model: modelUsed,
        max_tokens: maxTokens,
        messages: safeMessages
      })
    });

    if (!openRouterResponse.ok) {
      const errorText = await openRouterResponse.text();
      logAdvisorUsage({
        callId: callId || null,
        feature: feature || 'unknown',
        timestamp: new Date().toISOString(),
        model: modelUsed,
        ok: false,
        httpStatus: openRouterResponse.status,
        durationMs: Date.now() - startedAt,
        error: errorText.slice(0, 240)
      });
      return res.status(openRouterResponse.status).json({ error: `OpenRouter API Error: ${errorText}` });
    }

    const openRouterData = await openRouterResponse.json();
    const anthropicShape = toAnthropicShape(openRouterData, modelUsed);
    const inputTokens = anthropicShape.usage.input_tokens;
    const outputTokens = anthropicShape.usage.output_tokens;

    logAdvisorUsage({
      callId: callId || null,
      feature: feature || 'unknown',
      timestamp: new Date().toISOString(),
      model: modelUsed,
      ok: true,
      httpStatus: 200,
      durationMs: Date.now() - startedAt,
      maxTokensRequested: maxTokens,
      inputTokens,
      outputTokens,
      estimatedCostUsd: estimateAdvisorCostUsd(modelUsed, inputTokens, outputTokens)
    });

    return res.status(200).json(anthropicShape);
  } catch (error) {
    console.error('Network Error:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
