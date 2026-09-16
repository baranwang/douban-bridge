export interface StarGuideUiInput {
  /** 用户是否已点过「打开 GitHub 仓库」 */
  opened: boolean;
  /** SWR 请求进行中 */
  validating: boolean;
  /** 至少完成过一次 star 检查 */
  checked: boolean;
  starred: boolean;
}

export interface StarGuideUiResult {
  label: "打开 GitHub 仓库" | "确认中…" | "我已 Star，立即检查";
  disabled: boolean;
  showNotFound: boolean;
}

/** 弹层 footer 的唯一判断处。分支按优先级短路，保证入参组合无遗漏。 */
export function starGuideUi({ opened, validating, checked, starred }: StarGuideUiInput): StarGuideUiResult {
  if (!opened) return { label: "打开 GitHub 仓库", disabled: false, showNotFound: false };
  // starred 时页面正在跳转；!checked 覆盖刚点完按钮、SWR 还没起飞的那一拍
  if (starred || validating || !checked) return { label: "确认中…", disabled: true, showNotFound: false };
  return { label: "我已 Star，立即检查", disabled: false, showNotFound: true };
}
