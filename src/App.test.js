import { render, screen } from '@testing-library/react';
import App from './App';

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

test('renders auth login when not authenticated', async () => {
  render(<App />);
  expect(await screen.findByText(/Welcome Back/i)).toBeInTheDocument();
  expect(screen.getAllByText(/Sign In/i).length).toBeGreaterThan(0);
});

test('offers no offline bypass without cloud', async () => {
  render(<App />);
  expect(await screen.findByText(/Welcome Back/i)).toBeInTheDocument();
  expect(screen.queryByText(/Offline mode/i)).toBeNull();
});
