import { Link, useSearch } from "@tanstack/react-router";
import { parseCategorySearch } from "@/lib/comparison-search";
import { LayerMark } from "./layer-mark";

/**
 * The record's colophon. It states what the site is, where the rest of it
 * lives, and the two facts a reader needs to trust a number they just
 * read: everything is a dated capture, and every date is UTC.
 */
export function SiteFooter() {
  const search = parseCategorySearch(useSearch({ strict: false }));
  return (
    <footer className="site-footer">
      <div className="footer-top">
        <div className="footer-brand">
          <span className="wordmark">
            <LayerMark size={22} />
            <b>PRICELOG</b>
          </span>
          <p>A weekly record of how AI products charge, with dated sources for every comparison.</p>
        </div>
        <nav className="footer-nav" aria-label="Footer">
          <div>
            <h2>The record</h2>
            <Link to="/benchmarks" search={search}>
              Compare pricing
            </Link>
            <Link to="/changes" search={search}>
              Weekly changes
            </Link>
            <Link to="/" search={search}>
              Directory
            </Link>
          </div>
          <div>
            <h2>How it works</h2>
            <Link to="/methodology" search={search}>
              Methodology
            </Link>
            <Link to="/dashboard">Track a page</Link>
          </div>
          <div>
            <h2>Unprice</h2>
            <a href="https://unprice.dev" target="_blank" rel="noreferrer">
              unprice.dev
            </a>
            <a href="https://docs.unprice.dev" target="_blank" rel="noreferrer">
              Documentation
            </a>
          </div>
        </nav>
      </div>
      <div className="footer-base">
        <span>
          Pricelog by{" "}
          <a href="https://unprice.dev" target="_blank" rel="noreferrer">
            Unprice
          </a>
        </span>
        <span>All dates UTC · Measures what a page states, not what a product does</span>
      </div>
    </footer>
  );
}
