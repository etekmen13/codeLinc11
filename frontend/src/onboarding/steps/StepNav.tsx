interface Props {
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
}

export function StepNav({
  onBack,
  onNext,
  nextLabel = "Continue",
  nextDisabled = false,
}: Props) {
  return (
    <div className="ob-nav">
      {onBack && (
        <button type="button" className="ob-button-secondary" onClick={onBack}>
          Back
        </button>
      )}
      <button
        type="button"
        className="ob-button"
        onClick={onNext}
        disabled={nextDisabled}
      >
        {nextLabel}
      </button>
    </div>
  );
}
