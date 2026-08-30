import React from "react";
import { act, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

import Reveal from "../Reveal";

/**
 * Reveal starts its children at opacity 0 and adds .reveal--in when they enter
 * the viewport. That makes its failure mode "content permanently invisible",
 * so the escape hatches matter more than the animation: reduced motion, and a
 * browser with no IntersectionObserver. None of it was covered.
 */
type ObsCb = (entries: Array<{ isIntersecting: boolean }>) => void;

let callbacks: ObsCb[] = [];
let disconnects = 0;
const realIO = globalThis.IntersectionObserver;
const realMM = window.matchMedia;

const installIO = () => {
  callbacks = [];
  disconnects = 0;
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = class {
    constructor(cb: ObsCb) { callbacks.push(cb); }
    observe() {}
    disconnect() { disconnects += 1; }
  };
};

const setReducedMotion = (reduce: boolean) => {
  window.matchMedia = ((q: string) => ({
    matches: reduce && q.includes("prefers-reduced-motion"),
    media: q, addEventListener() {}, removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
};

beforeEach(() => {
  installIO();
  setReducedMotion(false);
});
afterEach(() => {
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = realIO;
  window.matchMedia = realMM;
});

describe("Reveal", () => {
  test("starts hidden and settles once it enters view", () => {
    render(<Reveal><p>content</p></Reveal>);
    const el = screen.getByText("content").parentElement!;
    expect(el.className).toContain("reveal");
    expect(el.className).not.toContain("reveal--in");

    act(() => callbacks[0]([{ isIntersecting: true }]));
    expect(screen.getByText("content").parentElement!.className).toContain("reveal--in");
  });

  test("is one-shot: it stops observing once shown", () => {
    render(<Reveal><p>content</p></Reveal>);
    act(() => callbacks[0]([{ isIntersecting: true }]));
    expect(disconnects).toBeGreaterThan(0);
  });

  test("stays hidden while it is still out of view", () => {
    render(<Reveal><p>content</p></Reveal>);
    act(() => callbacks[0]([{ isIntersecting: false }]));
    expect(screen.getByText("content").parentElement!.className).not.toContain("reveal--in");
  });

  test("under reduced motion it shows immediately and never observes", () => {
    setReducedMotion(true);
    render(<Reveal><p>content</p></Reveal>);
    expect(screen.getByText("content").parentElement!.className).toContain("reveal--in");
    expect(callbacks).toHaveLength(0);
  });

  test("without IntersectionObserver it shows immediately rather than staying blank", () => {
    // The failure mode this guards is the worst one: content that is present
    // in the DOM, invisible, forever.
    (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = undefined;
    render(<Reveal><p>content</p></Reveal>);
    expect(screen.getByText("content").parentElement!.className).toContain("reveal--in");
  });

  test("disconnects on unmount, so a scrolled-past section leaks nothing", () => {
    const { unmount } = render(<Reveal><p>content</p></Reveal>);
    unmount();
    expect(disconnects).toBeGreaterThan(0);
  });

  test("renders as the requested element and forwards a stagger delay", () => {
    render(<Reveal as="section" delay={120} className="extra"><p>c</p></Reveal>);
    const el = screen.getByText("c").parentElement!;
    expect(el.tagName).toBe("SECTION");
    expect(el.className).toContain("extra");
    expect(el.getAttribute("style")).toContain("120ms");
  });
});
