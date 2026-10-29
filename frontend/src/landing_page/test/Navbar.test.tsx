import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';


import Navbar from "../Navbar";
import { MemoryRouter } from "react-router-dom";

describe('Navbar Component', () => {
    test('mobile disclosure closes on Escape and restores focus', () => {
        render(<MemoryRouter><Navbar /></MemoryRouter>);
        const toggle = screen.getByRole('button', { name: /toggle navigation/i });
        fireEvent.click(toggle);
        expect(toggle).toHaveAttribute('aria-expanded', 'true');
        fireEvent.keyDown(screen.getByRole('navigation'), { key: 'Escape' });
        expect(toggle).toHaveAttribute('aria-expanded', 'false');
        expect(toggle).toHaveFocus();
    });

    test('mobile disclosure closes after navigating to another page', () => {
        render(<MemoryRouter><Navbar /></MemoryRouter>);
        const toggle = screen.getByRole('button', { name: /toggle navigation/i });
        fireEvent.click(toggle);
        fireEvent.click(screen.getByRole('link', { name: 'Product' }));
        expect(toggle).toHaveAttribute('aria-expanded', 'false');
    });
    test("renders the navigation links", () => {
        render(
            <MemoryRouter>
                <Navbar />
            </MemoryRouter>,
        );
        expect(screen.getByText('Home')).toBeInTheDocument();
        expect(screen.getByText(/sign up/i)).toBeInTheDocument();
        expect(screen.getByText('Login')).toBeInTheDocument();
        expect(screen.getByText('About')).toBeInTheDocument();
        expect(screen.getByText('Product')).toBeInTheDocument();
        expect(screen.getByText('Pricing')).toBeInTheDocument();
        expect(screen.getByText('Support')).toBeInTheDocument();
    });

    test("renders the logo image", () => {
        render(
            <MemoryRouter>
                <Navbar />
            </MemoryRouter>,
        );
        expect(screen.getByAltText('BlueChip')).toBeInTheDocument();
    });
});
