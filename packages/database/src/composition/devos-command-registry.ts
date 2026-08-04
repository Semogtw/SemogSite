import {
  CommandRegistry,
  completeStageCommand,
  transitionAttentionCommand,
} from "@semogtw/application";

export function createDevOSCommandRegistry(): CommandRegistry {
  return new CommandRegistry([
    transitionAttentionCommand,
    completeStageCommand,
  ]);
}
