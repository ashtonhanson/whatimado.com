const ADVISOR_MODEL_RATES_USD = {
  'anthropic/claude-sonnet-4': { inputPer1M: 3, outputPer1M: 15 },
  'claude-sonnet-4-5': { inputPer1M: 3, outputPer1M: 15 }
};

function estimateAdvisorCostUsd(model, inputTokens = 0, outputTokens = 0) {
  const rates = ADVISOR_MODEL_RATES_USD[model] || ADVISOR_MODEL_RATES_USD['anthropic/claude-sonnet-4'];
  return Number(
    ((inputTokens / 1_000_000) * rates.inputPer1M + (outputTokens / 1_000_000) * rates.outputPer1M).toFixed(6)
  );
}

function logAdvisorUsage(entry) {
  console.log(JSON.stringify({ type: 'advisor_api_call', ...entry }));
}

// Map what the frontend sends → OpenRouter model slug
function toOpenRouterModel(model) {
  const map = {
    'claude-sonnet-4-5': 'anthropic/claude-sonnet-4',
    'claude-3-5-sonnet-20241022': 'anthropic/claude-3.5-sonnet'
  };
  return map[model] || model;
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
    const { model, messages, max_tokens, feature, callId } = req.body;
    const modelUsed = toOpenRouterModel(model || 'claude-sonnet-4-5');

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
        max_tokens: max_tokens || 1024,
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
      maxTokensRequested: max_tokens || 1024,
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