/**
 * Canonical list of immigration program categories and their specific program names.
 * Used for registration program selection and admin fee assignment.
 */

const IMMIGRATION_PROGRAMS = [
  {
    category: 'Express Entry',
    programs: [
      'Federal Skilled Worker Program (FSWP)',
      'Federal Skilled Trades Program (FSTP)',
      'Canadian Experience Class (CEC)'
    ]
  },
  {
    category: 'Provincial Nominee Program',
    programs: ['Provincial Nominee Program (PNP)']
  },
  {
    category: 'Student & Work Pathways',
    programs: ['Study Permit', 'Temporary Foreign Worker Program (TFWP)']
  },
  {
    category: 'Family Sponsorship',
    programs: ['Family Sponsorship']
  },
  {
    category: 'Start-Up Visa',
    programs: ['Start-Up Visa Program']
  },
  {
    category: 'Refugee Sponsorship',
    programs: ['Group of Five (G5)', 'Sponsorship Agreement Holders (SAHs)']
  },
  {
    category: 'Tourist Visa',
    programs: ['Tourist Visa (Visitor Visa)']
  },
  {
    category: 'Francophone Mobility',
    programs: ['Francophone Mobility Program']
  },
  {
    category: 'Specialized Regional Pilots',
    programs: ['Atlantic Immigration Program (AIP)', 'Rural Community Immigration Pilot (RCIP)']
  },
  {
    category: 'Caregiver Pilot',
    programs: ['Caregiver Pilot Program']
  },
  {
    category: 'Humanitarian and Compassionate Grounds',
    programs: ['Humanitarian and Compassionate Grounds']
  }
];

const PROGRAM_CATEGORIES = IMMIGRATION_PROGRAMS.map((p) => p.category);

const ALL_PROGRAM_NAMES = IMMIGRATION_PROGRAMS.flatMap((p) => p.programs);

module.exports = { IMMIGRATION_PROGRAMS, PROGRAM_CATEGORIES, ALL_PROGRAM_NAMES };
