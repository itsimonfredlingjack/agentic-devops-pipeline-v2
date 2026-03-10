import { expect, test } from "@playwright/test";

const SCENARIOS = ["idle", "processing", "clarifying", "done", "error"] as const;

test.describe("voice-app visual baseline", () => {
  for (const scenario of SCENARIOS) {
    test(`matches ${scenario} snapshot`, async ({ page }) => {
      await page.goto(`/__visual?scenario=${scenario}`);
      await page.addStyleTag({
        content:
          "*,*::before,*::after{animation:none !important;transition:none !important;} input,textarea{caret-color:transparent !important;}",
      });
      await page.evaluate(() => {
        const activeElement = document.activeElement as HTMLElement | null;
        activeElement?.blur();
      });
      await expect(page).toHaveScreenshot(`voice-${scenario}.png`, {
        fullPage: true,
      });
    });
  }
});
