import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import Awards from "../home/Awards";

describe('Awards Component', () => {
    test("renders the heading", () => {
        render(<Awards />);
        expect(
            screen.getByText('A real exchange, minus the risk')
        ).toBeInTheDocument();
    });

    test("renders the feature list items", () => {
        render(<Awards />);
        expect(screen.getByText('Live Gemini prices')).toBeInTheDocument();
        expect(screen.getByText('Market & limit orders')).toBeInTheDocument();
        expect(screen.getByText('Zero real money, ever')).toBeInTheDocument();
    });
});
