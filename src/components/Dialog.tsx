import { useEffect, useId, useRef, type ReactNode } from "react";
import { Icon } from "./Icon";
const stack: symbol[] = [];
let originalOverflow = "";
export function CloseButton({
  onClick,
  disabled = false,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="icon-button close-button"
      aria-label="Cerrar"
      title="Cerrar"
      disabled={disabled}
      onClick={onClick}
    >
      <Icon name="close" />
    </button>
  );
}
export function Dialog({
  title,
  onClose,
  children,
  busy = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  busy?: boolean;
}) {
  const ref = useRef<HTMLElement>(null),
    id = useId(),
    closeRef = useRef(onClose),
    busyRef = useRef(busy);
  closeRef.current = onClose;
  busyRef.current = busy;
  useEffect(() => {
    const token = Symbol();
    if (!stack.length) originalOverflow = document.body.style.overflow;
    stack.push(token);
    const previous = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    const dialog = ref.current;
    const controls = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]",
        ) || [],
      );
    controls()[0]?.focus();
    const listener = (event: KeyboardEvent) => {
      if (stack.at(-1) !== token) return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (!busyRef.current) closeRef.current();
      }
      if (event.key === "Tab") {
        const list = controls(),
          first = list[0],
          last = list.at(-1);
        if (!list.length) {
          event.preventDefault();
          dialog?.focus();
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", listener);
    return () => {
      stack.splice(stack.indexOf(token), 1);
      document.removeEventListener("keydown", listener);
      if (!stack.length) document.body.style.overflow = originalOverflow;
      previous?.focus();
    };
  }, []);
  return (
    <div className="overlay">
      <section
        ref={ref}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        tabIndex={-1}
      >
        <div className="dialog-header no-print">
          <div>
            <p className="eyebrow">THORDY · GESTIÓN LOCAL</p>
            <h2 id={id}>{title}</h2>
          </div>
          <CloseButton onClick={onClose} disabled={busy} />
        </div>
        {children}
      </section>
    </div>
  );
}
