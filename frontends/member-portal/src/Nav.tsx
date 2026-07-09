import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES, changeLanguage } from "./i18n";
import { HelpButton } from "./HelpButton";

export function Nav() {
  const { t, i18n } = useTranslation();
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
      <select
        className="lang-switch"
        aria-label={t("nav.language")}
        value={i18n.language}
        onChange={(e) => changeLanguage(e.target.value)}
      >
        {SUPPORTED_LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
      <HelpButton />
    </nav>
  );
}
