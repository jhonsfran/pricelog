import { Button } from "@pricelog/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@pricelog/ui/components/dropdown-menu";
import { Link, useSearch } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { parseCategorySearch } from "@/lib/comparison-search";
import { Wordmark } from "./wordmark";
import UserMenu from "./user-menu";

const links = [
  { to: "/", label: "Directory" },
  { to: "/benchmarks", label: "Compare pricing" },
  { to: "/changes", label: "Weekly changes" },
] as const;

export default function Header() {
  const search = parseCategorySearch(useSearch({ strict: false }));
  return (
    <header className="sticky top-0 z-20 grid min-h-14 grid-cols-[1fr_auto] items-center gap-6 border-b bg-background/85 px-7 backdrop-blur-lg max-md:px-4 md:grid-cols-[1fr_auto_1fr]">
      <Link
        className="group/wordmark w-max transition-transform active:scale-[0.97]"
        to="/"
        search={search}
      >
        <Wordmark />
      </Link>
      <nav className="flex gap-7 max-md:hidden" aria-label="Primary navigation">
        {links.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            search={search}
            activeProps={{ "data-active": true }}
            activeOptions={{ exact: true, includeSearch: false }}
            // The underline grows from the centre instead of fading in.
            className="relative py-1 text-muted-foreground transition-colors after:absolute after:inset-x-0 after:-bottom-0.5 after:h-px after:scale-x-0 after:bg-primary after:transition-transform after:duration-200 after:ease-out hover:text-foreground hover:after:scale-x-100 data-active:text-foreground data-active:after:scale-x-100"
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <div className="flex min-w-0 items-center justify-self-end gap-2.5">
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" className="h-11 md:hidden" />}>
            <Menu data-icon="inline-start" /> Menu
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            <DropdownMenuGroup>
              {links.map((link) => (
                <DropdownMenuItem
                  key={link.to}
                  className="min-h-11"
                  render={<Link to={link.to} search={search} />}
                >
                  {link.label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem className="min-h-11" render={<Link to="/dashboard" />}>
                Your pages
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <UserMenu />
      </div>
    </header>
  );
}
