# Privacy & PHI Architecture — whatimado.com

**Product scope:** Career enablement and productivity coaching — **not** healthcare, treatment, or recovery tracking.

This document is the authoritative blueprint for HIPAA/PHI-safe behavior. Implementation lives in `index.html` (`PHI_*` helpers) and Supabase migrations.

---

## 1. Profile fields — raw text risk surfaces

| Field | Source | PHI risk | Identity link | Storage | Target behavior |
|-------|--------|----------|---------------|---------|-----------------|
| `userProfile.skills` | Clarifying chat answers | **High** — verbatim user text | `user_id` via cloud sync | localStorage + `user_journeys.payload` | Sanitize via `sanitizeCareerProfileText()` before persist/prompt |
| `userProfile.goals` | First user message | **High** | same | same | Sanitize before persist/prompt |
| `userProfile.constraints` | Conversation inference | **Medium** | same | same | Sanitize before persist/prompt |
| `userProfile.summary` | Derived from above + enums | **Medium** | same | same | Rebuilt from sanitized fields only |
| `userProfile.name` | User-entered | Low (PII, not PHI) | same | same | Keep; not health-related |
| `idStatus`, `housingStatus`, `dependentSupport`, etc. | Structured intake enums | **Low** — not free text | same | same | Keep enums; never attach free-text health notes |

**Removed:** Any inference of sobriety, recovery, mental health, diagnosis, or treatment status from chat text.

---

## 2. Conversation & task transcripts

| Data | PHI risk | Identity link | Storage | Target behavior |
|------|----------|---------------|---------|-----------------|
| `state.history` | **High** — full chat | Session + account | localStorage (full); **cloud stripped** | Cloud sync via `stripTranscriptsFromCloudPayload()` — never upload raw transcripts |
| `state.allTaskChats` (notes, drafts, threads) | **High** | same | same | Local only; stripped from cloud payload |
| `savedMaps[].history` / `allTaskChats` | **High** | same | same | Stripped per-map on cloud write |

AI prompts use `getSanitizedConversationSummary()` — health-adjacent sentences removed before Anthropic calls.

---

## 3. Feedback & suggestion free-text inputs

| Input | Table | PHI risk | Identity link | Target behavior |
|-------|-------|----------|---------------|-----------------|
| Site suggestion box | `site_suggestions` | **High** if user pastes health details | `submitter_name`, `user_id`, `session_id` | UI warns against personal/health details; `sanitizeFreeTextForStorage()` before insert |
| Map feedback detail | `site_suggestions` (as summary) | **Medium** | same | Same redaction; sentiment-only analytics metadata |

---

## 4. Analytics (`site_events`)

| Event | Risk | Fix |
|-------|------|-----|
| Most events | Low — counts/enums only | `cleanAnalyticsMetadata()` caps strings at 48 chars |
| `task_roadblock_clicked` | Was **High** — raw label text | Uses stable `roadblock_code` enum only |

Retention: 90-day rolling delete via `003_retention_policies.sql` (pg_cron when available).

---

## 5. Third-party data flows

| Service | Data sent | PHI policy |
|---------|-----------|------------|
| **Anthropic (Claude)** | Sanitized prompts via `/api/claude` | Guardrail block prepended; health sentences stripped; no recovery-status system prompts |
| **Supabase** | Structured roadmap + enums; no raw transcripts in cloud | RLS insert-only for events/suggestions |
| **Stripe** | Donation amount/label only | No user chat or health data |

---

## 6. Explicitly prohibited (standing constraints)

- No `recovery_status`, `sobriety_status`, or health risk score fields
- No keyword inference for substance use, treatment, or mental health
- No system prompts that classify users by health status
- No long-term cloud storage of raw conversational text tied to identity

---

## 7. Implementation phases (completed in code)

0. This document  
1. Remove sobriety/recovery inference and health labeling  
2. Cloud transcript isolation + local-only raw chat  
3. Profile slice sanitization + feedback redaction  
4. AI prompt guardrails (`getPhiGuardrailPromptBlock`)  
5. Migrations, retention, analytics hardening  
6. Repo grep verification checklist (see bottom)

### Verification grep (run before release)

```bash
rg -i 'conversationMentionsRecoveryTreatment|getRecoveryStabilityPromptBlock|sober from|in recovery' index.html
rg -i 'roadblock: roadblockLabel' index.html
rg 'history.*user_journeys|allTaskChats' index.html  # confirm cloud strip path exists
```
