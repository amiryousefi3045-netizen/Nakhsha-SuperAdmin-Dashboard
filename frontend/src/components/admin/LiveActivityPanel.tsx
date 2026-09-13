import { useCallback, useEffect, useRef, useState } from "react";
import { Radio, RefreshCw, Trash2 } from "lucide-react";
import { subscribeAdminLiveEvents } from "../../services/adminService";
import type { AdminLiveEvent } from "../../types/admin";
import { StatusBadge, riskTone } from "./StatusBadge";
import { faNumber, formatDateTime, RISK_LABEL } from "../../lib/adminFormat";

const MAX_EVENTS = 50;

type StreamStatus = "connecting" | "live" | "off";

function FaClock({ value }: { value: string }) {
  return <span className="text-xs text-[var(--color-muted)]">{faNumber(formatDateTime(value))}</span>;
}

export function LiveActivityPanel() {
  const [events, setEvents] = useState<AdminLiveEvent[]>([]);
  const [status, setStatus] = useState<StreamStatus>("connecting");
  const closeRef = useRef<(() => void) | null>(null);

  const connect = useCallback(() => {
    if (closeRef.current) return;
    setStatus("connecting");
    closeRef.current = subscribeAdminLiveEvents({
      onEvent: (event) => {
        setStatus("live");
        if (event.type === "audit" && event.payload) {
          setEvents((prev) => [event, ...prev].slice(0, MAX_EVENTS));
        }
      },
      onError: () => setStatus("off"),
      onClose: () => setStatus("off"),
    });
  }, []);

  useEffect(() => {
    connect();
    return () => {
      closeRef.current?.();
      closeRef.current = null;
    };
  }, [connect]);

  const toggle = () => {
    if (closeRef.current) {
      closeRef.current();
      closeRef.current = null;
      setStatus("off");
    } else {
      connect();
    }
  };

  const statusBadge =
    status === "live" ? (
      <StatusBadge label="متصل (زنده)" tone="green" />
    ) : status === "connecting" ? (
      <StatusBadge label="در حال اتصال..." tone="amber" />
    ) : (
      <StatusBadge label="قطع شده" tone="gray" />
    );

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--color-text)]">
          <Radio className="h-4 w-4 text-[var(--color-primary)]" />
          فعالیت‌های زنده
          <span className="relative flex h-2.5 w-2.5">
            {status === "live" ? (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
            ) : null}
            <span
              className={
                status === "live"
                  ? "relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500"
                  : status === "connecting"
                    ? "relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-400"
                    : "relative inline-flex h-2.5 w-2.5 rounded-full bg-slate-300"
              }
            />
          </span>
        </h3>
        <div className="flex items-center gap-2">
          {statusBadge}
          <button
            type="button"
            onClick={toggle}
            title={status === "off" ? "اتصال مجدد" : "توقف جریان"}
            className="rounded-lg border border-[var(--color-border)] p-1.5 text-[var(--color-text)] hover:bg-[var(--color-primary)]/5"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setEvents([])}
            title="پاک کردن لیست"
            className="rounded-lg border border-[var(--color-border)] p-1.5 text-[var(--color-text)] hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <ul className="mt-4 divide-y divide-[var(--color-border)]">
        {events.length === 0 ? (
          <li className="py-6 text-center text-sm text-[var(--color-muted)]">
            {status === "off" ? "جریان غیرفعال است" : "منتظر وقوع عملیات..."}
          </li>
        ) : (
          events.map((event) => (
            <li key={event.payload?.id ?? `${event.type}-${event.at}`} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/10 text-xs font-bold text-[var(--color-primary)]">
                  {(event.payload?.actorId ?? "؟").slice(-2).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate">
                    <span className="inline-flex rounded-full bg-[var(--color-primary)]/10 px-2 py-0.5 text-xs font-medium text-[var(--color-primary)]">
                      {event.payload?.action ?? event.type}
                    </span>
                    {event.payload?.resourceType ? (
                      <span className="ms-2 text-xs text-[var(--color-muted)]">
                        {event.payload.resourceType}
                        {event.payload.resourceId ? ` · ${event.payload.resourceId.slice(-6)}` : ""}
                      </span>
                    ) : null}
                  </p>
                  {event.payload?.createdAt ? (
                    <p className="mt-0.5">
                      <FaClock value={event.payload.createdAt} />
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="shrink-0">
                {event.payload?.riskLevel ? (
                  <StatusBadge label={RISK_LABEL[event.payload.riskLevel] ?? event.payload.riskLevel} tone={riskTone(event.payload.riskLevel)} />
                ) : null}
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}