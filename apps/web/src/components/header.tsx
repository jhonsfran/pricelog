import { Link } from "@tanstack/react-router";
import { Dateline } from "./dateline";
import { LayerMark } from "./layer-mark";
import UserMenu from "./user-menu";

export default function Header() {
  return (
    <header className="site-header">
      <div className="masthead-brand">
        <Link className="wordmark" to="/">
          <LayerMark size={22} />
          <b>PRICELOG</b>
        </Link>
        <Dateline />
      </div>
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
