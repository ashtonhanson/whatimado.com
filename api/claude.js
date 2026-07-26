const ADVISOR_MODEL_RATES_USD = {
  'claude-sonnet-4-5': { inputPer1M: 3, outputPer1M: 15 },
  'claude-3-5-sonnet-20241022': { inputPer1M: 3, outputPer1M: 15 }
};

function estimateAdvisorCostUsd(model, inputTokens = 0, outputTokens = 0) {
  const rates = ADVISOR_MODEL_RATES_USD[model] || ADVISOR_MODEL_RATES_USD['claude-sonnet-4-5'];
  return Number(
    (
      (inputTokens / 1_000_000) * rates.inputPer1M +
      (outputTokens / 1_000_000) * rates.outputPer1M
    ).toFixed(6)
  );
}

function logAnthropicUsage(entry) {
  const line = JSON.stringify({ type: 'anthropic_api_call', ...entry });
  console.log(line);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const startedAt = Date.now();

  try {
    const { model, messages, max_tokens, feature, callId } = req.body;
    const modelUsed = model || 'claude-3-5-sonnet-20241022';

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'API key is missing from backend environment variables.' });
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

    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: modelUsed,
        max_tokens: max_tokens || 1024,
        messages: safeMessages
      })
    });

    if (!anthropicResponse.ok) {
      const errorText = await anthropicResponse.text();
      logAnthropicUsage({
        callId: callId || null,
        feature: feature || 'unknown',
        timestamp: new Date().toISOString(),
        model: modelUsed,
        ok: false,
        httpStatus: anthropicResponse.status,
        durationMs: Date.now() - startedAt,
        maxTokensRequested: max_tokens || 1024,
        inputTokens: 0,
        outputTokens: 0,
        estimatedCostUsd: 0,
        error: errorText.slice(0, 240)
      });
      return res.status(anthropicResponse.status).json({ error: `Anthropic API Error: ${errorText}` });
    }

    const data = await anthropicResponse.json();
    const inputTokens = data?.usage?.input_tokens || 0;
    const outputTokens = data?.usage?.output_tokens || 0;

    logAnthropicUsage({
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

    return res.status(200).json(data);

  } catch (error) {
    console.error('Network Error:', error);
    logAnthropicUsage({
      callId: req.body?.callId || null,
      feature: req.body?.feature || 'unknown',
      timestamp: new Date().toISOString(),
      model: req.body?.model || 'claude-3-5-sonnet-20241022',
      ok: false,
      httpStatus: 500,
      durationMs: Date.now() - startedAt,
      maxTokensRequested: req.body?.max_tokens || 1024,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
      error: error.message || 'Internal Server Error'
    });
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
