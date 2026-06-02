"use client";

import { useEffect, useState } from "react";
import { KeyRound, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { isValidKeyForProvider } from "@/lib/ai-credentials";
import {
  getAiSettings,
  getProviderInfo,
  getStoredApiKey,
  hasConfiguredAi,
  maskApiKey,
  saveAiSettings,
  setStoredApiKey,
  setStoredProvider,
} from "@/lib/client-settings";
import { AI_PROVIDERS, type AiProvider } from "@/types/ai-provider";

type AiSettingsDialogProps = {
  trigger?: React.ReactNode;
  onSaved?: () => void;
};

export function AiSettingsDialog({ trigger, onSaved }: AiSettingsDialogProps) {
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<AiProvider>("openai");
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  const providerInfo = getProviderInfo(provider);

  useEffect(() => {
    if (open) {
      const settings = getAiSettings();
      setProvider(settings.provider);
      setApiKey(settings.keys[settings.provider] ?? "");
      setError(null);
    }
  }, [open]);

  function handleProviderChange(next: AiProvider) {
    const settings = getAiSettings();
    if (apiKey.trim()) {
      setStoredApiKey(provider, apiKey);
    }
    setProvider(next);
    setStoredProvider(next);
    setApiKey(settings.keys[next] ?? "");
    setError(null);
  }

  function handleSave() {
    const trimmed = apiKey.trim();
    if (trimmed && !isValidKeyForProvider(provider, trimmed)) {
      setError(`請輸入有效的 ${providerInfo.name} API Key（${providerInfo.keyHint}）`);
      return;
    }
    setStoredProvider(provider);
    setStoredApiKey(provider, trimmed);
    setError(null);
    onSaved?.();
    setOpen(false);
  }

  function handleClear() {
    setApiKey("");
    setStoredApiKey(provider, "");
    onSaved?.();
  }

  const savedKey = getStoredApiKey(provider);
  const isCurrentSaved =
    hasConfiguredAi() &&
    getAiSettings().provider === provider &&
    !!savedKey;

  const defaultTrigger = (
    <Button variant="outline" size="sm" className="gap-1.5">
      <KeyRound className="h-4 w-4" />
      AI 設定
      {hasConfiguredAi() && (
        <span className="ml-1 h-2 w-2 rounded-full bg-emerald-500" />
      )}
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger ?? defaultTrigger}</DialogTrigger>
      <DialogContent className="border-emerald-200 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-emerald-950">AI 設定</DialogTitle>
          <DialogDescription>
            選擇 AI 平台並輸入 API Key。金鑰只儲存在此瀏覽器，不會上傳到 PlanT
            伺服器。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label className="mb-2 block text-xs font-medium text-emerald-800">
              AI 平台
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {AI_PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleProviderChange(p.id)}
                  className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                    provider === p.id
                      ? "border-emerald-500 bg-emerald-50 font-semibold text-emerald-900"
                      : "border-emerald-100 bg-white text-emerald-800 hover:bg-emerald-50/50"
                  }`}
                >
                  {p.shortName}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              目前選擇：{providerInfo.name}
            </p>
          </div>

          {isCurrentSaved && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              已儲存 {providerInfo.shortName}：{maskApiKey(savedKey)}
            </p>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-emerald-800">
              {providerInfo.shortName} API Key
            </label>
            <Input
              type="password"
              placeholder={providerInfo.placeholder}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoComplete="off"
            />
          </div>

          <a
            href={providerInfo.keyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:underline"
          >
            前往 {providerInfo.shortName} 取得 API Key
            <ExternalLink className="h-3 w-3" />
          </a>

          <p className="text-[11px] text-muted-foreground">
            支援 ChatGPT（OpenAI）、Google AI Studio（Gemini）、Claude（Anthropic）。
            未設定時使用內建推薦與 Wikipedia 照片。
          </p>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClear}
            disabled={!apiKey && !savedKey}
          >
            清除此平台金鑰
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button type="button" onClick={handleSave}>
              儲存
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
