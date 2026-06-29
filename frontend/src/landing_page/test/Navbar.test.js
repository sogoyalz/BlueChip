import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

// react-router-dom v7 ships as exports-only ESM, which CRA's (frozen) Jest
// resolver cannot load. We only use <Link> here, so mock it with a plain <a>
// to keep this a dependency-free smoke test.
jest.mock(
    'react-router-dom',
    () => ({
        Link: ({ to, children, ...props }) => (
            <a href={to} {...props}>
                {children}
            </a>
        ),
    }),
    { virtual: true }
);

import Navbar from "../Navbar";

describe('Navbar Component', () => {
    test("renders the navigation links", () => {
        render(<Navbar />);
        expect(screen.getByText('Signup')).toBeInTheDocument();
        expect(screen.getByText('About')).toBeInTheDocument();
        expect(screen.getByText('Product')).toBeInTheDocument();
        expect(screen.getByText('Pricing')).toBeInTheDocument();
        expect(screen.getByText('Support')).toBeInTheDocument();
    });

    test("renders the logo image", () => {
        render(<Navbar />);
        expect(screen.getByAltText('Logo')).toBeInTheDocument();
    });
});
