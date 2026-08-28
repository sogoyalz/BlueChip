import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';


import Stats from "../home/Stats";
import { MemoryRouter } from "react-router-dom";

describe('Stats Component', () => {
    test("renders the section heading", () => {
        render(
            <MemoryRouter>
                <Stats />
            </MemoryRouter>,
        );
        expect(screen.getByText('Learn without losing')).toBeInTheDocument();
    });

    test("renders the call-to-action links", () => {
        render(
            <MemoryRouter>
                <Stats />
            </MemoryRouter>,
        );
        expect(screen.getByText(/Explore the platform/i)).toBeInTheDocument();
        expect(screen.getByText(/Open the dashboard/i)).toBeInTheDocument();
    });
});
