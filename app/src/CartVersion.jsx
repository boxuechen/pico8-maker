import { useLang } from "./i18n.js";

export function CartVersion({
  title,
  value,
  onChange,
  hasGame,
  revision,
  dirty,
}) {
  const { t } = useLang();
  return (
    <div className="cart-version">
      <div className="resources-heading">
        <h2>{title}</h2>
        <label>
          {t("version")}{" "}
          <select
            aria-label={t("cartVersion")}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="draft">{t("workingDraft")}</option>
            {hasGame && (
              <option value="committed">
                {t("committedV", { n: revision })}
              </option>
            )}
          </select>
        </label>
      </div>
      <p className="resource-note">
        {!hasGame
          ? t("noPlayable")
          : dirty
            ? value === "draft"
              ? t("uncommittedDraft")
              : t("showingCommitted", { n: revision })
            : t("savedTogether")}
      </p>
    </div>
  );
}
