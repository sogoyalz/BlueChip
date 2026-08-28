import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';


import Navbar from "../Navbar";
import { MemoryRouter } from "react-router-dom";

describe('Navbar Component', () => {
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
