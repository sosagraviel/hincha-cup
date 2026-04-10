import { GapQuestionsService } from '../../../../../services/gap-questions.service.js';

/**
 * Ask gap questions interactively using TypeScript service
 */
export async function askGapQuestions(
  consolidationPath: string,
  skipQuestions: boolean = false,
): Promise<{ success: boolean; error?: string }> {
  const gapService = new GapQuestionsService();

  try {
    const result = await gapService.askGapQuestions(consolidationPath, skipQuestions);

    return {
      success: result.success,
      error: result.error,
    };
  } catch (error) {
    return {
      success: false,
      error: `Gap questions failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
