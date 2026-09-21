import { Link } from "@tanstack/react-router";
import UserMenu from "./user-menu";

export default function Header() {
  return (
    <header className="site-header">
      <Link className="wordmark" to="/">
        <span>▲</span>
        <b>PRICELOG</b>
      </Link>
      <nav aria-label="Primary navigation">
        <Link to="/" activeProps={{ "data-active": true }} activeOptions={{ exact: true }}>
          Directory
        </Link>
        <Link to="/benchmarks" activeProps={{ "data-active": true }}>
          Pricing practices
        </Link>
        <Link to="/dashboard" activeProps={{ "data-active": true }}>
          Your pages
        </Link>
      </nav>
      <UserMenu />
    </header>
  );
}
