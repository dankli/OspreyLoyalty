import { useTranslation } from "react-i18next";
import { savingsPercent } from "./savingsPercent";
import { useTravelAgentStream } from "./useTravelAgentStream";

export function TravelAgentPage({ memberId }: { memberId: string }) {
  const { t } = useTranslation();
  const { state, generate } = useTravelAgentStream(memberId);

  return (
    <main className="dashboard travel-agent">
      <h1>{t("travelAgent.title")}</h1>
      <p className="muted">{t("travelAgent.intro")}</p>

      <textarea
        className="prompt-box"
        aria-label={t("travelAgent.promptLabel")}
        value={t("travelAgent.prompt")}
        readOnly
        rows={3}
      />
      <button className="generate" onClick={() => void generate()} disabled={state.status === "streaming"}>
        {state.status === "streaming" ? t("travelAgent.generating") : t("travelAgent.generate")}
      </button>

      {state.status === "error" && <p role="alert">{t("travelAgent.error")}</p>}

      {state.spendablePoints !== null && (
        <section className="balance-card">
          <span className="label">{t("points.spendable")}</span>
          <span className="balance">{state.spendablePoints.toLocaleString("sv-SE")}</span>
        </section>
      )}

      {state.text && <p className="agent-reply">{state.text}</p>}

      {state.suggestions.length > 0 && (
        <ul className="reward-grid">
          {state.suggestions.map((s) => {
            // Only the goal card has a gap and a progress bar; affordable cards show the go-badge.
            const percent = s.affordable ? 0 : savingsPercent(state.spendablePoints ?? 0, s.cost);
            const goalLabel = t("travelAgent.saveMore", { points: (s.gap ?? 0).toLocaleString("sv-SE") });
            return (
              <li key={s.destination} className={s.affordable ? "reward-card suggestion-card" : "reward-card suggestion-card goal-card"}>
                <span className="reward-name">{s.emoji} {s.destination}</span>
                <span className="reward-cost">{t("rewards.cost", { cost: s.cost.toLocaleString("sv-SE") })}</span>
                {s.affordable ? (
                  <span className="go-badge">{t("travelAgent.canGo")}</span>
                ) : (
                  <>
                    <div role="progressbar" aria-label={goalLabel} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} className="bar">
                      <div className="bar-fill" style={{ width: `${percent}%` }} />
                    </div>
                    <span className="muted">{goalLabel}</span>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
