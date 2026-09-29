// Closed option lists used across the app. Hobbies and languages can be
// extended by users ("Other…"); policy interests, colleges and countries are
// curated here and only changed by the admin (edit this file).

export const LEVELS = [
  { value: 0, label: "Haven't met", short: 'Not met', emoji: '○' },
  { value: 1, label: 'Said hello', short: 'Hello', emoji: '👋' },
  { value: 2, label: 'First conversation', short: 'Chatted', emoji: '💬' },
  { value: 3, label: 'Great conversation', short: 'Great chat', emoji: '✨' },
  { value: 4, label: 'Friends', short: 'Friends', emoji: '💙' },
] as const

export type Level = 0 | 1 | 2 | 3 | 4

export const FAMILY_OPTIONS = [
  { value: 'none', label: 'Coming solo' },
  { value: 'partner', label: 'With partner' },
  { value: 'family', label: 'With family' },
  { value: 'partner_family', label: 'With partner & family' },
] as const

export type FamilyStatus = (typeof FAMILY_OPTIONS)[number]['value']

export const COLLEGES = [
  'All Souls', 'Balliol', 'Blackfriars', 'Brasenose', 'Campion Hall', 'Christ Church',
  'Corpus Christi', 'Exeter', 'Green Templeton', 'Harris Manchester', 'Hertford',
  "Jesus", 'Keble', 'Kellogg', 'Lady Margaret Hall', 'Linacre', 'Lincoln', 'Magdalen',
  'Mansfield', 'Merton', 'New College', 'Nuffield', 'Oriel', 'Pembroke', "Queen's",
  'Regent\'s Park', 'Reuben', 'Somerville', "St Anne's", "St Antony's", 'St Catherine\'s',
  'St Cross', 'St Edmund Hall', "St Hilda's", "St Hugh's", "St John's", "St Peter's",
  'Trinity', 'University', 'Wadham', 'Wolfson', 'Worcester', 'Wycliffe Hall',
] as const

export const POLICY_INTERESTS = [
  'AI & Tech Governance',
  'Digital Government',
  'Cybersecurity',
  'Climate & Environment',
  'Energy',
  'Sustainability',
  'Economic Policy',
  'Economic Development',
  'Finance & Financial Regulation',
  'Trade & Investment',
  'Industrial Policy & Innovation',
  'Entrepreneurship',
  'Public Financial Management',
  'Health',
  'Education',
  'Social Policy & Protection',
  'Housing & Homelessness',
  'Labour & Employment',
  'Urban Policy & Transport',
  'Agriculture & Food',
  'Gender Equality',
  'Children & Youth',
  'Indigenous Peoples',
  'Human Rights',
  'Migration & Refugees',
  'Justice & Rule of Law',
  'Public Security & Crime',
  'Defence & National Security',
  'Foreign Policy & Diplomacy',
  'Multilateral Governance',
  'International Development',
  'Humanitarian Affairs',
  'Governance & Institutions',
  'Public Sector Management',
  'Anti-corruption',
  'Democracy & Elections',
  'Regulation & Competition',
  'Media & Communications',
  'Behavioural Science & Evaluation',
] as const

export const HOBBY_GROUPS: { group: string; items: string[] }[] = [
  {
    group: 'Sports',
    items: [
      'Football', 'Basketball', 'Tennis', 'Padel', 'Badminton', 'Squash', 'Table tennis',
      'Cricket', 'Rugby', 'Rowing', 'Cycling', 'Running', 'Swimming', 'Martial arts',
      'Climbing / Bouldering', 'Ultimate frisbee', 'Golf', 'Volleyball', 'Watching sports', 'F1',
    ],
  },
  {
    group: 'Fitness & wellbeing',
    items: ['Gym', 'Yoga', 'Pilates', 'Dancing', 'Meditation'],
  },
  {
    group: 'Outdoors',
    items: ['Hiking', 'Travel', 'Sailing', 'Kayaking', 'Surfing', 'Scuba diving', 'Gardening'],
  },
  {
    group: 'Food & drink',
    items: ['Cooking', 'Baking', 'Coffee', 'Tea', 'Restaurants & cafés', 'Wine', 'Pubs & bars'],
  },
  {
    group: 'Arts & culture',
    items: [
      'Music', 'Concerts & live music', 'Singing', 'Painting & drawing', 'Photography',
      'Film & cinema', 'Theatre & musicals', 'Museums', 'Ceramics & crafts', 'Writing', 'Fashion',
    ],
  },
  {
    group: 'Games & mind',
    items: [
      'Reading', 'Board games', 'Card games', 'Video games', 'Trivia & quizzes', 'Chess',
      'Debating', 'Philosophy', 'Learning languages', 'Podcasts',
    ],
  },
  {
    group: 'Social',
    items: ['Nightlife', 'Hanging out', 'Volunteering', 'Faith & spirituality'],
  },
]

export const HOBBIES = HOBBY_GROUPS.flatMap((g) => g.items)

export const LANGUAGES = [
  'English', 'Spanish', 'French', 'Portuguese', 'German', 'Italian', 'Dutch', 'Russian',
  'Ukrainian', 'Polish', 'Greek', 'Turkish', 'Azerbaijani', 'Arabic', 'Hebrew', 'Persian',
  'Urdu', 'Hindi', 'Bengali', 'Punjabi', 'Tamil', 'Telugu', 'Marathi', 'Gujarati', 'Kannada',
  'Malayalam', 'Sinhala', 'Nepali', 'Mandarin', 'Cantonese', 'Japanese', 'Korean', 'Thai',
  'Vietnamese', 'Indonesian', 'Malay', 'Tagalog / Filipino', 'Mongolian', 'Kazakh', 'Swahili',
  'Amharic', 'Yoruba', 'Igbo', 'Hausa', 'Zulu', 'Xhosa', 'Afrikaans', 'Shona', 'Twi',
  'Irish', 'Welsh', 'Catalan', 'Swedish', 'Norwegian', 'Danish', 'Finnish',
] as const

export const CONTINENTS = [
  'Africa', 'Asia', 'Europe', 'Latin America & Caribbean', 'North America', 'Oceania',
] as const
export type Continent = (typeof CONTINENTS)[number]

const AF = 'Africa', AS = 'Asia', EU = 'Europe', LA = 'Latin America & Caribbean',
  NA = 'North America', OC = 'Oceania'

// Country → continent. "Latin America & Caribbean" is split from North America
// because it is a meaningful group for this cohort.
export const COUNTRY_CONTINENT: Record<string, Continent> = {
  Afghanistan: AS, Albania: EU, Algeria: AF, Andorra: EU, Angola: AF, 'Antigua and Barbuda': LA,
  Argentina: LA, Armenia: AS, Australia: OC, Austria: EU, Azerbaijan: AS, Bahamas: LA,
  Bahrain: AS, Bangladesh: AS, Barbados: LA, Belarus: EU, Belgium: EU, Belize: LA, Benin: AF,
  Bhutan: AS, Bolivia: LA, 'Bosnia and Herzegovina': EU, Botswana: AF, Brazil: LA, Brunei: AS,
  Bulgaria: EU, 'Burkina Faso': AF, Burundi: AF, Cambodia: AS, Cameroon: AF, Canada: NA,
  'Cape Verde': AF, 'Central African Republic': AF, Chad: AF, Chile: LA, China: AS, Colombia: LA,
  Comoros: AF, Congo: AF, 'Costa Rica': LA, "Côte d'Ivoire": AF, Croatia: EU, Cuba: LA,
  Cyprus: EU, 'Czech Republic': EU, 'DR Congo': AF, Denmark: EU, Djibouti: AF, Dominica: LA,
  'Dominican Republic': LA, Ecuador: LA, Egypt: AF, 'El Salvador': LA, 'Equatorial Guinea': AF,
  Eritrea: AF, Estonia: EU, Eswatini: AF, Ethiopia: AF, Fiji: OC, Finland: EU, France: EU,
  Gabon: AF, Gambia: AF, Georgia: AS, Germany: EU, Ghana: AF, Greece: EU, Grenada: LA,
  Guatemala: LA, Guinea: AF, 'Guinea-Bissau': AF, Guyana: LA, Haiti: LA, Honduras: LA,
  'Hong Kong': AS, Hungary: EU, Iceland: EU, India: AS, Indonesia: AS, Iran: AS, Iraq: AS,
  Ireland: EU, Israel: AS, Italy: EU, Jamaica: LA, Japan: AS, Jordan: AS, Kazakhstan: AS,
  Kenya: AF, Kiribati: OC, Kosovo: EU, Kuwait: AS, Kyrgyzstan: AS, Laos: AS, Latvia: EU,
  Lebanon: AS, Lesotho: AF, Liberia: AF, Libya: AF, Liechtenstein: EU, Lithuania: EU,
  Luxembourg: EU, Madagascar: AF, Malawi: AF, Malaysia: AS, Maldives: AS, Mali: AF, Malta: EU,
  'Marshall Islands': OC, Mauritania: AF, Mauritius: AF, Mexico: LA, Micronesia: OC,
  Moldova: EU, Monaco: EU, Mongolia: AS, Montenegro: EU, Morocco: AF, Mozambique: AF,
  Myanmar: AS, Namibia: AF, Nauru: OC, Nepal: AS, Netherlands: EU, 'New Zealand': OC,
  Nicaragua: LA, Niger: AF, Nigeria: AF, 'North Korea': AS, 'North Macedonia': EU, Norway: EU,
  Oman: AS, Pakistan: AS, Palau: OC, Palestine: AS, Panama: LA, 'Papua New Guinea': OC,
  Paraguay: LA, Peru: LA, Philippines: AS, Poland: EU, Portugal: EU, 'Puerto Rico': LA,
  Qatar: AS, Romania: EU, Russia: EU, Rwanda: AF, 'Saint Kitts and Nevis': LA,
  'Saint Lucia': LA, 'Saint Vincent and the Grenadines': LA, Samoa: OC, 'San Marino': EU,
  'São Tomé and Príncipe': AF, 'Saudi Arabia': AS, Senegal: AF, Serbia: EU, Seychelles: AF,
  'Sierra Leone': AF, Singapore: AS, Slovakia: EU, Slovenia: EU, 'Solomon Islands': OC,
  Somalia: AF, 'South Africa': AF, 'South Korea': AS, 'South Sudan': AF, Spain: EU,
  'Sri Lanka': AS, Sudan: AF, Suriname: LA, Sweden: EU, Switzerland: EU, Syria: AS,
  Taiwan: AS, Tajikistan: AS, Tanzania: AF, Thailand: AS, 'Timor-Leste': AS, Togo: AF,
  Tonga: OC, 'Trinidad and Tobago': LA, Tunisia: AF, Turkey: AS, Turkmenistan: AS, Tuvalu: OC,
  Uganda: AF, Ukraine: EU, 'United Arab Emirates': AS, 'United Kingdom': EU,
  'United States': NA, Uruguay: LA, Uzbekistan: AS, Vanuatu: OC, Venezuela: LA, Vietnam: AS,
  Yemen: AS, Zambia: AF, Zimbabwe: AF,
}

export const COUNTRIES = Object.keys(COUNTRY_CONTINENT).sort((a, b) => a.localeCompare(b))

export function continentOf(country: string | null | undefined): Continent | null {
  return country ? (COUNTRY_CONTINENT[country] ?? null) : null
}
