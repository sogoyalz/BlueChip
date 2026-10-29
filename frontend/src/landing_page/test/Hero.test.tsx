import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';


import Hero from "../home/Hero";
import { MemoryRouter } from "react-router-dom";

describe('Home Hero Component', () => {
    test("renders hero image", () => {
        render(
            <MemoryRouter>
                <Hero />
            </MemoryRouter>,
        );
        const heroImage = screen.getByRole('img', { name: /illustration of the bluechip trading terminal/i });
        expect(heroImage).toBeInTheDocument();
        expect(heroImage).toHaveAttribute('src', '/media/images/heroTerminal.svg');
    });

    test("renders the tagline and CTAs", () => {
        render(
            <MemoryRouter>
                <Hero />
            </MemoryRouter>,
        );
        expect(
            screen.getByRole('heading', { level: 1, name: /real trades.*room to learn/i })
        ).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: /start trading free/i })
        ).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: /explore the platform/i })
        ).toHaveAttribute('href', '/product');
        expect(screen.getByRole('link', { name: /start trading free/i })).toHaveAttribute('href', '/signup');
    });
});
