import { TriangleAlert } from "lucide-react";

export function ErrorState({ title, description }: { title: string; description: string }) {
  return (
    <div className="sem-state sem-state--error" role="alert">
      <TriangleAlert aria-hidden="true" size={22} />
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}
