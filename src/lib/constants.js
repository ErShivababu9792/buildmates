export const SKILLS = [
  'Coding', 'Design', 'Marketing', 'Video editing', 'Sales',
  'Writing', 'Data analysis', 'Public speaking', 'Finance', 'Photography',
];

export const INTERESTS = [
  'EdTech', 'Food', 'Fashion', 'Health', 'Gaming',
  'Environment', 'FinTech', 'Social impact', 'Travel', 'Music',
];

// Colleges, areas, cities and states are NOT listed here: they come from India Post and OpenStreetMap (src/lib/geo.js).

export const ROLES = [
  { id: 'Idea person', text: 'I have an idea and need people to build it' },
  { id: 'Builder', text: 'I have skills and want to join a good idea' },
  { id: 'Both', text: 'I have an idea and can build parts of it' },
];

export const VISIBILITY = [
  { id: 'college', label: 'Only my college' },
  { id: 'area', label: 'My college and people within 5 km' },
  { id: 'city', label: 'Everyone' },
];

export const MAX_PICKS = 4;
export const MIN_AGE = 13;
export const ADULT_AGE = 18;
