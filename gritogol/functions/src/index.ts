import * as admin from "firebase-admin";

admin.initializeApp();

export { onVideoSubido } from "./onVideoSubido";
export {
  syncCopaScores,
  triggerCopaSync,
  simulateGoal,
  tickMatch,
} from "./syncCopaScores";
