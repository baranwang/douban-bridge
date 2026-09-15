import { Button } from "@douban-bridge/ui/components/button";
import { Input } from "@douban-bridge/ui/components/input";
import { Copy, KeyRound } from "lucide-react";
import { type FC, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { SettingSection } from "@/components/setting-section";
import type { PublicUser } from "@/libs/public-user";
import { apiKeyActionUi } from "./api-key-action";

export const ApiKeySettings: FC<{ user?: PublicUser }> = ({ user }) => {
  const [hasKey, setHasKey] = useState(false);
  const [sk, setSk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const { disabled, label, showRetry } = apiKeyActionUi({ loaded, hasKey, busy, loadFailed });

  const loadStatus = useCallback(async (signal?: { cancelled: boolean }) => {
    try {
      const response = await fetch("/api-keys", { credentials: "same-origin" });
      if (!response.ok) throw new Error("key request failed");
      const data = (await response.json()) as { hasKey: boolean };
      if (signal?.cancelled) return;
      setHasKey(data.hasKey);
      setLoaded(true);
      setLoadFailed(false);
    } catch {
      if (signal?.cancelled) return;
      setLoaded(false);
      setLoadFailed(true);
      toast.error("操作失败，请重试");
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
        const { sk: next } = (await response.json()) as { sk: string };
        setSk(next);
        setHasKey(true);
      } catch {
        toast.error("操作失败，请重试");
      } finally {
        setBusy(false);
      }
    })();
  }, [disabled]);

  const revoke = useCallback(() => {
    if (disabled) return;
    setBusy(true);
    void (async () => {
      try {
        const response = await fetch("/api-keys", {
          method: "DELETE",
          credentials: "same-origin",
        });
        if (!response.ok) throw new Error("key request failed");
        setSk(null);
        setHasKey(false);
      } catch {
        toast.error("操作失败，请重试");
      } finally {
        setBusy(false);
      }
    })();
  }, [disabled]);

  if (!user) return null;
  if (!user.hasStarred && !hasKey && !sk) return null;

  return (
    <SettingSection
      title="Rex 密钥"
      icon={<KeyRound className="size-4 text-muted-foreground" />}
      footer="重新生成后，旧密钥立即失效"
    >
      <div className="space-y-3">
        {sk ? (
          <div className="space-y-2">
            <label className="font-medium text-sm" htmlFor="account-api-key">
              密钥
            </label>
            <div className="flex gap-2">
              <Input id="account-api-key" type="password" readOnly value={sk} autoComplete="off" />
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(sk);
                    toast.success("密钥已复制到剪贴板");
                  } catch {
                    toast.error("操作失败，请重试");
                  }
                }}
              >
                <Copy />
                复制
              </Button>
            </div>
          </div>
        ) : null}
        <div className="flex gap-2">
          {user.hasStarred ? (
            <Button type="button" disabled={disabled} onClick={generate}>
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
          {hasKey ? (
            <Button type="button" variant="outline" disabled={disabled} onClick={revoke}>
              撤销密钥
            </Button>
          ) : null}
        </div>
      </div>
    </SettingSection>
  );
};
