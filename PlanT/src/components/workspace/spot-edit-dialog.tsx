"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  fromDatetimeLocalValue,
  toDatetimeLocalValue,
} from "@/lib/datetime";
import type { SpotDto } from "@/types/trip";

type SpotEditDialogProps = {
  spot: SpotDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

export function SpotEditDialog({
  spot,
  open,
  onOpenChange,
  onSaved,
}: SpotEditDialogProps) {
  const [name, setName] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [openHours, setOpenHours] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!spot) return;
    setName(spot.name);
    setScheduledAt(toDatetimeLocalValue(spot.scheduledAt));
    setOpenHours(spot.openHours ?? "");
    setNotes(spot.notes ?? "");
    setError(null);
  }, [spot]);

  async function handleSave() {
    if (!spot || !name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/spot/${spot.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          scheduledAt: fromDatetimeLocalValue(scheduledAt),
          openHours: openHours.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "儲存失敗");
      }
      onOpenChange(false);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!spot) return;
    if (!confirm(`確定刪除「${spot.name}」？`)) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/spot/${spot.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "刪除失敗");
      }
      onOpenChange(false);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "刪除失敗");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-emerald-200 bg-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-emerald-950">編輯景點</DialogTitle>
          <DialogDescription>
            自訂名稱、行程時間與備註
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-emerald-800">
              名稱
            </label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-emerald-800">
              行程時間
            </label>
            <Input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-emerald-800">
              營業／開放時間（選填）
            </label>
            <Input
              placeholder="例：10:00–21:00"
              value={openHours}
              onChange={(e) => setOpenHours(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-emerald-800">
              備註
            </label>
            <Input
              placeholder="例：午餐、預約編號"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={deleting || saving}
          >
            <Trash2 className="h-4 w-4" />
            刪除
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              取消
            </Button>
            <Button onClick={handleSave} disabled={saving || !name.trim()}>
              {saving ? "儲存中…" : "儲存"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
