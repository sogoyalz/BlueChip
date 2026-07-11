import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import Awards from "../home/Awards";

describe('Awards Component', () => {
    test("renders the heading", () => {
        render(<Awards />);
        expect(
            screen.getByText('Everything a real exchange has — minus the risk')
        ).toBeInTheDocument();
    });

    test("renders the feature list items", () => {
        render(<Awards />);
        expect(screen.getByText('Live Gemini prices')).toBeInTheDocument();
        expect(screen.getByText('Market & limit orders')).toBeInTheDocument();
        expect(screen.getByText('$100k practice balance')).toBeInTheDocument();
    });
});
