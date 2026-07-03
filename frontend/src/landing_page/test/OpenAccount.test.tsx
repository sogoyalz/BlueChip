import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

// react-router-dom v7 ships as exports-only ESM, which CRA's (frozen) Jest
// resolver cannot load. We only use <Link> here, so mock it with a plain <a>
// to keep this a dependency-free smoke test.
jest.mock(
    'react-router-dom',
    () => ({
        Link: ({ to, children, ...props }: { to: string; children?: React.ReactNode }) => (
            <a href={to} {...props}>
                {children}
            </a>
        ),
    }),
    { virtual: true }
);

import OpenAccount from "../OpenAccount";

describe('OpenAccount Component', () => {
    test("renders the heading", () => {
        render(<OpenAccount />);
        expect(screen.getByText('Open a BlueChip account')).toBeInTheDocument();
    });

    test("renders the sign up link", () => {
        render(<OpenAccount />);
        expect(
            screen.getByRole('link', { name: /Sign up for free/i })
        ).toBeInTheDocument();
    });
});
