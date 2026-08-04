import {
  CommandRegistry,
  transitionAttentionCommand,
} from "@semogtw/application";

export function createDevOSCommandRegistry(): CommandRegistry {
  return new CommandRegistry([transitionAttentionCommand]);
}
