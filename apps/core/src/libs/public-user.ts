import type { User } from "@/db";

export type PublicUser = Pick<User, "id" | "githubLogin" | "githubAvatarUrl" | "hasStarred">;

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    githubLogin: user.githubLogin,
    githubAvatarUrl: user.githubAvatarUrl,
    hasStarred: user.hasStarred,
  };
}
