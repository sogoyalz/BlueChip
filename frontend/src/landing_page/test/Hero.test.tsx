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

import Hero from "../home/Hero";

describe('Home Hero Component', () => {
    test("renders hero image", () => {
        render(<Hero />);
        const heroImage = screen.getByAltText('BlueChip Terminal trading interface');
        expect(heroImage).toBeInTheDocument();
        expect(heroImage).toHaveAttribute('src', '/media/images/heroTerminal.svg');
    });

    test("renders the tagline and CTAs", () => {
        render(<Hero />);
        expect(screen.getByText('Trade with conviction')).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: /open a free account/i })
        ).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: /see pricing/i })
        ).toBeInTheDocument();
    });
});
