import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { PropsWithChildren } from "react";

type NotificationTone = "success" | "info" | "warning" | "error";

type NotificationItem = {
  id: number;
  title: string;
  message?: string;
  tone: NotificationTone;
};

type NotificationsContextValue = {
  notify: (input: {
    title: string;
    message?: string;
    tone?: NotificationTone;
  }) => void;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({ children }: PropsWithChildren) {
  const nextId = useRef(1);
  const [items, setItems] = useState<NotificationItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const notify = useCallback(
    (input: { title: string; message?: string; tone?: NotificationTone }) => {
      const id = nextId.current++;
      setItems((prev) => [
        ...prev,
        {
          id,
          title: input.title,
          message: input.message,
          tone: input.tone ?? "info",
        },
      ]);
      window.setTimeout(() => dismiss(id), 4200);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <NotificationsContext.Provider value={value}>
      {children}
      <div className="bs-notify-stack" aria-live="polite" aria-atomic="false">
        {items.map((item) => (
          <NotificationToast key={item.id} item={item} onDismiss={() => dismiss(item.id)} />
        ))}
      </div>
    </NotificationsContext.Provider>
  );
}

function NotificationToast({
  item,
  onDismiss,
}: {
  item: NotificationItem;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  return (
    <div className={`bs-notify bs-notify-${item.tone}`} role="status">
      <div className="bs-notify-body">
        <strong>{item.title}</strong>
        {item.message ? <div>{item.message}</div> : null}
      </div>
      <button type="button" className="bs-notify-close" onClick={onDismiss} aria-label="Dismiss notification">
        ×
      </button>
    </div>
  );
}

export function useNotifications() {
  const value = useContext(NotificationsContext);
  if (!value) {
    throw new Error("useNotifications must be used within NotificationsProvider");
  }
  return value;
}
