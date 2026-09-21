import { appStore, touchJourney } from "../state/store.js";
import { setUserProfileField } from "../state/user-profile.js";
import { emptyLocationDraft, hasUsableLocation, isLocationSkip, locationFromDraft } from "../state/location.js";
import { callAdvisor } from "../advisor.js";
import { appendMessage } from "../ui.js";
import { hideIntakeChips, renderIntakeChips } from "../components/profile-chips.js";
import { PATH_MODE, parsePathMode, pathModeLabel } from "./path-mode.js";
import { buildClarifyingPrompt, clarifyingFallback, isFounderOrProjectPrompt } from "./clarifying.js";
import {
  INTAKE_STEP,
  getChipStep,
  isChipStep,
  nextChipStep,
  parseChipAnswer,
  parseFounderStage,
  parseHousingStatus,
  parseIdStatus,
  chipStepAnswered
} from "./profile-chips.js";
import { applyLocationAnswer, isLocationStep, locationPrompt } from "./location.js";
import {
  classifyStabilityContext,
  isClosedTestingFlow,
  shouldSuppressHousingStep,
  shouldSuppressIdStep
} from "./persona-signals.js";

function firstUserText() {
  return appStore.journey.messages.find((m) => m.role === "user")?.content || "";
}

/** Everything the user has said so far — a later turn can still reveal a need. */
function userBlob() {
  return appStore.journey.messages
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join("\n")
    .slice(0, 6000);
}

function founderMode() {
  return (
    isFounderOrProjectPrompt(firstUserText()) ||
    Boolean(appStore.profile.founderStage) ||
    isClosedTestingFlow(firstUserText()) ||
    isClosedTestingFlow(userBlob())
  );
}

/**
 * @param {{
 *   messagesEl: HTMLElement | null,
 *   layout: () => void,
 *   flush: () => void,
 *   onComplete: () => Promise<void> | void,
 *   setComposerEnabled: (enabled: boolean) => void
 * }} ui
 */
export function createIntakeController(ui) {
  const { messagesEl, layout, flush, onComplete, setComposerEnabled } = ui;

  function pushAdvisor(text) {
    if (!messagesEl) return;
    appendMessage(messagesEl, "advisor", text);
    appStore.journey.messages.push({ role: "assistant", content: text });
    touchJourney();
    layout();
    flush();
  }

  function pushUser(text) {
    if (!messagesEl) return;
    appendMessage(messagesEl, "user", text);
    appStore.journey.messages.push({ role: "user", content: text });
    appStore.journey.turnCount += 1;
    touchJourney();
    layout();
    flush();
  }

  function setStep(step) {
    appStore.journey.profileIntakeStep = step;
    appStore.journey.awaitingPathModeChoice = step === INTAKE_STEP.PATH_MODE;
    touchJourney();
    flush();
  }

  function completedSteps() {
    return Array.isArray(appStore.journey.completedIntakeSteps) ? appStore.journey.completedIntakeSteps : [];
  }

  function markStepComplete(step) {
    if (!step) return;
    const list = completedSteps();
    if (!list.includes(step)) list.push(step);
    appStore.journey.completedIntakeSteps = list;
  }

  function chipCtx(extra = {}) {
    const blob = userBlob();
    const founder = founderMode();
    return {
      founder,
      completedSteps: completedSteps(),
      suppressId: shouldSuppressIdStep(blob, { founder }),
      suppressHousing: shouldSuppressHousingStep(blob, { founder }),
      ...extra
    };
  }

  /** Record why we did or did not ask, so roadmap gates can read it later. */
  function recordStabilityContext() {
    const value = classifyStabilityContext(userBlob(), { founder: founderMode() });
    if (appStore.profile.stabilityContext === value) return;
    appStore.profile = setUserProfileField(appStore.profile, "stabilityContext", value);
    flush();
  }

  function lastAssistantText() {
    const msgs = appStore.journey.messages;
    for (let i = msgs.length - 1; i >= 0; i -= 1) {
      if (msgs[i].role === "assistant") return msgs[i].content;
    }
    return "";
  }

  function absorbClarifyingAnswer(text) {
    const asked = lastAssistantText().toLowerCase();
    if (/\b(id|driver'?s? license|state id|photo id|birth certificate|identification)\b/.test(asked)) {
      const value = parseIdStatus(text);
      if (value) {
        appStore.profile = setUserProfileField(appStore.profile, "idStatus", value);
        markStepComplete(INTAKE_STEP.ID);
      }
    }
    if (/\b(safe place|housing|shelter|stay for)\b/.test(asked)) {
      const value = parseHousingStatus(text);
      if (value) {
        appStore.profile = setUserProfileField(appStore.profile, "housingStatus", value);
        markStepComplete(INTAKE_STEP.HOUSING);
      }
    }
    const askedStage =
      /\b(still testing|first (?:real )?users|partner pilot|where is (?:the |this )?project|funding)\b/.test(asked) ||
      isFounderOrProjectPrompt(firstUserText());
    if (askedStage) {
      const founderStage = parseFounderStage(text);
      if (founderStage) {
        appStore.profile = setUserProfileField(appStore.profile, "founderStage", founderStage);
        markStepComplete(INTAKE_STEP.FOUNDER);
      }
    }
  }

  /** "Not yet" is a task we plan around, never a reason to withhold the rest. */
  function acknowledgeStabilityAnswer(field, value) {
    if (value !== "needs") return;
    if (field === "idStatus") {
      pushAdvisor(
        "Good to know — getting ID sorted goes in the roadmap as its own step, with the local office and what to bring. Everything else still moves forward while that's in motion."
      );
    } else if (field === "housingStatus") {
      pushAdvisor(
        "Thanks for telling me. I'll put somewhere stable near the front of the plan and keep the rest of your options open alongside it.");
    }
  }

  function showChipsForStep(step) {
    hideIntakeChips(messagesEl);
    const spec = getChipStep(step, { founder: founderMode() });
    if (!spec || !messagesEl) return;
    renderIntakeChips(messagesEl, {
      options: spec.options,
      onSelect: (option) => {
        void applyChip(option);
      }
    });
    layout();
  }

  function showPathMode() {
    hideIntakeChips(messagesEl);
    if (!messagesEl) return;
    renderIntakeChips(messagesEl, {
      variant: "path-mode",
      options: [],
      onSelect: (option) => {
        void applyPathMode(option.value, option.label);
      }
    });
    layout();
  }

  async function askClarifying() {
    setStep(INTAKE_STEP.CLARIFYING);
    setComposerEnabled(false);
    const typingEl = messagesEl ? appendMessage(messagesEl, "advisor", "…", { typing: true }) : null;
    layout();
    const userText = firstUserText();
    try {
      const reply =
        (await callAdvisor(buildClarifyingPrompt(userText, { pathMode: appStore.journey.pathMode }), {
          maxTokens: 280,
          feature: "v2_intake_clarifying"
        })) || clarifyingFallback(userText);
      typingEl?.remove();
      appStore.journey.clarifyingQuestionsAsked = 1;
      pushAdvisor(reply);
    } catch {
      typingEl?.remove();
      appStore.journey.clarifyingQuestionsAsked = 1;
      pushAdvisor(clarifyingFallback(userText));
    } finally {
      setComposerEnabled(true);
    }
  }

  function askChipStep(step) {
    const resolved =
      chipStepAnswered(appStore.profile, step) || completedSteps().includes(step)
        ? nextChipStep(appStore.profile, chipCtx({ skipStep: step }))
        : step;
    const spec = getChipStep(resolved, { founder: founderMode() });
    if (!resolved || !spec) {
      void continueAfterChips();
      return;
    }
    setStep(resolved);
    pushAdvisor(spec.prompt);
    showChipsForStep(resolved);
  }

  function beginChipIntake() {
    recordStabilityContext();
    const step = nextChipStep(appStore.profile, chipCtx());
    if (!step) {
      void continueAfterChips();
      return;
    }
    askChipStep(step);
  }

  function askLocationStep(step) {
    setStep(step);
    hideIntakeChips(messagesEl);
    pushAdvisor(locationPrompt(step, appStore.locationDraft));
  }

  function beginLocationIntake() {
    if (hasUsableLocation(appStore.location) || appStore.journey.locationConfirmed) {
      void beginNameOrFinish();
      return;
    }
    appStore.locationDraft = emptyLocationDraft();
    askLocationStep(INTAKE_STEP.LOCATION_COUNTRY);
  }

  function beginNameOrFinish() {
    if (!appStore.profile.name) {
      setStep(INTAKE_STEP.NAME);
      hideIntakeChips(messagesEl);
      pushAdvisor("What should I call you? (Type skip if you'd rather not.)");
      return;
    }
    void finishIntake();
  }

  async function finishIntake() {
    hideIntakeChips(messagesEl);
    setStep(null);
    appStore.journey.intakeComplete = true;
    appStore.journey.awaitingPathModeChoice = false;
    touchJourney();
    flush();
    await onComplete();
  }

  async function continueAfterChips() {
    beginLocationIntake();
  }

  async function applyPathMode(value, label, { alreadyLogged = false } = {}) {
    const mode = value === PATH_MODE.DIRECT || value === PATH_MODE.FLEXIBLE ? value : parsePathMode(value);
    if (!mode) return false;
    hideIntakeChips(messagesEl);
    appStore.journey.pathMode = mode;
    appStore.journey.awaitingPathModeChoice = false;
    if (!alreadyLogged) pushUser(label || pathModeLabel(mode));
    await askClarifying();
    return true;
  }

  async function applyChip(option, { alreadyLogged = false } = {}) {
    const step = appStore.journey.profileIntakeStep;
    hideIntakeChips(messagesEl);
    if (option.field === "pathMode" || step === INTAKE_STEP.PATH_MODE) {
      return applyPathMode(option.value, option.label, { alreadyLogged });
    }
    if (!option.field || option.value == null || option.value === "") return false;
    if (!alreadyLogged) pushUser(option.label);
    markStepComplete(step);
    appStore.profile = setUserProfileField(appStore.profile, option.field, option.value);
    acknowledgeStabilityAnswer(option.field, option.value);
    const next = nextChipStep(appStore.profile, chipCtx({ skipStep: step }));
    if (next) askChipStep(next);
    else await continueAfterChips();
    return true;
  }

  async function handleTypedAnswer(text) {
    const step = appStore.journey.profileIntakeStep;
    const trimmed = String(text || "").trim();
    if (!trimmed || !step) return false;

    if (step === INTAKE_STEP.PATH_MODE) {
      const mode = parsePathMode(trimmed);
      if (!mode) {
        pushAdvisor("Choose Direct Path or Flexible Path below — or type direct / flexible.");
        showPathMode();
        return true;
      }
      await applyPathMode(mode, pathModeLabel(mode), { alreadyLogged: true });
      return true;
    }

    if (step === INTAKE_STEP.CLARIFYING) {
      absorbClarifyingAnswer(trimmed);
      beginChipIntake();
      return true;
    }

    if (isLocationStep(step)) {
      if (step === INTAKE_STEP.LOCATION_COUNTRY && isLocationSkip(trimmed)) {
        beginNameOrFinish();
        return true;
      }
      const result = applyLocationAnswer(step, trimmed, appStore.locationDraft);
      appStore.locationDraft = result.draft;
      if (result.next === "done") {
        appStore.location = locationFromDraft(result.draft);
        appStore.journey.locationConfirmed = true;
        touchJourney();
        flush();
        beginNameOrFinish();
        return true;
      }
      askLocationStep(result.next);
      return true;
    }

    if (step === INTAKE_STEP.NAME) {
      if (!/^(skip|n\/a|na|pass|no thanks)$/i.test(trimmed)) {
        appStore.profile = setUserProfileField(appStore.profile, "name", trimmed.split(/\s+/).slice(0, 3).join(" "));
      }
      await finishIntake();
      return true;
    }

    if (isChipStep(step)) {
      const parsed = parseChipAnswer(step, trimmed);
      if (!parsed.value) {
        pushAdvisor("Pick one of the options below, or say it in your own words.");
        showChipsForStep(step);
        return true;
      }
      await applyChip({ field: parsed.field, value: parsed.value, label: trimmed }, { alreadyLogged: true });
      return true;
    }

    return false;
  }

  function startAfterFirstPrompt() {
    recordStabilityContext();
    setStep(INTAKE_STEP.PATH_MODE);
    pushAdvisor("How do you want to explore your options?");
    showPathMode();
  }

  function restoreChips() {
    const step = appStore.journey.profileIntakeStep;
    if (!step || appStore.journey.intakeComplete) return;
    if (step === INTAKE_STEP.PATH_MODE || appStore.journey.awaitingPathModeChoice) {
      showPathMode();
      return;
    }
    if (isChipStep(step)) showChipsForStep(step);
  }

  function isBlocking() {
    const { intakeComplete, profileIntakeStep, awaitingPathModeChoice } = appStore.journey;
    if (intakeComplete) return false;
    return Boolean(profileIntakeStep || awaitingPathModeChoice);
  }

  return {
    startAfterFirstPrompt,
    handleTypedAnswer,
    restoreChips,
    isBlocking,
    applyPathMode,
    applyChip
  };
}
