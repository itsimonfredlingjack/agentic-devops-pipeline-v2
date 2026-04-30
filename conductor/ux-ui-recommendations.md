# Plan: UX/UI Recommendations Implementation

Implementation of high-signal UX/UI improvements for the SEJFA desktop application, focusing on operational clarity, accessibility, and smoother user flows.

## Objective
Enhance the "Mission Commander" experience by improving scannability of risks, providing clear recovery paths for connectivity issues, and refining the empty-state experience.

## Key Files & Context
- `desktop/src/components/MonitorDashboard.tsx` & `.module.css`: Stall Risk visualization.
- `desktop/src/components/OmniPrompt.tsx` & `.module.css`: Reconnect button and Mission Blueprint.
- `desktop/src/components/LoopConversationPanel.tsx` & `.module.css`: Mobile close button.
- `desktop/src/components/MasterWorkspace.tsx`: Passing close handlers.
- `desktop/src/index.css`: Typography and contrast updates.

## Implementation Steps

### 1. Stall Risk Visual Gauge
- **`MonitorDashboard.tsx`**: Replace the text value for `stallProbability` with a `StallRiskGauge` component.
- **Visuals**: A 3-segment horizontal bar.
    - Low: 1st segment (Green).
    - Medium: 1st (Yellow) + 2nd (Yellow).
    - High: 1st (Red) + 2nd (Red) + 3rd (Red).
- **CSS**: Add `.riskGauge` and `.riskSegment` styles with appropriate colors and animations.

### 2. Connectivity & Reconnect Button
- **`OmniPrompt.tsx`**: 
    - Add a `RECONNECT LINK` button visible only when `issueError` is present.
    - Button will trigger a `window.location.reload()` as a robust recovery mechanism for the Electron environment.
- **CSS**: Style the button as a high-visibility but restrained "secondary" action within the error message area.

### 3. Mission Blueprint (Empty State)
- **`OmniPrompt.tsx`**: 
    - Update `getSub()` or the return JSX to show "Mission Blueprints" when no tasks are available.
    - Blueprints: "Audit System Health", "Review Recent PRs", "Sync Jira Queue".
- **CSS**: Add styles for blueprint "chips" or "actions" that appear in the prompt area.

### 4. Mobile Chat Drawer Polish
- **`LoopConversationPanel.tsx`**:
    - Add an `onClose` prop.
    - Add a `✕` button in the header, visible via CSS only on smaller screens or when explicitly requested.
- **`MasterWorkspace.tsx`**: Pass `setChatDrawerOpen(false)` to the `LoopConversationPanel`.

### 5. Contrast & Readability
- **`index.css`**:
    - Update `--text-muted` from `rgba(180, 190, 203, 0.88)` to `rgba(180, 190, 203, 0.92)`.
    - Ensure `--font-mono` uses `Geist Mono` with consistent weights.

## Verification & Testing
- **Visual Check**: Run the app in dev mode and verify the Stall Risk gauge appears when simulated.
- **Connectivity Check**: Manually trigger an error (e.g., kill the backend) and verify the "RECONNECT" button appears and works.
- **Responsiveness**: Resize the window to verify the Chat drawer close button appears on mobile widths (< 900px).
- **Accessibility**: Verify contrast ratios using DevTools accessibility audit.
