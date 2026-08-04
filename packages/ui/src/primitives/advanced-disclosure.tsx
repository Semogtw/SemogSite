export type AdvancedDisclosureProps = {
  summary: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
};

export function AdvancedDisclosure({
  summary,
  children,
  defaultOpen = false,
  className,
}: AdvancedDisclosureProps): React.JSX.Element {
  const normalizedSummary = summary.trim();
  if (normalizedSummary.length === 0 || normalizedSummary.length > 120) {
    throw new Error("ADVANCED_DISCLOSURE_SUMMARY_INVALID");
  }
  return (
    <details className={className} open={defaultOpen || undefined}>
      <summary>{normalizedSummary}</summary>
      <div>{children}</div>
    </details>
  );
}
