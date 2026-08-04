export type AgentWriteSwitchState = {
  globalEnabled: boolean;
  clientEnabled: boolean;
  domainEnabled: boolean;
};

export function writesAllowed(input: AgentWriteSwitchState): boolean {
  return (
    typeof input === "object" &&
    input !== null &&
    input.globalEnabled === true &&
    input.clientEnabled === true &&
    input.domainEnabled === true
  );
}
