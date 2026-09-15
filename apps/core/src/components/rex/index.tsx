import type { ImageProvider } from "@douban-bridge/contracts/image-providers";
import { Button } from "@douban-bridge/ui/components/button";
import { ItemGroup } from "@douban-bridge/ui/components/item";
import { Toaster } from "@douban-bridge/ui/components/sonner";
import { Spinner } from "@douban-bridge/ui/components/spinner";
import { ImageProviderSortable } from "@douban-bridge/ui/image-providers";
import { isEqual } from "es-toolkit";
import { Image as ImageIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import type { PublicUser } from "@/libs/public-user";
import { PageShell } from "../page-shell";
import { SettingSection } from "../setting-section";
import { UserMenu } from "../user-menu";
import { ApiKeySettings } from "./api-key-settings";
import { ModeComparison } from "./mode-comparison";

export interface RexProps {
  user?: PublicUser;
  imageProviders: ImageProvider[];
}

export function Rex({ user, imageProviders: initialImageProviders }: RexProps) {
  const [imageProviders, setImageProviders] = useState(initialImageProviders);
  const [savedImageProviders, setSavedImageProviders] = useState(initialImageProviders);
  const [saving, setSaving] = useState(false);
  const isStarred = user?.hasStarred === true;

  const saveImageProviders = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch("/rex/image-providers", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageProviders }),
      });
      if (!response.ok) throw new Error("image provider save failed");
      const saved = (await response.json()) as { success: true; imageProviders: ImageProvider[] };
      setImageProviders(saved.imageProviders);
      setSavedImageProviders(saved.imageProviders);
      toast.success("图片设置已保存");
    } catch {
      toast.error("保存失败，请稍后重试");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageShell
      title="Rex 设置"
      description="管理 Rex 密钥与所有播放器共用的图片来源"
      actions={<UserMenu user={user} />}
    >
      {isStarred ? (
        <div className="mt-9 flex flex-col gap-10">
          <div data-section="rex-key-settings">
            <ApiKeySettings user={user} />
          </div>

          <form data-section="image-provider-settings" onSubmit={saveImageProviders}>
            <SettingSection
              title="图片来源"
              icon={<ImageIcon className="size-4 text-muted-foreground" />}
              footer="拖动排序调整优先级，排在前面的图片来源将优先使用"
            >
              <ItemGroup>
                <ImageProviderSortable value={imageProviders} onChange={setImageProviders} />
              </ItemGroup>
            </SettingSection>
            <Button
              className="mt-4 w-full sm:w-auto"
              type="submit"
              disabled={saving || isEqual(imageProviders, savedImageProviders)}
            >
              {saving ? (
                <>
                  <Spinner />
                  保存中…
                </>
              ) : (
                "保存图片设置"
              )}
            </Button>
          </form>
        </div>
      ) : (
        <ModeComparison user={user} />
      )}
      <Toaster />
    </PageShell>
  );
}
