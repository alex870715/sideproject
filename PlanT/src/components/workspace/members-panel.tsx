"use client";

import { useState } from "react";
import { Pencil, Plus, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { MemberDto, TripDto } from "@/types/trip";

type MembersPanelProps = {
  trip: TripDto;
  onTripUpdate: (trip: TripDto) => void;
};

export function MembersPanel({ trip, onTripUpdate }: MembersPanelProps) {
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  async function refreshTrip() {
    const res = await fetch(`/api/trip/${trip.seedCode}`);
    if (res.ok) onTripUpdate(await res.json());
  }

  async function handleAddMember() {
    if (!newName.trim()) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/trip/${trip.seedCode}/member`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (!res.ok) throw new Error("新增失敗");
      setNewName("");
      await refreshTrip();
    } catch (e) {
      console.error(e);
    } finally {
      setAdding(false);
    }
  }

  async function handleSaveMember(memberId: string) {
    if (!editName.trim()) return;
    try {
      const res = await fetch(`/api/member/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim() }),
      });
      if (!res.ok) throw new Error("更新失敗");
      setEditingId(null);
      await refreshTrip();
    } catch (e) {
      console.error(e);
    }
  }

  async function handleRemoveMember(member: MemberDto) {
    if (!confirm(`移除參與者「${member.name}」？`)) return;
    try {
      const res = await fetch(`/api/member/${member.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "無法移除");
        return;
      }
      await refreshTrip();
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <div className="rounded-xl border border-emerald-200 bg-white/90 px-4 py-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-emerald-950">
          <User className="h-4 w-4 text-emerald-600" />
          參與人 ({trip.members.length})
        </h3>
      </div>

      <div className="flex flex-wrap gap-2">
        {trip.members.map((member) => (
          <div
            key={member.id}
            className="flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50/80 pl-2 pr-1 py-0.5 text-sm"
          >
            {editingId === member.id ? (
              <>
                <Input
                  className="h-7 w-24 border-0 bg-transparent px-1 text-sm shadow-none"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleSaveMember(member.id);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  autoFocus
                />
                <button
                  type="button"
                  className="rounded p-0.5 text-emerald-700 hover:bg-emerald-100"
                  onClick={() => handleSaveMember(member.id)}
                >
                  ✓
                </button>
              </>
            ) : (
              <>
                <span className="text-emerald-900">{member.name}</span>
                <button
                  type="button"
                  className="rounded p-1 text-emerald-600 hover:bg-emerald-100"
                  onClick={() => {
                    setEditingId(member.id);
                    setEditName(member.name);
                  }}
                  aria-label="編輯"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                {trip.members.length > 1 && (
                  <button
                    type="button"
                    className="rounded p-1 text-red-500 hover:bg-red-50"
                    onClick={() => handleRemoveMember(member)}
                    aria-label="移除"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      <div className="mt-2 flex gap-2">
        <Input
          placeholder="新增參與人…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAddMember()}
          className="h-8 text-sm"
        />
        <Button
          size="sm"
          variant="secondary"
          onClick={handleAddMember}
          disabled={adding || !newName.trim()}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
