interface Props {
  on_back?: () => void;
  on_next: () => void;
  next_label?: string;
  next_disabled?: boolean;
}

export function StepNav({
  on_back,
  on_next,
  next_label = "Continue",
  next_disabled = false,
}: Props) {
  return (
    <div className="ob-nav">
      {on_back && (
        <button type="button" className="ob-button-secondary" onClick={on_back}>
          Back
        </button>
      )}
      <button
        type="button"
        className="ob-button"
        onClick={on_next}
        disabled={next_disabled}
      >
        {next_label}
      </button>
    </div>
  );
}
