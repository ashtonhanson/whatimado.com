/**
 * Stripe Checkout Session API (deploy alongside claude.js as /api/stripe-checkout)
 *
 * Required env var on your host:
 *   STRIPE_SECRET_KEY=sk_live_...  (or sk_test_... while testing)
 *
 * Optional:
 *   SITE_URL=https://whatimado.com
 *
 * Monthly support can use a recurring Price ID (price_...) or a dynamic amount from the client.
 * All other tiers use dynamic one-time amounts ? including custom donations.
 */

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return res.status(503).json({
      error: "Stripe is not configured yet. Add STRIPE_SECRET_KEY to your hosting environment."
    });
  }

  try {
    const { amount, label, recurring, stripePriceId } = req.body || {};
    const origin = req.headers.origin || process.env.SITE_URL || "https://whatimado.com";
    const baseUrl = origin.replace(/\/$/, "");
    const successUrl = `${baseUrl}/?donation=success`;
    const cancelUrl = `${baseUrl}/?donation=cancel`;

    const params = new URLSearchParams();
    params.append("mode", recurring ? "subscription" : "payment");
    params.append("success_url", successUrl);
    params.append("cancel_url", cancelUrl);
    params.append("allow_promotion_codes", "true");

    if (recurring) {
      const cents = Math.round(Number(amount) * 100);
      const canUseDynamic = Number.isFinite(cents) && cents >= 100;

      if (canUseDynamic) {
        const productName = label ? `whatimado - ${label}` : "whatimado monthly support";
        params.append("line_items[0][price_data][currency]", "usd");
        params.append("line_items[0][price_data][product_data][name]", productName);
        params.append("line_items[0][price_data][unit_amount]", String(cents));
        params.append("line_items[0][price_data][recurring][interval]", "month");
        params.append("line_items[0][quantity]", "1");
      } else if (stripePriceId) {
        params.append("line_items[0][price]", stripePriceId);
        params.append("line_items[0][quantity]", "1");
      } else {
        return res.status(400).json({
          error: "Monthly support needs an amount or a Stripe Price ID."
        });
      }
    } else {
      const cents = Math.round(Number(amount) * 100);
      if (!Number.isFinite(cents) || cents < 100) {
        return res.status(400).json({ error: "Minimum donation is $1." });
      }

      const productName = label ? `whatimado ? ${label}` : "whatimado donation";
      params.append("line_items[0][price_data][currency]", "usd");
      params.append("line_items[0][price_data][product_data][name]", productName);
      params.append("line_items[0][price_data][unit_amount]", String(cents));
      params.append("line_items[0][quantity]", "1");
    }

    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: params.toString()
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error?.message || "Stripe checkout could not be created."
      });
    }

    return res.status(200).json({ url: data.url });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
