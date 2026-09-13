import { Copy, KeyRound } from "lucide-react";
import { type FC, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { SettingSection } from "@/components/setting-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PublicUser } from "@/libs/public-user";
import { apiKeyActionUi } from "./api-key-action";

export const ApiKeySettings: FC<{ user?: PublicUser }> = ({ user }) => {
  const [hasKey, setHasKey] = useState(false);
  const [sk, setSk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const { disabled, label } = apiKeyActionUi({ loaded, hasKey, busy });

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api-keys", { credentials: "same-origin" });
        if (!response.ok) throw new Error("key request failed");
        const data = (await response.json()) as { hasKey: boolean };
        if (!cancelled) {
          setHasKey(data.hasKey);
          setLoaded(true);
        }
      } catch {
        if (!cancelled) toast.error("操作失败，请重试");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

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
      title="API 密钥"
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
