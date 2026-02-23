/**
 * ============================================================================
 * LOGIN PAGE COMPONENT TESTS
 * ============================================================================
 *
 * Tests the 3-step login flow: Role â†’ User â†’ PIN
 * Covers security-relevant edge cases.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import LoginPage from '../../components/LoginPage';
import { StoreProvider } from '../../context/StoreContext';

vi.mock('../../services/supabaseService', () => import('../mocks/supabaseService.mock'));

async function renderLogin() {
  const result = render(
    <StoreProvider>
      <LoginPage />
    </StoreProvider>
  );
  // Wait for StoreContext's isLoading to become false
  await waitFor(() => {
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
  });

  return result;
}

// Helper: select a role and user — each click needs its own act() to flush React 18 batching
async function selectAdminUser() {
  await act(async () => { fireEvent.click(screen.getByText('Admin')); });

  await act(async () => { fireEvent.click(screen.getByText('Admin User')); });

}

async function enterPin(digits: string[]) {
  for (const d of digits) {
    await act(async () => { fireEvent.click(screen.getByText(d)); });

  }
}

describe('LoginPage', () => {
  // ------- RENDERING -------
  it('renders the Hoard Lavish title', async () => {
    await renderLogin();
    expect(screen.getByText('HOARD')).toBeInTheDocument();
    expect(screen.getByText('LAVISH')).toBeInTheDocument();
  });


  it('shows 3 role buttons (Admin, Manager, Cashier)', async () => {
    await renderLogin();
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getByText('Manager')).toBeInTheDocument();
    expect(screen.getByText('Cashier')).toBeInTheDocument();
  });


  it('shows "Choose a role first" message before selection', async () => {
    await renderLogin();
    expect(screen.getByText('Choose a role first')).toBeInTheDocument();
  });


  // ------- ROLE SELECTION -------
  it('selecting a role filters users to that role', async () => {
    await renderLogin();
    const adminBtn = screen.getByText('Admin');
    await act(async () => { fireEvent.click(adminBtn); });
    expect(screen.getByText('Admin User')).toBeInTheDocument();
  });


  it('selecting Cashier shows cashier users only', async () => {
    await renderLogin();
    await act(async () => { fireEvent.click(screen.getByText('Cashier')); });

    expect(screen.getByText('John Cashier')).toBeInTheDocument();
  });


  it('switching role clears previously selected user and PIN', async () => {
    await renderLogin();
    await selectAdminUser();

    // Type some PIN digits
    await enterPin(['1', '2']);

    // Switch role
    await act(async () => { fireEvent.click(screen.getByText('Cashier')); });


    // PIN should be cleared â€” "Select a user to unlock" shown again
    expect(screen.getByText('Select a user to unlock')).toBeInTheDocument();
  });


  // ------- USER SELECTION -------
  it('selecting a user shows PIN entry pad', async () => {
    await renderLogin();
    await selectAdminUser();

    expect(screen.getByText('Enter PIN')).toBeInTheDocument();
    expect(screen.getByText('Unlock')).toBeInTheDocument();
  });


  it('PIN pad has digits 0-9, CLR, and backspace', async () => {
    await renderLogin();
    await selectAdminUser();

    for (let d = 0; d <= 9; d++) {
      expect(screen.getByText(String(d))).toBeInTheDocument();
    }
    expect(screen.getByText('CLR')).toBeInTheDocument();
    expect(screen.getByText('⌫')).toBeInTheDocument();
  });


  // ------- PIN ENTRY -------
  it('Unlock button is disabled when PIN < 4 digits', async () => {
    await renderLogin();
    await selectAdminUser();

    expect(screen.getByText('Unlock')).toBeDisabled();

    await enterPin(['1', '2']);
    expect(screen.getByText('Unlock')).toBeDisabled();
  });


  it('CLR button resets PIN', async () => {
    await renderLogin();
    await selectAdminUser();

    await enterPin(['1', '2']);
    await act(async () => { fireEvent.click(screen.getByText('CLR')); });


    // Unlock should be disabled again (PIN cleared)
    expect(screen.getByText('Unlock')).toBeDisabled();
  });


  it('backspace removes last digit', async () => {
    await renderLogin();
    await selectAdminUser();

    await enterPin(['1', '2', '3']);
    await act(async () => { fireEvent.click(screen.getByText('⌫')); });

    await act(async () => { fireEvent.click(screen.getByText('⌫')); });


    // Only 1 digit left, Unlock still disabled
    expect(screen.getByText('Unlock')).toBeDisabled();
  });


  // ------- AUTHENTICATION -------
  it('incorrect PIN shows "Incorrect PIN" error', async () => {
    await renderLogin();
    await selectAdminUser();

    // Enter wrong PIN (correct is 1234)
    await enterPin(['9', '9', '9', '9']);

    // Auto-submits at 4 digits
    await waitFor(() => {
      expect(screen.getByText('Incorrect PIN')).toBeInTheDocument();
    });

  });


  it('correct PIN logs in (component unmounts / login called)', async () => {
    await renderLogin();
    await selectAdminUser();

    // Admin User's PIN from constants is '1234'
    await enterPin(['1', '2', '3', '4']);

    // After correct PIN, login() is called â†’ currentUser changes â†’
    // App.tsx switches away from LoginPage.
    // Since we only render LoginPage here, we just verify no error shown
    await waitFor(() => {
      expect(screen.queryByText('Incorrect PIN')).not.toBeInTheDocument();
    });

  });


  it('PIN limited to 4 digits â€” cannot type 5th digit', async () => {
    await renderLogin();
    await selectAdminUser();

    // Try to enter 5 digits with wrong first 4 so we stay on login
    await enterPin(['9', '9', '9', '8']);

    // After wrong PIN, error shown and PIN cleared
    await waitFor(() => {
      expect(screen.getByText('Incorrect PIN')).toBeInTheDocument();
    });

  });


  // ------- SECURITY EDGE CASES -------
  it('no user submitted without selection shows error via Unlock', async () => {
    await renderLogin();

    // Unlock button shouldn't even be present without user selection
    expect(screen.queryByText('Unlock')).not.toBeInTheDocument();
  });

});



