# Plan: UI Denoising (The Zen Pass)

Refining the interface by removing visual noise and ensuring information only appears when contextually relevant.

## Objective
Reduce the "polluted" feel of the UI by hiding dormant elements, softening inactive states, and unifying layout borders.

## Key Changes

### 1. Contextual OmniPrompt
- **`OmniPrompt.tsx`**: Wrap the `voiceHud` (Level, Telemetry, Target) in a conditional. 
- **Logic**: Only show when `recording`, `isExecuting`, or `isProcessing` is true.
- **Result**: A much cleaner header when the system is idle.

### 2. Sidebar De-emphasis
- **`Sidebar.module.css`**: Add styles to dim `telemetryItem` and `dot` when a connection is off.
- **Logic**: Use `opacity: 0.35` for disconnected states and `filter: grayscale(1)` to ensure they don't draw the eye.

### 3. Minimalist Standby
- **`MasterWorkspace.tsx`**: Simplify the `standbyContent`.
- **`MasterWorkspace.module.css`**: Remove the background box and border from the standby state. Make it just a subtle, centered mark or text.

### 4. Border & Shadow Cleanup
- **`index.css` & component CSS**: Audit and remove redundant borders. 
- **Change**: Prefer `background: rgba(255,255,255,0.02)` for section separation instead of high-contrast borders.

## Verification
- **Idle State**: Confirm the header looks significantly more empty/minimal when no mission is active.
- **Active State**: Confirm HUD elements animate in smoothly when recording starts.
- **Scannability**: Verify that active connections (Green dots) stand out much more than disconnected ones.
