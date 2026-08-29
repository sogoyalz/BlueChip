import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';


import OpenAccount from "../OpenAccount";
import { MemoryRouter } from "react-router-dom";

describe('OpenAccount Component', () => {
    test("renders the heading and sandbox-trading pitch", () => {
        render(
            <MemoryRouter>
                <OpenAccount />
            </MemoryRouter>,
        );
        expect(screen.getByText('Open a BlueChip account')).toBeInTheDocument();
        expect(
            screen.getByText(/gemini's sandbox exchange/i)
        ).toBeInTheDocument();
    });

    test("renders the sign up link", () => {
        render(
            <MemoryRouter>
                <OpenAccount />
            </MemoryRouter>,
        );
        expect(
            screen.getByRole('link', { name: /Sign up for free/i })
        ).toBeInTheDocument();
    });
});
