import { Link, useSearch } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { parseCategorySearch } from "@/lib/comparison-search";
import { Wordmark } from "./wordmark";

const link = "text-muted-foreground transition-colors hover:text-foreground";

/**
 * The record's colophon. It states what the site is, where the rest of it
 * lives, and the two facts a reader needs to trust a number they just
 * read: everything is a dated capture, and every date is UTC.
 */
export function SiteFooter() {
  const search = parseCategorySearch(useSearch({ strict: false }));
  return (
    <footer className="mt-8 border-t bg-gray-2">
      <div className="mx-auto grid max-w-292 gap-x-[8vw] gap-y-10 px-6 pt-14 pb-11 max-sm:px-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div>
          <Wordmark />
          <p className="mt-4.5 max-w-[46ch] leading-relaxed text-muted-foreground">
            A weekly record of how AI products charge, with dated sources for every comparison.
          </p>
        </div>
        <nav className="grid grid-cols-2 gap-8 sm:grid-cols-3" aria-label="Footer">
          <FooterGroup title="The record">
            <Link className={link} to="/benchmarks" search={search}>
              Compare pricing
            </Link>
            <Link className={link} to="/changes" search={search}>
              Weekly changes
            </Link>
            <Link className={link} to="/" search={search}>
              Directory
            </Link>
          </FooterGroup>
          <FooterGroup title="How it works">
            <Link className={link} to="/methodology" search={search}>
              Methodology
            </Link>
            <Link className={link} to="/dashboard">
              Track a page
            </Link>
          </FooterGroup>
          <FooterGroup title="Unprice">
            <a className={link} href="https://unprice.dev" target="_blank" rel="noreferrer">
              unprice.dev
            </a>
            <a className={link} href="https://docs.unprice.dev" target="_blank" rel="noreferrer">
              Documentation
            </a>
          </FooterGroup>
        </nav>
      </div>
      <div className="mx-auto max-w-292 px-6 max-sm:px-4">
        <div className="flex flex-wrap justify-between gap-x-6 gap-y-2.5 border-t border-gray-4 pt-5 pb-7 font-mono text-2xs tracking-wide text-muted-foreground">
          <span>
            Pricelog by{" "}
            <a href="https://unprice.dev" target="_blank" rel="noreferrer">
              Unprice
            </a>
          </span>
          <span>All dates UTC · Measures what a page states, not what a product does</span>
        </div>
      </div>
    </footer>
  );
}

function FooterGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <h2 className="kicker mb-1 font-normal text-muted-foreground">{title}</h2>
      {children}
    </div>
  );
}
