import { Button } from "@douban-bridge/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@douban-bridge/ui/components/dialog";
import { Eye, GitFork, Star } from "lucide-react";
import { starGuideUi } from "./star-guide-state";

const REPO_URL = "https://github.com/baranwang/douban-bridge";

const STEPS = ["打开 GitHub 仓库页面", "点击页面右上角的 Star 按钮（如上图）", "回到本页，自动解锁完整模式"];

/** 仿 GitHub 仓库页顶栏，只为让用户认出 Star 按钮的位置，不承载信息，故整块 aria-hidden。 */
const GithubHeaderMock: React.FC = () => (
  <div aria-hidden className="rounded-lg border bg-muted/40 p-3">
    <div className="flex items-center gap-1.5 text-sm">
      <span className="text-muted-foreground">baranwang /</span>
      <span className="font-semibold">douban-bridge</span>
    </div>
    <div className="mt-3 flex items-center justify-end gap-1.5">
      <span className="flex h-6 items-center gap-1 rounded-md border bg-background px-2 text-xs">
        <Eye className="size-3" />
        Watch
      </span>
      <span className="flex h-6 items-center gap-1 rounded-md border bg-background px-2 text-xs">
        <GitFork className="size-3" />
        Fork
      </span>
      <span className="flex h-6 items-center gap-1 rounded-md border bg-background px-2 text-xs ring-2 ring-primary">
        <Star className="size-3 text-primary" />
        Star
      </span>
    </div>
  </div>
);

interface StarGuideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 用户是否已点过「打开 GitHub 仓库」 */
  opened: boolean;
  validating: boolean;
  checked: boolean;
  starred: boolean;
  onOpenGithub: () => void;
  onRecheck: () => void;
}

export const StarGuideDialog: React.FC<StarGuideDialogProps> = ({
  open,
  onOpenChange,
  opened,
  validating,
  checked,
  starred,
  onOpenGithub,
  onRecheck,
}) => {
  const { label, disabled, showNotFound } = starGuideUi({ opened, validating, checked, starred });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>怎么 Star 这个项目</DialogTitle>
          <DialogDescription>Star 后回到本页会自动解锁完整模式。</DialogDescription>
        </DialogHeader>

        <GithubHeaderMock />

        <ol className="flex flex-col gap-2 text-sm">
          {STEPS.map((text, index) => (
            <li key={text} className="flex items-start gap-2">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs">
                {index + 1}
              </span>
              <span>{text}</span>
            </li>
          ))}
        </ol>

        <DialogFooter>
          {showNotFound && <p className="text-destructive text-sm">还没检测到 Star，确认已经在 GitHub 上点过了吗？</p>}
          {opened ? (
            <Button disabled={disabled} onClick={onRecheck}>
              {label}
            </Button>
          ) : (
            // 必须是用户直接点击的真实锚点，否则新标签会被浏览器拦截
            <Button render={<a href={REPO_URL} target="_blank" rel="noopener noreferrer" />} onClick={onOpenGithub}>
              {label}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
