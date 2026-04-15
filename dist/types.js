// ---------------------------------------------------------------------------
// Core integration types for @weldable/integration-core
//
// Two distinct layers:
//   Author-facing (IntegrationDef / ActionDef) — what integration packages write.
//   Consumer-facing (Integration / Action)     — what defineIntegration() produces.
//
// defineIntegration() is the compilation step: it transforms ActionDef.actionId
// (local, e.g. 'post_message') into Action.id (composite, e.g. 'slack.post_message').
// ---------------------------------------------------------------------------
export {};
