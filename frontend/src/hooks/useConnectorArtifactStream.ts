import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ConnectorArtifactEvent } from "../domain/business-sentry";

const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

type StreamState = {
  events: ConnectorArtifactEvent[];
  status: "idle" | "connecting" | "open" | "error";
};

export function useConnectorArtifactStream(connectorId: number | null, organizationId?: number) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<StreamState>({ events: [], status: "idle" });

  useEffect(() => {
    if (!connectorId) {
      setState({ events: [], status: "idle" });
      return;
    }

    setState((current) => ({ ...current, status: "connecting" }));
    const source = new EventSource(`${API_BASE}/data-sources/stream/${connectorId}`);

    source.addEventListener("artifact", (event) => {
      const payload = JSON.parse((event as MessageEvent<string>).data) as ConnectorArtifactEvent;
      setState((current) => {
        const withoutDuplicate = current.events.filter((item) => item.seq !== payload.seq);
        const nextEvents = [...withoutDuplicate, payload].slice(-80);
        return { events: nextEvents, status: "open" };
      });
      if (payload.status === "completed" || payload.status === "error") {
        void queryClient.invalidateQueries({ queryKey: ["bs", "connectors", organizationId] });
        void queryClient.invalidateQueries({ queryKey: ["bs", "sourceMemory", organizationId] });
        void queryClient.invalidateQueries({ queryKey: ["bs", "detectors", organizationId] });
      }
    });

    source.onerror = () => {
      setState((current) => ({ ...current, status: "error" }));
    };

    return () => {
      source.close();
    };
  }, [connectorId, organizationId, queryClient]);

  const latestEvent = state.events[state.events.length - 1] ?? null;
  const activeStatus = useMemo(() => {
    if (!latestEvent?.status) return "idle";
    if (latestEvent.status === "running") return "running";
    if (latestEvent.status === "completed") return "completed";
    if (latestEvent.status === "error") return "error";
    return "idle";
  }, [latestEvent]);

  return {
    events: state.events,
    streamStatus: state.status,
    latestEvent,
    activeStatus,
  };
}
