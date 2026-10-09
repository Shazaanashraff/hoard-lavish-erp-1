import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const getSmsSenderVerification = vi.fn();
const verifySmsSender = vi.fn();

vi.mock('../context/StoreContext', () => ({
  useStore: () => ({ getSmsSenderVerification, verifySmsSender }),
}));

import SenderIdVerifier from '../components/sms/SenderIdVerifier';

const VERIFIED = { senderId: 'HoardLavish', verifiedAt: '2026-10-09T05:00:00Z', phoneMasked: '9477***567' };

beforeEach(() => {
  getSmsSenderVerification.mockReset();
  verifySmsSender.mockReset();
});

describe('SenderIdVerifier', () => {
  it('shows nothing actionable for an empty sender ID', () => {
    render(<SenderIdVerifier senderId="" />);
    expect(screen.queryByTestId('sender-verify-button')).toBeNull();
    expect(getSmsSenderVerification).not.toHaveBeenCalled();
  });

  it('flags a badly formatted ID without calling the server or offering Verify', () => {
    render(<SenderIdVerifier senderId="Hoard Lavish" />);
    expect(screen.getByTestId('sender-status-invalid')).toBeTruthy();
    expect(screen.queryByTestId('sender-verify-button')).toBeNull();
    expect(getSmsSenderVerification).not.toHaveBeenCalled();
  });

  it('shows "Verified" when the log has an accepted check for the ID', async () => {
    getSmsSenderVerification.mockResolvedValue(VERIFIED);
    render(<SenderIdVerifier senderId="HoardLavish" />);
    await waitFor(() => expect(screen.getByTestId('sender-status-verified')).toBeTruthy());
    expect(getSmsSenderVerification).toHaveBeenCalledWith('HoardLavish');
    expect(screen.getByTestId('sender-status-verified').textContent).toContain('9477***567');
  });

  it('shows "Not verified" when there is no accepted check', async () => {
    getSmsSenderVerification.mockResolvedValue(null);
    render(<SenderIdVerifier senderId="HoardLavish" />);
    await waitFor(() => expect(screen.getByTestId('sender-status-unverified')).toBeTruthy());
  });

  it('keeps Verify disabled until a phone number is entered', async () => {
    getSmsSenderVerification.mockResolvedValue(null);
    render(<SenderIdVerifier senderId="HoardLavish" />);
    const button = screen.getByTestId('sender-verify-button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByTestId('sender-verify-phone'), { target: { value: '0771234567' } });
    expect(button.disabled).toBe(false);
  });

  it('asks for confirmation (it costs a credit) and does not send until confirmed', async () => {
    getSmsSenderVerification.mockResolvedValue(null);
    render(<SenderIdVerifier senderId="HoardLavish" />);
    fireEvent.change(screen.getByTestId('sender-verify-phone'), { target: { value: '0771234567' } });
    fireEvent.click(screen.getByTestId('sender-verify-button'));

    expect(screen.getByText('Send a test SMS?')).toBeTruthy();
    expect(verifySmsSender).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Cancel'));
    expect(verifySmsSender).not.toHaveBeenCalled();
  });

  it('on success reports it and flips the badge to verified', async () => {
    getSmsSenderVerification.mockResolvedValueOnce(null).mockResolvedValueOnce(VERIFIED);
    verifySmsSender.mockResolvedValue({ ok: true, senderId: 'HoardLavish', message: 'Sender ID accepted by text.lk.' });

    render(<SenderIdVerifier senderId="HoardLavish" />);
    await waitFor(() => expect(screen.getByTestId('sender-status-unverified')).toBeTruthy());

    fireEvent.change(screen.getByTestId('sender-verify-phone'), { target: { value: '0771234567' } });
    fireEvent.click(screen.getByTestId('sender-verify-button'));
    fireEvent.click(screen.getByText('Send test'));

    await waitFor(() => expect(screen.getByTestId('sender-verify-success')).toBeTruthy());
    expect(verifySmsSender).toHaveBeenCalledWith('HoardLavish', '0771234567');
    await waitFor(() => expect(screen.getByTestId('sender-status-verified')).toBeTruthy());
  });

  it('on gateway rejection shows text.lk\'s message and stays unverified', async () => {
    getSmsSenderVerification.mockResolvedValue(null);
    verifySmsSender.mockResolvedValue({ ok: false, senderId: 'HoardLavish', message: 'Sender ID is not approved' });

    render(<SenderIdVerifier senderId="HoardLavish" />);
    fireEvent.change(screen.getByTestId('sender-verify-phone'), { target: { value: '0771234567' } });
    fireEvent.click(screen.getByTestId('sender-verify-button'));
    fireEvent.click(screen.getByText('Send test'));

    await waitFor(() => expect(screen.getByTestId('sender-verify-failure')).toBeTruthy());
    expect(screen.getByTestId('sender-verify-failure').textContent).toContain('Sender ID is not approved');
    expect(screen.queryByTestId('sender-status-verified')).toBeNull();
  });

  it('shows a transport / validation error from the store', async () => {
    getSmsSenderVerification.mockResolvedValue(null);
    verifySmsSender.mockResolvedValue({ ok: false, senderId: 'HoardLavish', error: 'No internet connection.' });

    render(<SenderIdVerifier senderId="HoardLavish" />);
    fireEvent.change(screen.getByTestId('sender-verify-phone'), { target: { value: '0771234567' } });
    fireEvent.click(screen.getByTestId('sender-verify-button'));
    fireEvent.click(screen.getByText('Send test'));

    await waitFor(() => expect(screen.getByTestId('sender-verify-failure').textContent).toContain('No internet connection.'));
  });

  it('drops back to "not verified" when the ID is edited to one with no check', async () => {
    getSmsSenderVerification.mockImplementation(async (id: string) => (id === 'HoardLavish' ? VERIFIED : null));
    const { rerender } = render(<SenderIdVerifier senderId="HoardLavish" />);
    await waitFor(() => expect(screen.getByTestId('sender-status-verified')).toBeTruthy());

    rerender(<SenderIdVerifier senderId="HoardLavis" />);
    await waitFor(() => expect(screen.getByTestId('sender-status-unverified')).toBeTruthy());
    expect(screen.queryByTestId('sender-status-verified')).toBeNull();
  });
});
