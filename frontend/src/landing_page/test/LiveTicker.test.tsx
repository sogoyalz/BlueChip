import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
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

    test("flashes a pill up/down when its price changes between polls", async () => {
        jest.useFakeTimers();
        // Advance the poll interval, then let the fetch promise settle.
        const tick = async (ms: number) => {
            await act(async () => {
                jest.advanceTimersByTime(ms);
                await Promise.resolve();
                await Promise.resolve();
            });
        };
        try {
            // First poll: baseline. Second poll: BTC up, DOGE down.
            mockedGet
                .mockResolvedValueOnce({
                    data: {
                        prices: {
                            BTCUSD: { price: 64000, changePct24h: 2.4 },
                            DOGEUSD: { price: 0.07, changePct24h: -1.2 },
                        },
                    },
                })
                .mockResolvedValueOnce({
                    data: {
                        prices: {
                            BTCUSD: { price: 64500, changePct24h: 2.5 },
                            DOGEUSD: { price: 0.06, changePct24h: -1.3 },
                        },
                    },
                });

            render(<LiveTicker />);

            // Let the first fetch resolve — no flash on the very first render.
            await tick(0);
            expect(screen.getByText('BTC')).toBeInTheDocument();
            expect(screen.getByText('BTC').closest('.ticker-pill'))
                .not.toHaveAttribute('data-flash');

            // Advance to the next poll: prices move, pills flash.
            await tick(5000);
            expect(screen.getByText('BTC').closest('.ticker-pill'))
                .toHaveAttribute('data-flash', 'up');
            expect(screen.getByText('DOGE').closest('.ticker-pill'))
                .toHaveAttribute('data-flash', 'down');

            // The pulse clears itself after ~900ms so it can retrigger.
            await tick(900);
            expect(screen.getByText('BTC').closest('.ticker-pill'))
                .not.toHaveAttribute('data-flash');
        } finally {
            jest.useRealTimers();
        }
    });
});
