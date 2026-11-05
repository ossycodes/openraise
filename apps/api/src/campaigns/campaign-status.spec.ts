import { nextStatus } from './campaign-status.js';

describe('campaign lifecycle', () => {
  it('follows the happy path', () => {
    expect(nextStatus('DRAFT', 'submit')).toBe('PENDING_REVIEW');
    expect(nextStatus('PENDING_REVIEW', 'approve')).toBe('ACTIVE');
    expect(nextStatus('ACTIVE', 'pause')).toBe('PAUSED');
    expect(nextStatus('PAUSED', 'resume')).toBe('ACTIVE');
    expect(nextStatus('ACTIVE', 'end')).toBe('ENDED');
  });

  it('lets a rejected campaign be resubmitted', () => {
    expect(nextStatus('PENDING_REVIEW', 'reject')).toBe('REJECTED');
    expect(nextStatus('REJECTED', 'submit')).toBe('PENDING_REVIEW');
  });

  it('can end a paused campaign', () => {
    expect(nextStatus('PAUSED', 'end')).toBe('ENDED');
  });

  it('refuses everything else', () => {
    expect(nextStatus('DRAFT', 'approve')).toBeNull();
    expect(nextStatus('ACTIVE', 'submit')).toBeNull();
    expect(nextStatus('ENDED', 'resume')).toBeNull();
    expect(nextStatus('ENDED', 'submit')).toBeNull();
    expect(nextStatus('PENDING_REVIEW', 'pause')).toBeNull();
    expect(nextStatus('REJECTED', 'approve')).toBeNull();
  });
});
