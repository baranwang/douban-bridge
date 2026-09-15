import { Button } from "@douban-bridge/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@douban-bridge/ui/components/input-group";
import { toast } from "@douban-bridge/ui/components/toast";
import { Copy, Eye, EyeOff, KeyRound } from "lucide-react";
import { type FC, useCallback, useEffect, useState } from "react";
import { SettingSection } from "@/components/setting-section";
import type { PublicUser } from "@/libs/public-user";
import { apiKeyActionUi } from "./api-key-action";

const formatDate = (iso: string) => new Date(iso).toLocaleDateString("zh-CN");

export const ApiKeySettings: FC<{ user?: PublicUser }> = ({ user }) => {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const { disabled, label, showRetry } = apiKeyActionUi({ loaded, hasKey: !!apiKey, busy, loadFailed });

  const loadStatus = useCallback(async (signal?: { cancelled: boolean }) => {
    try {
      const response = await fetch("/api-keys", { credentials: "same-origin" });
      if (!response.ok) throw new Error("key request failed");
      const data = (await response.json()) as { key: string | null; createdAt: string | null };
      if (signal?.cancelled) return;
      setApiKey(data.key);
      setCreatedAt(data.createdAt);
      setLoaded(true);
      setLoadFailed(false);
    } catch {
      if (signal?.cancelled) return;
      setLoaded(false);
      setLoadFailed(true);
      toast.add({ title: "操作失败，请重试", type: "error" });
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    const signal = { cancelled: false };
    void loadStatus(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [user, loadStatus]);

  const generate = useCallback(() => {
    if (disabled) return;
    setBusy(true);
    void (async () => {
      try {
        const response = await fetch("/api-keys", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: "{}",
        });
        if (!response.ok) throw new Error("key request failed");
        const { key } = (await response.json()) as { key: string };
        setApiKey(key);
        setCreatedAt(new Date().toISOString());
        setRevealed(true);
      } catch {
        toast.add({ title: "操作失败，请重试", type: "error" });
      } finally {
        setBusy(false);
      }
    })();
  }, [disabled]);

  const copy = useCallback(async () => {
    if (!apiKey) return;
    try {
      await navigator.clipboard.writeText(apiKey);
      toast.add({ title: "密钥已复制到剪贴板", type: "success" });
    } catch {
      toast.add({ title: "操作失败，请重试", type: "error" });
    }
  }, [apiKey]);

  if (!user) return null;
  if (!user.hasStarred && !apiKey) return null;

  return (
    <SettingSection
      title="Rex 密钥"
      icon={<KeyRound className="size-4 text-muted-foreground" />}
      footer="重新生成后，旧密钥立即失效"
    >
      <div className="flex flex-col gap-3">
        {apiKey ? (
          <>
            <InputGroup>
              <InputGroupInput
                id="account-api-key"
                type={revealed ? "text" : "password"}
                readOnly
                value={apiKey}
                autoComplete="off"
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  aria-label={revealed ? "隐藏密钥" : "显示密钥"}
                  size="icon-xs"
                  onClick={() => setRevealed((v) => !v)}
                >
                  {revealed ? <EyeOff /> : <Eye />}
                </InputGroupButton>
                <InputGroupButton onClick={copy}>
                  <Copy />
                  复制
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
            {createdAt ? <p className="text-muted-foreground text-sm">生成于 {formatDate(createdAt)}</p> : null}
          </>
        ) : null}
        <div className="flex gap-2">
          {user.hasStarred ? (
            <Button type="button" variant={apiKey ? "outline" : "default"} disabled={disabled} onClick={generate}>
              {label}
            </Button>
          ) : null}
          {showRetry ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void loadStatus().finally(() => setBusy(false));
              }}
            >
              重试
            </Button>
          ) : null}
        </div>
      </div>
    </SettingSection>
  );
};
