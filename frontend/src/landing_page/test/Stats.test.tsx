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

import Stats from "../home/Stats";

describe('Stats Component', () => {
    test("renders the section heading", () => {
        render(<Stats />);
        expect(screen.getByText('Learn without losing')).toBeInTheDocument();
    });

    test("renders the call-to-action links", () => {
        render(<Stats />);
        expect(screen.getByText(/Explore the platform/i)).toBeInTheDocument();
        expect(screen.getByText(/Open the dashboard/i)).toBeInTheDocument();
    });
});
