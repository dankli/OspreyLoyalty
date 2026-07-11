import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import QRCode from "qrcode";
import { graphql } from "../../gql";
import { gatewayClient } from "../../gatewayClient";

const activationsQuery = graphql(`
  query BenefitActivations($memberId: ID!) {
    benefitActivations(memberId: $memberId) {
      benefit
      code
      activatedAtUtc
    }
  }
`);

const activateMutation = graphql(`
  mutation ActivateBenefit($memberId: ID!, $benefit: String!, $idempotencyKey: String!) {
    activateBenefit(memberId: $memberId, benefit: $benefit, idempotencyKey: $idempotencyKey) {
      benefit
      code
      activatedAtUtc
      alreadyApplied
    }
  }
`);

function CodeCard({ benefit, code, onClose }: { benefit: string; code: string; onClose: () => void }) {
  const { t } = useTranslation();
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void QRCode.toDataURL(code, { margin: 1, width: 160 }).then((url) => {
      if (!cancelled) setQr(url);
    });
    return () => {
      cancelled = true;
    };
  }, [code]);

  return (
    <div className="benefit-code-card" role="dialog" aria-label={t("benefits.codeTitle")}>
      <h3>{t("benefits.codeTitle")}</h3>
      <p className="benefit-name">{benefit}</p>
      <p className="benefit-code">{code}</p>
      {qr && <img src={qr} alt={t("benefits.qrAlt", { code })} />}
      <p className="muted">{t("benefits.codeHint")}</p>
      <button type="button" onClick={onClose}>
        {t("benefits.close")}
      </button>
    </div>
  );
}

export function BenefitsList({ memberId, benefits }: { memberId: string; benefits: string[] }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [shown, setShown] = useState<{ benefit: string; code: string } | null>(null);
  const { data } = useQuery({
    queryKey: ["benefit-activations", memberId],
    queryFn: () => gatewayClient.request(activationsQuery, { memberId }),
  });
  const activate = useMutation({
    mutationFn: (benefit: string) =>
      gatewayClient.request(activateMutation, {
        memberId,
        benefit,
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: (result) => {
      setShown({ benefit: result.activateBenefit.benefit, code: result.activateBenefit.code });
      void queryClient.invalidateQueries({ queryKey: ["benefit-activations", memberId] });
    },
  });

  const activations = new Map(
    (data?.benefitActivations ?? []).map((a) => [a.benefit, a.code] as const),
  );

  return (
    <>
      <ul className="benefits">
        {benefits.map((benefit) => {
          const code = activations.get(benefit);
          return (
            <li key={benefit}>
              <span>{benefit}</span>
              {code ? (
                <button type="button" className="benefit-action" onClick={() => setShown({ benefit, code })}>
                  {t("benefits.showCode")}
                </button>
              ) : (
                <button
                  type="button"
                  className="benefit-action"
                  disabled={activate.isPending}
                  onClick={() => activate.mutate(benefit)}
                >
                  {t("benefits.activate")}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {activate.isError && <p role="alert">{t("benefits.error")}</p>}
      {shown && <CodeCard benefit={shown.benefit} code={shown.code} onClose={() => setShown(null)} />}
    </>
  );
}
