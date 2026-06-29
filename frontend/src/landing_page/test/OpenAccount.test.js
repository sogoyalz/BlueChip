import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import OpenAccount from "../OpenAccount";

describe('OpenAccount Component', () => {
    test("renders the heading", () => {
        render(<OpenAccount />);
        expect(screen.getByText('Open a BlueChip account')).toBeInTheDocument();
    });

    test("renders the sign up button", () => {
        render(<OpenAccount />);
        expect(
            screen.getByRole('button', { name: /Sign up for free/i })
        ).toBeInTheDocument();
    });
});
