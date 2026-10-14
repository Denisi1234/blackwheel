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
  localStorage.clear();
  render(<App />);
  expect(await screen.findByText(/Welcome Back/i)).toBeInTheDocument();
  expect(await screen.findByText(/Offline mode/i)).toBeInTheDocument();
  expect(screen.getAllByText(/Sign In/i).length).toBeGreaterThan(0);
});

test('renders dashboard shell when authenticated', async () => {
  localStorage.setItem('blackwheel_auth_user', JSON.stringify({ name: 'Admin User', role: 'Admin' }));
  render(<App />);
  expect(await screen.findByText(/Black Wheel/i)).toBeInTheDocument();
  expect(screen.getAllByText(/Dashboard/i).length).toBeGreaterThan(0);
});
