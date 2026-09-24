import { Button } from "@my-better-t-app/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@my-better-t-app/ui/components/dropdown-menu";
import { Link, useSearch } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { parseCategorySearch } from "@/lib/comparison-search";
import { LayerMark } from "./layer-mark";
import UserMenu from "./user-menu";

export default function Header() {
  const search = parseCategorySearch(useSearch({ strict: false }));
  const links = [
    { to: "/benchmarks", label: "Compare pricing" },
    { to: "/changes", label: "Weekly changes" },
    { to: "/", label: "Directory" },
  ] as const;
  return (
    <header className="site-header">
      <div className="masthead-brand">
        <Link className="wordmark" to="/" search={search}>
          <LayerMark size={22} />
          <b>PRICELOG</b>
        </Link>
      </div>
      <nav className="desktop-navigation" aria-label="Primary navigation">
        {links.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            search={search}
            activeProps={{ "data-active": true }}
            activeOptions={{ exact: true, includeSearch: false }}
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <div className="header-actions">
        <div className="mobile-navigation">
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" />}>
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
        </div>
        <UserMenu />
      </div>
    </header>
  );
}
