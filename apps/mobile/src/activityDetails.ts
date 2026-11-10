export function activityStatusLabel(status: string, type: string) {
  return status === 'failed' ? 'Failed' : status === 'success' ? type === 'bridge' ? 'Source confirmed' : 'Confirmed' : 'Pending';
}
