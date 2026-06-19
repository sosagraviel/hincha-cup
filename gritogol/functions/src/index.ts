import * as admin from "firebase-admin";

admin.initializeApp();

export { onVideoSubido } from "./onVideoSubido";
export { cerrarCompetencias } from "./cerrarCompetencias";
export {
  syncCopaScores,
  triggerCopaSync,
  simulateGoal,
  tickMatch,
} from "./syncCopaScores";
