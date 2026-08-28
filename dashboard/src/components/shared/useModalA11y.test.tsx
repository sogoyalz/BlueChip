import React, { useRef } from "react";
import { render, screen, fireEvent } from "@testing-library/react";

import { useModalA11y } from "./useModalA11y";

function Modal({
  onDismiss,
  escapeDismisses = true,
  focusLast = false,
}: {
  onDismiss: () => void;
  escapeDismisses?: boolean;
  focusLast?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const lastRef = useRef<HTMLButtonElement>(null);
  useModalA11y(ref, onDismiss, {
    escapeDismisses,
    initialFocus: focusLast ? lastRef : undefined,
  });
  return (
    <div ref={ref} tabIndex={-1} role="dialog">
      <button type="button">first</button>
      <input aria-label="qty" />
      <input aria-label="readonly" tabIndex={-1} readOnly />
      <button type="button" ref={lastRef}>
        last
      </button>
    </div>
  );
}

const tab = (shift = false) =>
  fireEvent.keyDown(document, { key: "Tab", shiftKey: shift });

describe("useModalA11y", () => {
  it("moves focus into the modal on open", () => {
    render(<Modal onDismiss={jest.fn()} />);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "first" }),
    );
  });

  it("honours an explicit initial focus target", () => {
    render(<Modal onDismiss={jest.fn()} focusLast />);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "last" }),
    );
  });

  it("wraps Tab from the last element back to the first", () => {
    render(<Modal onDismiss={jest.fn()} focusLast />);
    tab();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "first" }),
    );
  });

  it("wraps Shift+Tab from the first element to the last", () => {
    render(<Modal onDismiss={jest.fn()} />);
    tab(true);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "last" }),
    );
  });

  it("skips elements that opted out with tabindex -1", () => {
    render(<Modal onDismiss={jest.fn()} />);
    tab(true);
    // Last tabbable is the button, not the readonly input that follows nothing.
    expect(document.activeElement).not.toBe(screen.getByLabelText("readonly"));
  });

  it("pulls focus back in when it has escaped the modal", () => {
    render(
      <>
        <button type="button">outside</button>
        <Modal onDismiss={jest.fn()} />
      </>,
    );
    screen.getByRole("button", { name: "outside" }).focus();
    tab();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "first" }),
    );
  });

  it("dismisses on Escape", () => {
    const onDismiss = jest.fn();
    render(<Modal onDismiss={onDismiss} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("does not dismiss on Escape when escapeDismisses is false", () => {
    const onDismiss = jest.fn();
    render(<Modal onDismiss={onDismiss} escapeDismisses={false} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("reads the latest onDismiss without re-running on every render", () => {
    const first = jest.fn();
    const second = jest.fn();
    const { rerender } = render(<Modal onDismiss={first} />);

    // Move focus away, then re-render. A re-running effect would yank focus
    // back to the first field mid-keystroke.
    screen.getByLabelText("qty").focus();
    rerender(<Modal onDismiss={second} />);
    expect(document.activeElement).toBe(screen.getByLabelText("qty"));

    fireEvent.keyDown(document, { key: "Escape" });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("restores focus to the opener on unmount", () => {
    render(<button type="button">opener</button>);
    const opener = screen.getByRole("button", { name: "opener" });
    opener.focus();

    const { unmount } = render(<Modal onDismiss={jest.fn()} />);
    expect(document.activeElement).not.toBe(opener);
    unmount();
    expect(document.activeElement).toBe(opener);
  });

  it("leaves focus alone if the user moved it elsewhere before closing", () => {
    render(<button type="button">opener</button>);
    const opener = screen.getByRole("button", { name: "opener" });
    opener.focus();

    const { unmount } = render(<Modal onDismiss={jest.fn()} />);
    render(<button type="button">elsewhere</button>);
    const elsewhere = screen.getByRole("button", { name: "elsewhere" });
    elsewhere.focus();

    unmount();
    expect(document.activeElement).toBe(elsewhere);
  });

  it("stops listening once unmounted", () => {
    const onDismiss = jest.fn();
    const { unmount } = render(<Modal onDismiss={onDismiss} />);
    unmount();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
