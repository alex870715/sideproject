"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Loader2, MapPin, Utensils, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SpotDto } from "@/types/trip";
import { plantAiFetch } from "@/lib/ai-fetch";
import { getProviderInfo } from "@/lib/client-settings";
import { AiSettingsDialog } from "@/components/settings/ai-settings-dialog";
import type { SpotRecommendations } from "@/lib/spot-recommendations";
import { isAiProvider } from "@/types/ai-provider";

type SpotDiscoverDialogProps = {
  spot: SpotDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function SpotDiscoverDialog({
  spot,
  open,
  onOpenChange,
}: SpotDiscoverDialogProps) {
  const [data, setData] = useState<SpotRecommendations | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!open || !spot) {
      setData(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    plantAiFetch(`/api/spot/${spot.id}/recommendations`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "載入失敗");
        if (!cancelled) setData(json);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "載入失敗");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, spot?.id, reloadKey]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-emerald-200 bg-gradient-to-b from-white to-emerald-50/30 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-emerald-950">
            {spot?.name ?? "景點探索"}
          </DialogTitle>
          <DialogDescription>美食推薦 · 附近景點 · 照片</DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex flex-col items-center gap-2 py-12 text-emerald-700">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-sm">正在為你尋找在地推薦…</p>
          </div>
        )}

        {error && (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        {data && !loading && (
          <div className="space-y-4">
            {data.source === "ai" && data.provider && isAiProvider(data.provider) && (
              <p className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700">
                由 {getProviderInfo(data.provider).shortName} 生成
              </p>
            )}
            {data.source === "fallback" && (
              <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                {data.aiError ? (
                  <p className="text-red-700">
                    AI 無法使用：{data.aiError}
                  </p>
                ) : (
                  <p>
                    目前為內建推薦。請在「AI 設定」選擇平台（ChatGPT／Gemini／Claude）並輸入
                    API Key。
                  </p>
                )}
                <AiSettingsDialog
                  onSaved={() => setReloadKey((k) => k + 1)}
                  trigger={
                    <Button variant="secondary" size="sm" className="w-fit">
                      前往 AI 設定
                    </Button>
                  }
                />
              </div>
            )}
            {data.photoUrl && (
              <div className="relative aspect-video overflow-hidden rounded-xl border border-emerald-100">
                <Image
                  src={data.photoUrl}
                  alt={spot?.name ?? "景點照片"}
                  fill
                  className="object-cover"
                  unoptimized
                />
                {data.photoCredit && (
                  <p className="absolute bottom-0 left-0 right-0 bg-black/50 px-2 py-1 text-[10px] text-white">
                    {data.photoCredit}
                  </p>
                )}
              </div>
            )}

            <p className="text-sm leading-relaxed text-emerald-900/90">
              {data.summary}
            </p>

            {data.foods.length > 0 && (
              <section>
                <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-emerald-900">
                  <Utensils className="h-4 w-4" />
                  推薦美食
                </h4>
                <ul className="space-y-2">
                  {data.foods.map((food) => (
                    <li
                      key={food.name}
                      className="rounded-lg border border-amber-100 bg-amber-50/80 px-3 py-2 text-sm"
                    >
                      <span className="font-medium text-amber-950">
                        {food.name}
                      </span>
                      <p className="mt-0.5 text-xs text-amber-900/80">
                        {food.tip}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {data.sights.length > 0 && (
              <section>
                <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-emerald-900">
                  <Camera className="h-4 w-4" />
                  附近景點
                </h4>
                <ul className="space-y-2">
                  {data.sights.map((sight) => (
                    <li
                      key={sight.name}
                      className="rounded-lg border border-emerald-100 bg-white px-3 py-2 text-sm"
                    >
                      <span className="font-medium text-emerald-950">
                        {sight.name}
                      </span>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {sight.tip}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <MapPin className="h-3 w-3" />
              {spot?.latitude.toFixed(4)}, {spot?.longitude.toFixed(4)}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
