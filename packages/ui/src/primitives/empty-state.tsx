import { Inbox } from "lucide-react";

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="sem-state" role="status">
      <Inbox aria-hidden="true" size={22} />
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}
