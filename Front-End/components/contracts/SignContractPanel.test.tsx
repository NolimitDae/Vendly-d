import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import SignContractPanel from './SignContractPanel';

jest.mock('@/service/contracts/contracts.service', () => ({}));

const DATA_URL = 'data:image/png;base64,iVBORw0KGgo=';

// jsdom has no canvas: a stand-in 2D context, and a fixed PNG from toDataURL
beforeAll(() => {
  const ctx = { scale: jest.fn(), beginPath: jest.fn(), moveTo: jest.fn(), lineTo: jest.fn(), stroke: jest.fn(), clearRect: jest.fn() };
  jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ctx as any);
  jest.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(() => DATA_URL);
});

const setup = (props: Partial<React.ComponentProps<typeof SignContractPanel>> = {}) => {
  const onSubmit = jest.fn();
  render(
    <SignContractPanel
      body="# Agreement"
      contentSha256={'a'.repeat(64)}
      consentText="I agree to sign electronically."
      submitLabel="Sign & send request"
      defaultName="Cara Customer"
      onSubmit={onSubmit}
      {...props}
    />,
  );
  fireEvent.click(screen.getByRole('checkbox', { name: 'I agree to sign electronically.' }));
  return { onSubmit, submit: () => screen.getByRole('button', { name: /Sign & send request/ }) };
};

const draw = () => {
  const pad = screen.getByLabelText('Draw your signature');
  fireEvent.pointerDown(pad, { clientX: 5, clientY: 5 });
  fireEvent.pointerMove(pad, { clientX: 40, clientY: 20 });
  fireEvent.pointerUp(pad);
};

describe('SignContractPanel signature', () => {
  it('keeps the sign button off until a signature is drawn and confirmed', () => {
    const { submit } = setup();
    expect(submit()).toBeDisabled();
    expect(screen.getByText('Draw your signature and tap Confirm signature to sign.')).toBeInTheDocument();
    // nothing drawn yet: no confirm button
    expect(screen.queryByRole('button', { name: 'Confirm signature' })).not.toBeInTheDocument();

    draw();
    // drawn but not confirmed: still off
    expect(submit()).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm signature' }));
    expect(submit()).toBeEnabled();
  });

  it('shows the confirmed signature in the box and sends it', () => {
    const { onSubmit, submit } = setup();
    draw();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm signature' }));
    expect(screen.getByRole('img', { name: 'Your signature' })).toHaveAttribute('src', DATA_URL);
    expect(screen.queryByLabelText('Draw your signature')).not.toBeInTheDocument();

    fireEvent.click(submit());
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ legal_name: 'Cara Customer', signature_image: DATA_URL }));
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('use_saved_signature');
  });

  it('Redo goes back to an empty pad and turns the button off again', () => {
    const { submit } = setup();
    draw();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm signature' }));
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(screen.getByLabelText('Draw your signature')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Your signature' })).not.toBeInTheDocument();
    expect(submit()).toBeDisabled();
  });

  it('Clear empties the pad before confirming', () => {
    setup();
    draw();
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.queryByRole('button', { name: 'Confirm signature' })).not.toBeInTheDocument();
  });

  it("lets a vendor sign with their saved signature, and requires drawing when they don't use it", () => {
    const { onSubmit, submit } = setup({ vendor: { hasSavedSignature: true } });
    expect(submit()).toBeEnabled();
    fireEvent.click(submit());
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ use_saved_signature: true }));
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('signature_image');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Use my saved signature' }));
    expect(submit()).toBeDisabled();
  });
});
