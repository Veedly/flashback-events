import { Aperture } from "lucide-react";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand-mark" aria-label="Flashback">
      <span className="brand-icon">
        <Aperture size={compact ? 18 : 20} strokeWidth={2.2} />
      </span>
      <span>flashback</span>
    </div>
  );
}
