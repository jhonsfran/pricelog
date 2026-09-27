import { Button, buttonVariants } from "@pricelog/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@pricelog/ui/components/dropdown-menu";
import { Skeleton } from "@pricelog/ui/components/skeleton";
import { cn } from "@pricelog/ui/lib/utils";
import { Link, useNavigate } from "@tanstack/react-router";
import { UserRound } from "lucide-react";

import { authClient } from "@/lib/auth-client";

// 44px targets on touch screens, the standard control height elsewhere.
const trigger = "max-md:h-11 max-md:px-4";

export default function UserMenu() {
  const navigate = useNavigate();
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return <Skeleton className="h-10 w-24" />;
  }

  if (!session) {
    return (
      <Link to="/login" className={cn(buttonVariants({ variant: "outline" }), trigger)}>
        Sign in
      </Link>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            className={trigger}
            aria-label={`Account for ${session.user.name}`}
          />
        }
      >
        <UserRound className="md:hidden" aria-hidden="true" />
        <span className="max-w-44 truncate max-md:hidden">{session.user.name}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuGroup>
          <DropdownMenuLabel>My Account</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem>{session.user.email}</DropdownMenuItem>
          <DropdownMenuItem render={<Link to="/dashboard" />}>Your pages</DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => {
              authClient.signOut({
                fetchOptions: {
                  onSuccess: () => {
                    navigate({
                      to: "/",
                    });
                  },
                },
              });
            }}
          >
            Sign Out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
