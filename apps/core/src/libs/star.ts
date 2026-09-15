import { eq } from "drizzle-orm";
import { getDrizzle, type User, users } from "@/db";
import { GitHubAPI } from "@/libs/api/github";

/** star 状态的复查间隔：取消 star 后最多 6 小时仍可用完整模式 */
export const STAR_RECHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

interface EnsureFreshStarStatusOptions {
  now?: number;
  /** 仅供测试注入，默认走 GitHub API */
  checkStar?: (accessToken: string) => Promise<boolean>;
}

/**
 * star 状态只在登录时写过一次，之后用户取消 star 也无人察觉。
 * 这里在读用户时按 TTL 复查一次并落库，web 与 API key 两条路径共用。
 */
export async function ensureFreshStarStatus(
  env: CloudflareBindings,
  user: User,
  options: EnsureFreshStarStatusOptions = {},
): Promise<User> {
  const { now = Date.now(), checkStar } = options;
  if (!user.githubAccessToken) return user;
  if (now - (user.starCheckedAt?.getTime() ?? 0) < STAR_RECHECK_INTERVAL_MS) return user;

  let hasStarred: boolean;
  try {
    const check =
      checkStar ??
      ((token: string) => new GitHubAPI(env.GITHUB_CLIENT_ID, env.GITHUB_CLIENT_SECRET).checkStarStatus(token));
    hasStarred = await check(user.githubAccessToken);
  } catch (error) {
    // 限流或网络故障不能当成取消 star，保持原值，下次请求再试
    console.error("star recheck failed", error);
    return user;
  }

  const starCheckedAt = new Date(now);
  await getDrizzle(env)
    .update(users)
    .set({ hasStarred, starCheckedAt, updatedAt: starCheckedAt })
    .where(eq(users.id, user.id));
  return { ...user, hasStarred, starCheckedAt };
}
