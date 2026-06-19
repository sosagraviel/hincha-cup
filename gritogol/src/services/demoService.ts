import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";

const tickMatchFn = httpsCallable<
  { fixtureId: number; partidoId?: string },
  { minuto: number }
>(functions, "tickMatch");

const simulateGoalFn = httpsCallable<
  { partidoId: string },
  { golNumero: number; partidoId: string }
>(functions, "simulateGoal");

export interface DemoOptions {
  fixtureId: number;
  partidoId: string;
  tickIntervalMs?: number;
  goalDelayMs?: number;
}

export function startDemoTicker(options: DemoOptions): () => void {
  const {
    fixtureId,
    partidoId,
    tickIntervalMs = 15_000,
    goalDelayMs = 60_000,
  } = options;

  let stopped = false;

  const tickId = setInterval(() => {
    if (stopped) return;
    void tickMatchFn({ fixtureId, partidoId }).catch(console.error);
  }, tickIntervalMs);

  const goalId = setTimeout(() => {
    if (stopped) return;
    void simulateGoalFn({ partidoId }).catch(console.error);
  }, goalDelayMs);

  return () => {
    stopped = true;
    clearInterval(tickId);
    clearTimeout(goalId);
  };
}
