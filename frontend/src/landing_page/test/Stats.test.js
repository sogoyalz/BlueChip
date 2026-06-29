import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import Stats from "../home/Stats";

describe('Stats Component', () => {
    test("renders the section heading", () => {
        render(<Stats />);
        expect(screen.getByText('Trust with confidence')).toBeInTheDocument();
    });

    test("renders the call-to-action links", () => {
        render(<Stats />);
        expect(screen.getByText(/Explore Our Project/i)).toBeInTheDocument();
        expect(screen.getByText(/Try Kite/i)).toBeInTheDocument();
    });
});
