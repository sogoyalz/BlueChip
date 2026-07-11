import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import axios from 'axios';
import LiveTicker from '../home/LiveTicker';

jest.mock('axios', () => ({
    __esModule: true,
    default: { get: jest.fn() },
}));

const mockedGet = axios.get as jest.Mock;

describe('LiveTicker Component', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("renders live prices after a successful fetch", async () => {
        mockedGet.mockResolvedValue({
            data: {
                prices: {
                    BTCUSD: { price: 64123.45, changePct24h: 2.4 },
                    DOGEUSD: { price: 0.0741, changePct24h: -1.2 },
                },
            },
        });
        render(<LiveTicker />);
        expect(await screen.findByTestId('live-ticker')).toBeInTheDocument();
        expect(screen.getByText('BTC')).toBeInTheDocument();
        expect(screen.getByText('$64,123.45')).toBeInTheDocument();
        expect(screen.getByText(/▲2\.40%/)).toBeInTheDocument();
        // sub-$1 coins get extra precision
        expect(screen.getByText('DOGE')).toBeInTheDocument();
        expect(screen.getByText('$0.0741')).toBeInTheDocument();
        expect(screen.getByText(/▼1\.20%/)).toBeInTheDocument();
    });

    test("renders nothing when the backend is unreachable", async () => {
        mockedGet.mockRejectedValue(new Error('backend asleep'));
        const { container } = render(<LiveTicker />);
        await waitFor(() => expect(mockedGet).toHaveBeenCalled());
        expect(container).toBeEmptyDOMElement();
    });

    test("renders nothing while the price cache is still empty", async () => {
        mockedGet.mockResolvedValue({ data: { prices: {} } });
        const { container } = render(<LiveTicker />);
        await waitFor(() => expect(mockedGet).toHaveBeenCalled());
        expect(container).toBeEmptyDOMElement();
    });
});
