import { Avatar, AvatarFallback, AvatarImage } from "@douban-bridge/ui/components/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@douban-bridge/ui/components/dropdown-menu";
import type { PublicUser } from "@/libs/public-user";

interface UserMenuProps {
  user?: PublicUser;
}

export const UserMenu: React.FC<UserMenuProps> = ({ user }) => {
  if (!user) {
    return null;
  }

  const submitLogout = () => {
    const form = document.createElement("form");
    form.method = "post";
    form.action = "/auth/logout";
    document.body.appendChild(form);
    form.submit();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="打开账号菜单"
        render={
          <button type="button" className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50" />
        }
      >
        <Avatar>
          <AvatarImage src={user.githubAvatarUrl || ""} alt={user.githubLogin} />
          <AvatarFallback>{user.githubLogin[0].toUpperCase()}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{user.githubLogin}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={submitLogout}>退出登录</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
