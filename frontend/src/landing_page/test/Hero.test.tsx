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
        const heroImage = screen.getByAltText('BlueChip Terminal trading interface');
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
            screen.getByText('Trade crypto for real — with none of the risk.')
        ).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: /start trading free/i })
        ).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: /see how it works/i })
        ).toBeInTheDocument();
    });
});
