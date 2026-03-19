/**
 * Daily digest type definitions.
 */
export interface DigestSection {
  title: string;
  emoji: string;
  items: string[];
}

export interface DigestData {
  urgent: string[];
  waiting: string[];
  newContacts: string[];
  meetings: string[];
  capabilities: string[];
  followups: string[];
  calendar: string[];
  recentActivity: string[];
  insights: string[];
}
