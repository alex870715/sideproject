"use client";

import { Input } from "@/components/ui/input";

type TripDateFieldsProps = {
  start: string;
  end: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
};

export function TripDateFields({
  start,
  end,
  onStartChange,
  onEndChange,
  disabled,
  className,
}: TripDateFieldsProps) {
  return (
    <div className={className}>
      <p className="mb-2 text-left text-sm font-medium text-emerald-900">
        出遊日期
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-left text-xs text-emerald-800">
            出發日
          </label>
          <Input
            type="date"
            value={start}
            onChange={(e) => onStartChange(e.target.value)}
            disabled={disabled}
            min={toDateMin()}
          />
        </div>
        <div>
          <label className="mb-1 block text-left text-xs text-emerald-800">
            回程日
          </label>
          <Input
            type="date"
            value={end}
            onChange={(e) => onEndChange(e.target.value)}
            disabled={disabled}
            min={start || toDateMin()}
          />
        </div>
      </div>
    </div>
  );
}

function toDateMin(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
