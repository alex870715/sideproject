"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SortableDayTimeline } from "@/components/workspace/sortable-day-timeline";
import { SpotEditDialog } from "@/components/workspace/spot-edit-dialog";
import { fromDatetimeLocalValue } from "@/lib/datetime";
import type { SpotDto, TripDto } from "@/types/trip";

type TimelinePanelProps = {
  trip: TripDto;
  onTripUpdate: (trip: TripDto) => void;
  onDiscoverSpot: (spot: SpotDto) => void;
  onDaySelect?: (dayGroupId: string) => void;
};

export function TimelinePanel({
  trip,
  onTripUpdate,
  onDiscoverSpot,
  onDaySelect,
}: TimelinePanelProps) {
  const [graftingId, setGraftingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTime, setNewTime] = useState("");
  const [sproutMemberId, setSproutMemberId] = useState(
    trip.members[0]?.id ?? ""
  );
  const [editingSpot, setEditingSpot] = useState<SpotDto | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  async function refreshTrip() {
    const res = await fetch(`/api/trip/${trip.seedCode}`);
    if (res.ok) onTripUpdate(await res.json());
  }

  async function handleGraft(spotId: string) {
    setGraftingId(spotId);
    try {
      const res = await fetch(`/api/spot/${spotId}/graft`, { method: "PATCH" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Graft failed");
      }
      await refreshTrip();
    } catch (e) {
      console.error(e);
    } finally {
      setGraftingId(null);
    }
  }

  async function handleAddSpot(isTrunk: boolean) {
    if (!newName.trim()) return;
    setAdding(true);
    try {
      const member = trip.members.find((m) => m.id === sproutMemberId);
      const res = await fetch(`/api/trip/${trip.seedCode}/spot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          latitude: 33.59 + Math.random() * 0.02,
          longitude: 130.4 + Math.random() * 0.02,
          isTrunk,
          scheduledAt: fromDatetimeLocalValue(newTime),
          memberId: isTrunk ? undefined : sproutMemberId || undefined,
          memberName: isTrunk ? undefined : member?.name,
        }),
      });
      if (!res.ok) throw new Error("Failed to add spot");
      setNewName("");
      setNewTime("");
      await refreshTrip();
    } catch (e) {
      console.error(e);
    } finally {
      setAdding(false);
    }
  }

  return (
    <>
      <div className="flex h-full min-h-[400px] flex-col rounded-xl border border-emerald-200 bg-white/90 shadow-sm">
        <div className="border-b border-emerald-100 px-4 py-3">
          <h2 className="font-semibold text-emerald-950">{trip.title}</h2>
          <p className="font-mono text-xs text-emerald-600">
            Seed: {trip.seedCode} · 拖曳調整順序
          </p>
        </div>

        <Tabs defaultValue="trunk" className="flex flex-1 flex-col px-4 pb-4">
          <TabsList className="w-full">
            <TabsTrigger value="trunk" className="flex-1">
              🌳 Trunk Route
            </TabsTrigger>
            <TabsTrigger value="sprouts" className="flex-1">
              🌱 My Sprouts
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="trunk"
            className="flex-1 space-y-3 overflow-y-auto"
          >
            <SortableDayTimeline
              trip={trip}
              isTrunk
              onDaySelect={onDaySelect}
              onEdit={(s) => {
                setEditingSpot(s);
                setEditOpen(true);
              }}
              onDiscover={onDiscoverSpot}
              onTripUpdate={onTripUpdate}
            />
            <AddSpotForm
              newName={newName}
              setNewName={setNewName}
              newTime={newTime}
              setNewTime={setNewTime}
              adding={adding}
              onAdd={() => handleAddSpot(true)}
              label="加入主幹"
            />
          </TabsContent>

          <TabsContent
            value="sprouts"
            className="flex-1 space-y-3 overflow-y-auto"
          >
            <SortableDayTimeline
              trip={trip}
              isTrunk={false}
              onDaySelect={onDaySelect}
              onEdit={(s) => {
                setEditingSpot(s);
                setEditOpen(true);
              }}
              onDiscover={onDiscoverSpot}
              onGraft={handleGraft}
              graftingId={graftingId}
              onTripUpdate={onTripUpdate}
            />
            {trip.members.length > 0 && (
              <select
                className="h-8 w-full rounded-md border border-emerald-200 bg-white px-2 text-sm"
                value={sproutMemberId}
                onChange={(e) => setSproutMemberId(e.target.value)}
              >
                {trip.members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} 的支線
                  </option>
                ))}
              </select>
            )}
            <AddSpotForm
              newName={newName}
              setNewName={setNewName}
              newTime={newTime}
              setNewTime={setNewTime}
              adding={adding}
              onAdd={() => handleAddSpot(false)}
              label="種一支 Sprout"
            />
          </TabsContent>
        </Tabs>
      </div>

      <SpotEditDialog
        spot={editingSpot}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={refreshTrip}
      />
    </>
  );
}

function AddSpotForm({
  newName,
  setNewName,
  newTime,
  setNewTime,
  adding,
  onAdd,
  label,
}: {
  newName: string;
  setNewName: (v: string) => void;
  newTime: string;
  setNewTime: (v: string) => void;
  adding: boolean;
  onAdd: () => void;
  label: string;
}) {
  return (
    <div className="space-y-2 border-t border-emerald-100 pt-3">
      <Input
        placeholder="景點名稱…"
        value={newName}
        onChange={(e) => setNewName(e.target.value)}
      />
      <Input
        type="datetime-local"
        value={newTime}
        onChange={(e) => setNewTime(e.target.value)}
        className="text-sm"
      />
      <Button
        className="w-full"
        size="sm"
        onClick={onAdd}
        disabled={adding || !newName.trim()}
      >
        <Plus className="h-4 w-4" />
        {label}
      </Button>
    </div>
  );
}
