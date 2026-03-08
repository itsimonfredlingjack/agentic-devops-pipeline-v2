import { useEffect, useRef, useState } from "react";
import styles from "../styles/components/ClarificationDialog.module.css";

interface ClarificationDialogProps {
  questions: string[];
  partialSummary: string;
  round: number;
  disabled: boolean;
  onSubmit: (answer: string) => void;
  onSkip?: () => void;
}

export function ClarificationDialog({
  questions,
  partialSummary,
  round,
  disabled,
  onSubmit,
  onSkip,
}: ClarificationDialogProps) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [questions]);

  const handleSubmit = () => {
    if (!input.trim() || disabled) return;
    onSubmit(input);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <section className={styles.card} aria-label="Clarification detail">
      <div className={styles.header}>
        <span className={styles.title}>Need one detail</span>
        <span className={styles.round}>Round {round}</span>
      </div>
      <div className={styles.summary}>
        Add the missing detail so we can continue this run correctly.
      </div>
      <div className={styles.partialSummary}>{partialSummary}</div>
      <ol className={styles.questions}>
        {questions.map((q, i) => (
          <li key={i} className={styles.question}>
            {q}
          </li>
        ))}
      </ol>
      <div className={styles.inputRow}>
        <textarea
          ref={textareaRef}
          className={styles.textarea}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type the missing detail and press Enter to send."
          disabled={disabled}
          rows={3}
        />
      </div>
      <div className={styles.actions}>
        {onSkip && (
          <button
            className={styles.skipBtn}
            onClick={onSkip}
            disabled={disabled}
            type="button"
          >
            Skip for now
          </button>
        )}
        <button
          className={styles.submitBtn}
          onClick={handleSubmit}
          disabled={disabled || !input.trim()}
        >
          Send detail
        </button>
      </div>
    </section>
  );
}
