"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { BookOpen, Loader2 } from "lucide-react";
import { plantAiFetch } from "@/lib/ai-fetch";
import { hasConfiguredAi } from "@/lib/client-settings";
import { AiSettingsDialog } from "@/components/settings/ai-settings-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type StorybookModalProps = {
  seedCode: string;
};

export function StorybookModal({ seedCode }: StorybookModalProps) {
  const [open, setOpen] = useState(false);
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generateBooklet() {
    setLoading(true);
    setError(null);
    try {
      const res = await plantAiFetch(`/api/trip/${seedCode}/generate-booklet`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      setMarkdown(data.markdown);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to grow booklet");
    } finally {
      setLoading(false);
    }
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next && !markdown && !loading) {
      void generateBooklet();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <BookOpen className="h-4 w-4" />
          Grow AI Fairy-Tale Booklet
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-center font-serif">
            ✨ Your PlanT Storybook ✨
          </DialogTitle>
          <DialogDescription className="text-center font-serif italic">
            A magical tale woven from your Trunk and Sprouts
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-amber-300/40 bg-amber-50/50 px-6 py-5 shadow-inner">
          {loading && (
            <div className="flex flex-col items-center gap-3 py-12 text-amber-900/70">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
              <p className="font-serif italic">
                The story seeds are sprouting...
              </p>
            </div>
          )}

          {error && (
            <div className="space-y-2 text-center text-sm text-red-700">
              <p>{error}</p>
              {!hasConfiguredAi() && (
                <AiSettingsDialog
                  trigger={
                    <Button variant="secondary" size="sm">
                      設定 AI 平台與 API Key
                    </Button>
                  }
                />
              )}
            </div>
          )}

          {markdown && !loading && (
            <article className="storybook-prose font-serif text-amber-950 leading-relaxed [&_h1]:mb-4 [&_h1]:text-center [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:text-emerald-900 [&_p]:mb-3 [&_p]:text-justify">
              <ReactMarkdown>{markdown}</ReactMarkdown>
            </article>
          )}
        </div>

        <div className="flex justify-center border-t border-amber-200/50 pt-2">
          <p className="font-serif text-xs italic text-amber-800/50">
            — The End — or just the beginning of your journey 🌱
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
