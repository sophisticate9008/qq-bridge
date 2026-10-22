// A short conversational window grants model attention, never a mandatory reply.
export function dialogueWindowMs(cfg) {
  return Math.min(300000, Math.max(0, Number(cfg.localPolicy?.dialogueWindowMs) || 0));
}

export function dialogueWakeReason(cfg, state, event, { direct = false, quoteTargetIsSelf = false, now = Date.now() } = {}) {
  const windowMs = dialogueWindowMs(cfg);
  const speakerId = event.user_id == null ? '' : String(event.user_id);
  if (!windowMs || !speakerId) return null;
  if (direct) {
    state.localDialogue = { speakerId, expiresAt: now + windowMs };
    return null;
  }
  const dialogue = state.localDialogue;
  if (!dialogue) return null;
  const segments = Array.isArray(event.message) ? event.message : [];
  const addressingOthers = segments.some(s => s?.type === 'at' && String(s.data?.qq) !== String(event.self_id))
    || (segments.some(s => s?.type === 'reply') && !quoteTargetIsSelf);
  if (now > dialogue.expiresAt || dialogue.speakerId !== speakerId || addressingOthers) {
    delete state.localDialogue;
    return null;
  }
  return 'dialogueFollowup';
}

// Only a real outgoing reply renews the window; unanswered incoming chatter doesn't.
export function renewDialogueAfterReply(cfg, state, now = Date.now()) {
  const windowMs = dialogueWindowMs(cfg);
  if (windowMs && state.localDialogue?.expiresAt >= now) {
    state.localDialogue.expiresAt = now + windowMs;
  }
}
