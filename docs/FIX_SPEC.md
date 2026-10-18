# WHATIMADO v2 repair specification

## Purpose and authority

Repair goal drift, intake pacing, path controls, tasks/resources, outreach composition, and state/error handling. This specification reconstructs six requirements and 17 acceptance criteria from the supplied Cursor diagnosis and the goals discussed. It does not reproduce the missing original specification. Use the numbering below for new implementation prompts; older phase prompts referring to other acceptance-test numbers must be remapped by meaning.

## Scope

Development v2 only. Confirm its actual entry point and repository paths before editing. Preserve legacy, production, branding, mobile layout, navigation, account protections, and unrelated behavior. No deployment, sending integration, dependency upgrades, or broad cleanup. Necessary mobile fixes must preserve the existing visual design.

Use the existing state architecture where practical. Implement in focused, testable changes. Do not overwrite unrelated work. This specification authorizes scoped implementation, not a claim that the diagnosis is already proven.

## Evidence and investigation

The supplied Cursor diagnosis reports scattered goal context, unpopulated profile goal fields, inconsistent prompt inputs, generic initial-generation fallbacks, multiple busy/status mechanisms, a hard-coded creative-director outreach persona, and stripped cloud conversation fields. These findings were reported by Cursor, not independently verified here. Inspect current code and confirm before relying on them.

Founder-to-career drift, stacked status messages, handler collisions, resource mismatch, and restored-goal loss are suspected consequences. Reproduce or test them before naming a confirmed cause.

Reported inspection targets include `intake/session.js`, `intake/stability-gates.js`, `advisor.js`, `map/ideas.js`, `map/session.js`, `roadmap/session.js`, `roadmap/missions.js`, `roadmap/resources.js`, `roadmap/drafts.js`, `state/journey.js`, `state/user-profile.js`, `state/persistence.js`, `cloud-roadmaps.js`, and `chat-flow.js` under `js/v2` where applicable. Verify actual paths and ownership; do not invent missing files or APIs.

## Requirement 1: Shared goal context without goal drift

Maintain one normalized, versioned goal brief through intake, exploration, route generation, confirmation, missions, resources, and outreach. Reuse existing journey/profile ownership instead of creating competing stores.

Represent the user's current intent, desired outcomes, background, skills/interests, constraints, location/remote preference, unknowns, and deliberate corrections. Distinguish stated facts from tentative inferences and unknowns. Background is not intent: being a designer does not mean seeking a design job. Preserve mixed, uncertain, and uncategorized goals rather than forcing employment, training, or freelance categories.

Update context when the user provides information. Explicit corrections supersede obsolete goals; discussing an alternative alone does not change the goal. Link generated content to its goal version and selected route. On correction, invalidate or clearly mark incompatible downstream content stale; obsolete responses must not restore it.

Pass consistent brief context to all relevant prompt builders, including exploration, path ideas, plan confirmation, missions, resource selection, and draft generation. Do not assume the full transcript alone will preserve intent. Maintain compatible behavior for existing users and snapshots.

## Requirement 2: Adaptive intake and readiness

Ask one relevant missing question at a time. At most one blocking question surface may be active, including chips, typed questions, location prompts, and clarification. Reuse information already supplied; avoid duplicate questions across handlers.

Explore situation, knowledge, interests, hobbies, past work, transferable skills, experience, and constraints only as needed for the current goal. Do not automatically require housing, identification, or stability questions from everyone. Preserve relevant support safeguards and explain sensitive questions when necessary.

Use an explicit readiness check, not a fixed question count or completion of logistics alone. Enough context must exist to offer meaningfully differentiated, useful options without inventing essential facts. Unknown or skipped nonessential answers remain unknown. Uncertain users may explore before committing. Permit explicitly labeled provisional options when requested, identifying missing information and assumptions.

Do not assume the user wants to monetize a hobby or return to an old career. Avoid endless intake when useful options can already be offered.

## Requirement 3: Goal-aligned routes and distinct path controls

Generate genuinely distinct routes aligned with the current brief. Explain personal fit, important assumptions, trade-offs, and first actions. Label uncertainty. Do not create renamed duplicates, forced career categories, or silent generic fallbacks. Do not override the user's intent with location, profession, or stability heuristics.

Keep these operations separate:

- **More paths** appends unique additional options while retaining existing options and selection.
- **Regenerate** refreshes the option set against the current brief. Remove stale selection and associated work only after successful replacement.
- **Alter path direction** collects the requested change, updates relevant context, and performs one appropriate revision. Distinguish a global direction change from altering one particular path; preserve unrelated options for a targeted change.

Coordinate toolbar and composer actions. Prevent conflicting mutations, repeated-click duplicates, and old responses overwriting newer accepted state. Maintain compatible interfaces when changes are split across phases.

On network, provider, empty-output, parse, or validation failure, preserve valid prior paths and user input. If no valid map exists, show a recoverable failure and retry rather than committing generic paths or setting a success flag. Do not clear valid work merely because an operation starts.

## Requirement 4: Actionable tasks and trustworthy resources

Derive tasks from the current confirmed route and brief. Each task must have a concrete action, purpose, useful output, and dependencies where relevant. Do not invent user commitments, quotas, or deadlines.

Match each resource to the actual task, provider role, constraints, and relevant locale. Ask location only when needed. Distinguish directories from direct service providers. Explain why a resource fits, what is actually known about its offerings, uncertainty, and the next practical step.

Remove unconditional Austin/design/employment resource injections. Never fabricate contacts, services, programs, eligibility, funding, sponsorship, availability, or deadlines. Contact details being present does not make them verified. Only claim verification when supported by source/provenance under a clear policy; otherwise label the lead or contact as unverified or needing confirmation.

Normalize resource fields before rendering. Avoid duplicate why/details text, broken joins, raw objects, and description fragments while preserving useful distinct content. Treat resource/model text as data, not executable instructions. Stale tasks/resources must not appear to belong to a newer goal or route.

## Requirement 5: Accurate, editable outreach with validation

Keep the current copy-only workflow. Do not add sending, submission, booking, or third-party messaging. If repository inspection reveals an existing send action, apply validation to it too without expanding its capabilities.

Compose from the current goal, selected task, actual user background, and supported recipient role. Include an accurate introduction, recipient-specific reason, appropriate ask, and complete sentences. Remove the hard-coded creative-director persona from both generated and fallback drafts. Invent no personal or provider facts.

Validate the real composition pipeline for empty essentials, broken joins, unresolved placeholders, recipient/goal mismatch, stale context, and unsupported claims. Ask for missing essentials or mark the draft incomplete; omit nonessential missing details rather than inserting unnecessary placeholders. Do not require an email address for a contact-form/message draft.

Incomplete drafts remain editable. Block the ready-to-use Copy action, and any existing send action, until required fields resolve; identify what needs attention. Recognize actual placeholders such as `[your name]` or `[two times]` without rejecting ordinary bracketed prose. Missing email may lead to contact-form/message copy, never an invented address. Copying is never described as sending.

## Requirement 6: State consistency, persistence, and recoverable errors

Coordinate journey, profile, graph, selection, and downstream work using consistent goal and operation versions. Allow one coherent mutation policy across blocking handlers. Release locks on every terminal outcome and reject obsolete responses.

Use one current operation-status owner per surface. Replace transient progress/error feedback on retry instead of accumulating duplicate boxes or bubbles. Preserve genuine conversation history. Keep operation-specific errors useful and allow recovery after sequential failures.

Persist the minimum structured brief necessary to restore intent under existing privacy/consent rules. Do not bypass transcript-stripping protections or persist entire conversations merely to solve restore. Handle older snapshots without brief fields safely; label unknown context instead of inventing it.

Diagnostics must exclude secrets and raw personal conversations. Preserve valid maps, drafts, and input on failure; invalidate dependent work when the underlying accepted goal/route actually changes.

## Acceptance tests 1–17

These are replacement acceptance criteria, not recovered originals. Use deterministic fixtures and mocked network/model responses for automated tests. Exercise real handlers, state updates, prompt construction, composition, and UI where applicable. Assert prohibited behavior as well as expected behavior; mocked text alone does not prove semantic quality.

1. **Founder versus job seeker:** identical design backgrounds with different explicit goals produce different brief/prompt inputs. A funding/collaborator-seeking founder is not routed into generic employment; the job seeker retains employment intent. Missions/resources/outreach follow the respective goal.
2. **Urgent no-car parent:** retain urgency, transport and childcare constraints throughout the flow. No car-dependent default actions or invented availability. Relevant support questions may appear without replacing the user's stated goal.
3. **Employed trade explorer:** retain current employment and exploratory intent. Offer distinct trade exploration routes without assuming immediate resignation or defaulting to design/freelance work.
4. **Commission artist:** preserve the stated commission goal and actual skills; do not silently turn it into salaried employment or assume unrelated artistic ambitions.
5. **Customer-seeking business:** routes, tasks, resources, and outreach support acquiring suitable customers rather than inventing a funding or job-search goal.
6. **Uncertain user:** support exploration without fabricating a settled career goal; distinguish tentative possibilities from decisions.
7. **Mixed rent-plus-app goals:** preserve both near-term income needs and the longer-term app project, including their trade-offs, instead of dropping either goal.
8. **Childcare support and neighborhood workshop:** separate fixtures retain these nonstandard goals without forcing career categories. Resource roles and first actions match each actual need.
9. **Intake readiness:** supplied answers are not repeated; only one blocking question surface appears. Logistics alone do not trigger readiness. Optional skips remain unknown, sensitive questions are relevant/explained, provisional output is labeled, and hobbies/past jobs are not presumed desired careers. Test each subcase.
10. **Route quality and correction:** options are meaningfully distinct with fit, assumptions, trade-offs, and first actions. An explicit goal correction propagates to subsequent generation while retaining unchanged constraints; casual discussion alone does not replace intent. No renamed duplicates or silent generic fallback.
11. **Stale-response rejection:** delay an earlier request, then correct the goal or accept a newer operation. The older response cannot restore obsolete paths, tasks, resources, or drafts. Assert versions and actual committed state.
12. **Task/resource integrity:** actions have purpose/output/dependencies and no unchosen quotas/deadlines. Wrong-goal and wrong-locale resources are rejected. Directories are not represented as providers. Missing verification is labeled; contact presence alone earns no verified claim. Duplicate/malformed fields render cleanly and no contact/program facts are invented.
13. **Distinct control success:** More paths appends unique nodes and preserves selection; Regenerate replaces options and clears obsolete dependent work only on success; global Alter direction performs one amended generation; targeted path alteration preserves unrelated options. Exercise toolbar and composer handlers.
14. **Failure and concurrency recovery:** test network rejection, provider failure, malformed/empty output, rapid repeated clicks, overlapping intents, and sequential failed operations. Preserve prior valid map/selection/input/work, release locks, deduplicate transient status, and allow retry. First-generation failure creates neither a generic success map nor a false success flag.
15. **Outreach validation:** generated and fallback drafts use actual background and correct recipient role. Test missing essentials, unsupported claims, broken joins, placeholders, goal/recipient mismatch, and stale versions. Incomplete drafts stay editable but cannot copy as ready-to-use; fixing essentials enables Copy. Ordinary bracketed prose is allowed. Missing email permits message copy without fabrication. No new sending integration or false sent confirmation.
16. **Integrated consistency and persistence:** every displayed path/task/resource/draft belongs to the current accepted goal and route or is clearly stale. Correcting goals invalidates incompatible work. Save/restore preserves permitted structured intent without restoring stripped transcript data. Older snapshots load safely and unknowns remain unknown. Exercise the integrated pipeline, not only state mocks.
17. **Mobile and regression:** check path controls, long goals/titles, intake questions, loading/errors, resources, and editable outreach in desktop and mobile layouts. Preserve branding/navigation and unrelated behavior. Run available existing regressions, confirm no legacy/production/deployment changes, and explicitly mark unavailable device/live checks untested.

## Implementation sequence and completion report

First verify the diagnosis against current code and identify actual tests/commands. Then implement shared goal/version state and preservation on failure; adaptive intake; route generation and coordinated controls; tasks/resources; outreach; and integrated verification. Add focused tests during each phase rather than leaving all tests until the end. Keep one functional layer per run where practical, without an arbitrary file-count limit.

Use this specification's acceptance numbering for any new phase prompts. If an older prompt names different numbers, map its intended behavior to these criteria before proceeding. Stop after each scoped phase with files changed, commands executed, actual results, remaining blockers, and the next dependency.

Finish with a criterion-to-test checklist marking passed, failed, and untested subcases. Separate confirmed causes from hypotheses and assumptions. Run a small contrasting-goal and multi-turn live semantic evaluation if supported; mocks do not establish live model quality. Disclose provider/configuration/device limits. Claim only executed checks as passed. Do not deploy or perform unrelated cleanup.
