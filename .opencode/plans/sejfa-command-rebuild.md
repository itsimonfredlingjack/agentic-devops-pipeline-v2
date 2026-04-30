# SEJFA COMMAND — Complete UI Rebuild Plan

## Goal
Rebuild the SEJFA COMMAND frontend as a premium AI operations console. Dark, cybernetic, precise, product-grade. Not generic SaaS. Not crypto. Not game-like. A serious command interface for AI infrastructure.

## Scope
Complete redesign and rebuild of the desktop app interface with:
1. New design system (tokens, colors, typography, spacing)
2. New component architecture
3. Realistic mock data
4. All UI modules from spec

## Design System

### Color Palette
- **Canvas**: `#030308` (pure deep black)
- **Surface**: `#0a0a12` (dark navy)
- **Elevated**: `#12121e` (raised panels)
- **Border**: `rgba(255,255,255,0.06)`
- **Border Hover**: `rgba(255,255,255,0.12)`
- **Cyan (Active)**: `#00d4ff`
- **Cyan Dim**: `rgba(0,212,255,0.12)`
- **Green (Success)**: `#00d68f`
- **Green Dim**: `rgba(0,214,143,0.12)`
- **Amber (Warning/Cost)**: `#ff9f43`
- **Amber Dim**: `rgba(255,159,67,0.12)`
- **Red (Failure)**: `#ff4757`
- **Red Dim**: `rgba(255,71,87,0.12)`
- **Purple (Accent)**: `#8b5cf6`
- **Text Primary**: `#e8e8f0`
- **Text Secondary**: `#9090a8`
- **Text Muted**: `#606078`
- **Text Dim**: `#404058`

### Typography
- **UI Font**: Inter / system-ui
- **Mono Font**: JetBrains Mono (for logs, metrics, IDs)
- **Display Numbers**: 28-32px, weight 600
- **Labels**: 10px, uppercase, letter-spacing 0.1em
- **Body**: 13px, line-height 1.5
- **Log Rows**: 12px mono

### Spacing
- Panel padding: 20px
- Card padding: 16px
- Gap between panels: 16px
- Border radius: 8px (panels), 6px (buttons), 4px (tags)

### Shadows & Glows
- Panel shadow: `0 4px 24px rgba(0,0,0,0.4)`
- Glow cyan: `0 0 16px rgba(0,212,255,0.2)`
- Glow green: `0 0 16px rgba(0,214,143,0.2)`
- Glow amber: `0 0 16px rgba(255,159,67,0.2)`
- Glow red: `0 0 16px rgba(255,71,87,0.2)`

## Component Architecture

### App Shell (`App.tsx`)
- Dark canvas background
- CSS Grid layout: sidebar + main workspace
- Global state provider

### Sidebar (`Sidebar.tsx`)
- Left edge cyan accent line (3px)
- Brand header with dot + "SEJFA COMMAND"
- Mode switcher (Task Loop / History)
- System telemetry (Run Monitor, Voice Intake, Agent Health)
- View switcher (Tasks / My Tasks / Projects)
- Task queue with active highlight
- User status footer

### Workspace Header (`WorkspaceHeader.tsx`)
- Breadcrumb: SEJFA / Task Loop / PROJ-124
- Phase badge (IDLE / RUNNING / BLOCKED)
- User avatar

### Metrics Bar (`MetricsBar.tsx`)
- 4-5 metric cards in a row
- Large numbers with color coding
- Labels in uppercase micro-text

### Execution Log (`ExecutionLog.tsx`)
- Terminal-inspired but refined
- Table-like rows with columns
- Timestamp | Tool | Target | Status
- Color-coded status indicators
- Failed rows with subtle red left border
- Active row with cyan glow

### Voice Intake Panel (`VoiceIntake.tsx`)
- Selected task context box
- Voice/text toggle
- Record button with pulse animation
- Keyboard shortcut hint
- Transcription preview area
- Inject action button

### Task Detail Panel (`TaskDetail.tsx`)
- Task ID and title
- Description
- Branch/repo context
- Labels/tags
- Action buttons

## File Structure
```
desktop/src/
  design/
    tokens.css          # CSS custom properties
    global.css          # Global styles, resets, utilities
  components/
    AppShell.tsx        # Main layout
    Sidebar.tsx         # Navigation sidebar
    WorkspaceHeader.tsx # Top bar
    MetricsBar.tsx      # Telemetry cards
    ExecutionLog.tsx    # Live trace viewer
    VoiceIntake.tsx     # Human context input
    TaskDetail.tsx      # Task info panel
    StatusBadge.tsx     # Reusable status indicator
    LogRow.tsx          # Individual log entry
    MetricCard.tsx      # Individual metric
```

## Implementation Order
1. Create design tokens (tokens.css)
2. Create global styles (global.css)
3. Build AppShell layout
4. Build Sidebar
5. Build WorkspaceHeader
6. Build MetricsBar
7. Build ExecutionLog
8. Build VoiceIntake
9. Build TaskDetail
10. Wire everything together in App.tsx
11. Add realistic mock data
12. Build and test

## Mock Data
- Task: PROJ-124 "Implement user authentication flow with OAuth"
- Branch: feature/PROJ-124-auth
- Status: PARTIAL FAILURE (one failed test)
- Tool calls: 24
- Cost: $1.24
- Duration: 2m 14s
- Success rate: 96%
- Execution log with 6-8 realistic entries

## Risks
- Build time: ~2-3 hours for full implementation
- Complexity: Managing all UI states
- Risk of visual inconsistency without strict token adherence

## Validation
- `npm --workspace desktop run build` must pass
- Visual QA at multiple viewport sizes
- Check all interactive states (hover, active, disabled)
