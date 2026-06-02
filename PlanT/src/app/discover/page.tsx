import { Suspense } from "react";
import { DiscoverFlow } from "@/components/discover/discover-flow";

export const metadata = {
  title: "PlanT Match 🌿 — 探索模式",
  description: "像交友 App 一樣滑動，決定要吃什麼、要去哪裡",
};

export default function DiscoverPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-emerald-700">
          載入中…
        </div>
      }
    >
      <DiscoverFlow />
    </Suspense>
  );
}
