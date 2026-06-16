import { useToast } from "../../context/ToastContext";
import s from "../../styles/app.module.css";

export function Toast() {
  const { message, visible } = useToast();

  return (
    <div
      className={`${s.toast} ${visible ? s.toastVisible : ""}`}
      role="status"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        aria-hidden="true"
      >
        <path d="M5 13l4 4L19 7" />
      </svg>
      <span>{message}</span>
    </div>
  );
}
