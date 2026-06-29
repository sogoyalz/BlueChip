import React from 'react';
import { render, screen } from '@testing-library/react';
import Funds from "./Funds";

describe('Funds Component', () => {
    test("renders the fund transfer tagline", () => {
        render(<Funds />);
        expect(
            screen.getByText(/Instant, zero-cost fund transfers with UPI/i)
        ).toBeInTheDocument();
    });

    test("renders the Add funds and Withdraw buttons", () => {
        render(<Funds />);
        expect(
            screen.getByRole('button', { name: /Add funds/i })
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: /Withdraw/i })
        ).toBeInTheDocument();
    });
});
