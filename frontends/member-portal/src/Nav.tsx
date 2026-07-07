import { NavLink } from "react-router-dom";

export function Nav() {
  return (
    <nav className="site-nav">
      <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
        Dashboard
      </NavLink>
      <NavLink
        to="/transactions"
        className={({ isActive }) => (isActive ? "active" : "")}
      >
        Transactions
      </NavLink>
      <NavLink
        to="/rewards"
        className={({ isActive }) => (isActive ? "active" : "")}
      >
        Rewards
      </NavLink>
    </nav>
  );
}
