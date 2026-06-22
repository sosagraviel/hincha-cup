import * as admin from "firebase-admin";

admin.initializeApp();

export { onVideoSubido } from "./onVideoSubido";
export { moderarVideo } from "./moderarVideo";
export { cerrarCompetencias } from "./cerrarCompetencias";
export {
  syncCopaScores,
  triggerCopaSync,
  simulateGoal,
  tickMatch,
} from "./syncCopaScores";
