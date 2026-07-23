export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { model, messages, max_tokens } = req.body;

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
        model: model || 'claude-3-5-sonnet-20241022',
        max_tokens: max_tokens || 1024,
        messages: safeMessages
      })
    });

    if (!anthropicResponse.ok) {
      const errorText = await anthropicResponse.text();
      return res.status(anthropicResponse.status).json({ error: `Anthropic API Error: ${errorText}` });
    }

    const data = await anthropicResponse.json();
    return res.status(200).json(data);

  } catch (error) {
    console.error('Network Error:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
