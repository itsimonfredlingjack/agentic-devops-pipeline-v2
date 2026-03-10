import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CommandPalette, type CommandAction } from "../components/CommandPalette";

const ACTIONS: CommandAction[] = [
  {
    id: "toggle-record",
    label: "Start recording",
    hint: "Space",
    enabled: true,
  },
  {
    id: "submit-capture",
    label: "Submit capture",
    hint: "Cmd/Ctrl+Enter",
    enabled: false,
  },
  {
    id: "open-settings",
    label: "Open settings",
    hint: "Backend and monitor URLs",
    enabled: true,
  },
];

describe("CommandPalette", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <CommandPalette
        open={false}
        actions={ACTIONS}
        onClose={vi.fn()}
        onRunAction={vi.fn()}
      />,
    );

    expect(container.innerHTML).toBe("");
  });

  it("filters actions from the search input", async () => {
    const user = userEvent.setup();
    render(
      <CommandPalette
        open={true}
        actions={ACTIONS}
        onClose={vi.fn()}
        onRunAction={vi.fn()}
      />,
    );

    const search = screen.getByPlaceholderText("Search actions...");
    await user.type(search, "settings");

    expect(screen.getByRole("button", { name: /Open settings/i })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Start recording/i }),
    ).not.toBeInTheDocument();
  });

  it("runs selected action on Enter", async () => {
    const onRunAction = vi.fn();
    render(
      <CommandPalette
        open={true}
        actions={ACTIONS}
        onClose={vi.fn()}
        onRunAction={onRunAction}
      />,
    );

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    expect(onRunAction).toHaveBeenCalledWith("toggle-record");
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <CommandPalette
        open={true}
        actions={ACTIONS}
        onClose={onClose}
        onRunAction={vi.fn()}
      />,
    );

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
