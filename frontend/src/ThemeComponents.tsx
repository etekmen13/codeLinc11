import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from "react";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "text";
}) {
  return (
    <button
      type="button"
      className={`lf-button lf-button--${variant} ${className}`}
      {...props}
    />
  );
}
export function Card({
  title,
  children,
  accent = false,
}: {
  title?: string;
  children: ReactNode;
  accent?: boolean;
}) {
  return (
    <section className={`lf-card ${accent ? "lf-card--accent" : ""}`}>
      {title && <h2 className="lf-section-heading">{title}</h2>}
      {children}
    </section>
  );
}
export function Field({
  label,
  hint,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  hint?: string;
}) {
  return (
    <div className="lf-field">
      <label htmlFor={id}>{label}</label>
      <input
        {...props}
        id={id}
        className={`lf-input ${props.className ?? ""}`}
        aria-describedby={hint ? `${id}-hint` : props["aria-describedby"]}
      />
      {hint && (
        <span className="lf-field-hint" id={`${id}-hint`}>
          {hint}
        </span>
      )}
    </div>
  );
}
export function Badge({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "success" | "warning";
}) {
  return (
    <span
      className={`lf-badge ${tone === "default" ? "" : `lf-badge--${tone}`}`}
    >
      {children}
    </span>
  );
}
export function Notice({
  children,
  warning = false,
}: {
  children: ReactNode;
  warning?: boolean;
}) {
  return (
    <div className={`lf-notice ${warning ? "lf-notice--warning" : ""}`}>
      {children}
    </div>
  );
}
export function ProviderCard({
  name,
  inNetwork,
  distance,
  youPay,
  planPays,
  onChoose,
}: {
  name: string;
  inNetwork: boolean;
  distance: number;
  youPay: number;
  planPays: number;
  onChoose: () => void;
}) {
  const dollars = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);
  return (
    <article className="lf-card lf-card--accent lf-provider-card">
      <Badge tone={inNetwork ? "success" : "warning"}>
        {inNetwork ? "In-network" : "Out-of-network"}
      </Badge>
      <h2>{name}</h2>
      <p className="muted">{distance} miles away</p>
      <p className="muted">Estimated you pay</p>
      <div className="lf-price">{dollars(youPay)}</div>
      <p>Plan pays: {dollars(planPays)}</p>
      <Button onClick={onChoose}>
        Choose provider <span aria-hidden="true">→</span>
      </Button>
    </article>
  );
}
