import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { HelpButton } from "./HelpButton";

export function Nav() {
  const { t } = useTranslation();
  return (
    <nav className="site-nav">
      <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
        {t("nav.dashboard")}
      </NavLink>
      <NavLink to="/transactions" className={({ isActive }) => (isActive ? "active" : "")}>
        {t("nav.transactions")}
      </NavLink>
      <NavLink to="/rewards" className={({ isActive }) => (isActive ? "active" : "")}>
        {t("nav.rewards")}
      </NavLink>
      <NavLink to="/travel-agent" className={({ isActive }) => (isActive ? "active" : "")}>
        {t("nav.travelAgent")}
      </NavLink>
      <HelpButton />
    </nav>
  );
}
