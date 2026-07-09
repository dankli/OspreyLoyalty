import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

/** A "?" trigger that opens a localized, keyboard-dismissable help dialog. */
export function HelpButton() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button type="button" className="help-trigger" aria-label={t("help.open")} onClick={() => setOpen(true)}>
        ?
      </button>
      {open &&
        createPortal(
          <div className="help-overlay" onClick={() => setOpen(false)}>
            <div
              className="help-dialog"
              role="dialog"
              aria-modal="true"
              aria-label={t("help.title")}
              onClick={(e) => e.stopPropagation()}
            >
              <h2>{t("help.title")}</h2>
              <section>
                <h3>{t("help.pointsHeading")}</h3>
                <p>{t("help.pointsBody")}</p>
              </section>
              <section>
                <h3>{t("help.tiersHeading")}</h3>
                <p>{t("help.tiersBody")}</p>
              </section>
              <section>
                <h3>{t("help.rewardsHeading")}</h3>
                <p>{t("help.rewardsBody")}</p>
              </section>
              <button type="button" className="help-close" autoFocus onClick={() => setOpen(false)}>
                {t("help.close")}
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
