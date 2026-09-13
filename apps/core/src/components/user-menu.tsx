import type { User } from "@/db";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

interface UserMenuProps {
  user?: User;
}

export const UserMenu: React.FC<UserMenuProps> = ({ user }) => {
  if (!user) {
    return null;
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Avatar>
          <AvatarImage src={user.githubAvatarUrl || ""} alt={user.githubLogin} />
          <AvatarFallback>{user.githubLogin[0].toUpperCase()}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{user.githubLogin}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel
          onClick={() => {
            const form = document.createElement("form");
            form.method = "post";
            form.action = "/auth/logout";
            document.body.appendChild(form);
            form.submit();
          }}
        >
          退出登录
        </DropdownMenuLabel>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
