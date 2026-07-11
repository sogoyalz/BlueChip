import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import Awards from "../home/Awards";

describe('Awards Component', () => {
    test("renders the heading", () => {
        render(<Awards />);
        expect(screen.getByText('Everything you need to trade')).toBeInTheDocument();
    });

    test("renders the product list items", () => {
        render(<Awards />);
        expect(screen.getByText('Stocks & ETFs')).toBeInTheDocument();
        expect(screen.getByText('Mutual funds')).toBeInTheDocument();
    });
});
