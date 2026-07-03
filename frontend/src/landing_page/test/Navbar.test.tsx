import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

// react-router-dom v7 ships as exports-only ESM, which CRA's (frozen) Jest
// resolver cannot load. We only use <Link>/<NavLink> here, so mock them with
// a plain <a> to keep this a dependency-free smoke test.
jest.mock(
    'react-router-dom',
    () => {
        const Anchor = ({ to, children, className, end, ...props }: {
            to: string;
            children?: React.ReactNode;
            className?: string | ((state: { isActive: boolean }) => string);
            end?: boolean;
        }) => (
            <a
                href={to}
                className={typeof className === 'function' ? className({ isActive: false }) : className}
                {...props}
            >
                {children}
            </a>
        );
        return { Link: Anchor, NavLink: Anchor };
    },
    { virtual: true }
);

import Navbar from "../Navbar";

describe('Navbar Component', () => {
    test("renders the navigation links", () => {
        render(<Navbar />);
        expect(screen.getByText('Home')).toBeInTheDocument();
        expect(screen.getByText(/sign up/i)).toBeInTheDocument();
        expect(screen.getByText('Login')).toBeInTheDocument();
        expect(screen.getByText('About')).toBeInTheDocument();
        expect(screen.getByText('Product')).toBeInTheDocument();
        expect(screen.getByText('Pricing')).toBeInTheDocument();
        expect(screen.getByText('Support')).toBeInTheDocument();
    });

    test("renders the logo image", () => {
        render(<Navbar />);
        expect(screen.getByAltText('BlueChip')).toBeInTheDocument();
    });
});
