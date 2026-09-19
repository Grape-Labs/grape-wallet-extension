/** Decode both legacy yes/no records and current SPL Governance ballots. */
export function describeGovernanceVote(record: {
  vote?: { voteType: number; approveChoices?: { rank: number; weightPercentage: number }[] };
  voteWeight?: { yes: { toString(): string }; no: { toString(): string } };
}, options: { label: string }[]): string {
  if (record.vote) {
    switch (record.vote.voteType) {
      case 0: {
        // Choices are indexed by proposal option; rank is preference, not option index.
        const choices = (record.vote.approveChoices ?? []).flatMap((choice, index) =>
          choice.weightPercentage > 0
            ? [`${options[index]?.label ?? `Option ${index + 1}`}${choice.weightPercentage < 100 ? ` (${choice.weightPercentage}%)` : ''}`]
            : []);
        return choices.length ? choices.join(', ') : 'Approve';
      }
      case 1: return 'Deny';
      case 2: return 'Abstain';
      case 3: return 'Veto';
      default: return 'Recorded (choice unavailable)';
    }
  }
  if (record.voteWeight) {
    if (BigInt(record.voteWeight.yes.toString()) > 0n) return 'Yes';
    if (BigInt(record.voteWeight.no.toString()) > 0n) return 'No';
  }
  return 'Recorded (choice unavailable)';
}
