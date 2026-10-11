// Name lists for generated (fictional) people and places.

export const SURNAMES = [
  'Schmidt', 'Mueller', 'Meyer', 'Wagner', 'Becker', 'Hoffman', 'Schroeder', 'Koch', 'Bauer', 'Richter',
  'Klein', 'Wolf', 'Neumann', 'Schwarz', 'Zimmerman', 'Braun', 'Krueger', 'Hartmann', 'Lange', 'Werner',
  'Krause', 'Lehman', 'Stoltzfus', 'Yoder', 'Miller', 'Hochstetler', 'Brenneman', 'Ackerman', 'Ebert', 'Fritz',
  'Gerdes', 'Heinz', 'Janssen', 'Kuhlman', 'Luebbers', 'Moeller', 'Niemeyer', 'Oberle', 'Pfeiffer', 'Rademacher',
  'Steinke', 'Tietz', 'Vogel', 'Wendt', 'Ziegler', 'Johnson', 'Anderson', 'Peterson', 'Larson', 'Olson',
  'Nelson', 'Swanson', 'Carlson', 'Lindquist', 'Nygaard', 'Halvorson', 'Thompson', 'Smith', 'Brown', 'Davis',
  'Wilson', 'Taylor', 'Moore', 'White', 'Harris', 'Martin', 'Clark', 'Lewis', 'Walker', 'Hall',
  'Allen', 'Young', 'King', 'Wright', 'Scott', 'Green', 'Baker', 'Adams', 'Nichols', 'Campbell',
  'Mitchell', 'Roberts', 'Carter', 'Phillips', 'Evans', 'Turner', 'Parker', 'Collins', 'Edwards', 'Stewart',
  'Morris', 'Murphy', 'Cook', 'Rogers', 'Morgan', 'Cooper', 'Reed', 'Bailey', 'Bell', 'Kelly',
  'Howard', 'Ward', 'Cox', 'Richardson', 'Wood', 'Watson', 'Brooks', 'Bennett', 'Gray', 'Hughes',
  'Price', 'Sanders', 'Myers', 'Long', 'Ross', 'Foster', 'Powell', 'Jenkins', 'Perry', 'Russell',
  'Sullivan', 'Fisher', 'Henderson', 'Coleman', 'Patterson', 'Jordan', 'Reynolds', 'Hamilton', 'Graham', 'Wallace',
  'O\'Brien', 'Kennedy', 'Ryan', 'Gallagher', 'Doyle', 'Flanagan', 'McCarthy', 'Dunn', 'Brennan', 'Hogan',
  'VanderMeer', 'DeVries', 'Bakker', 'Hoekstra', 'Vermeulen', 'Kuiper', 'Stauffer', 'Hershberger', 'Kauffman', 'Shoemaker',
  'Dietrich', 'Engel', 'Frey', 'Gruber', 'Haas', 'Imhoff', 'Jaeger', 'Kessler', 'Lutz', 'Maurer',
  'Nagel', 'Ott', 'Probst', 'Reinhardt', 'Sauer', 'Thiel', 'Ulrich', 'Vetter', 'Weiss', 'Zeller',
  'Garrison', 'Harmon', 'Ingram', 'Kimball', 'Lockhart', 'Mercer', 'Norris', 'Osborne', 'Pruitt', 'Quinn',
  'Rhodes', 'Sheridan', 'Tucker', 'Underwood', 'Vance', 'Whitaker', 'Yates', 'Boone', 'Chapman', 'Dalton',
  'Garcia', 'Hernandez', 'Lopez', 'Martinez', 'Gonzalez', 'Ramirez', 'Novak', 'Kowalski', 'Dvorak', 'Horak',
];

/** Given names by birth decade (approximate U.S. rural popularity). */
export const GIVEN_NAMES: { decade: number; male: string[]; female: string[] }[] = [
  {
    decade: 1890,
    male: ['John', 'William', 'George', 'Charles', 'Frank', 'Joseph', 'Henry', 'Fred', 'Albert', 'Herman', 'Otto', 'August', 'Walter', 'Louis', 'Carl'],
    female: ['Mary', 'Anna', 'Emma', 'Elizabeth', 'Minnie', 'Margaret', 'Ida', 'Bertha', 'Clara', 'Alice'],
  },
  {
    decade: 1910,
    male: ['John', 'William', 'Robert', 'James', 'George', 'Charles', 'Harold', 'Raymond', 'Walter', 'Elmer', 'Clarence', 'Herbert', 'Lloyd', 'Arthur', 'Floyd', 'Leonard', 'Ralph', 'Vernon'],
    female: ['Mary', 'Helen', 'Dorothy', 'Margaret', 'Ruth', 'Mildred', 'Frances', 'Evelyn', 'Alice', 'Florence', 'Marie', 'Lucille'],
  },
  {
    decade: 1930,
    male: ['Robert', 'James', 'John', 'William', 'Richard', 'Donald', 'Charles', 'Kenneth', 'Gerald', 'Dale', 'Harold', 'Eugene', 'Wayne', 'Duane', 'Leroy', 'Marvin', 'Delbert', 'Merle', 'Lyle', 'Darrell'],
    female: ['Mary', 'Betty', 'Dorothy', 'Shirley', 'Barbara', 'Joan', 'Patricia', 'Doris', 'Marilyn', 'Phyllis', 'Joyce', 'Norma'],
  },
  {
    decade: 1950,
    male: ['Michael', 'David', 'James', 'Robert', 'John', 'Steven', 'Mark', 'Gary', 'Larry', 'Dennis', 'Randy', 'Terry', 'Ronald', 'Daniel', 'Roger', 'Douglas', 'Kevin', 'Keith', 'Bruce', 'Dwight'],
    female: ['Mary', 'Linda', 'Susan', 'Debra', 'Karen', 'Patricia', 'Nancy', 'Cynthia', 'Sandra', 'Brenda', 'Diane', 'Janet'],
  },
  {
    decade: 1970,
    male: ['Michael', 'Jason', 'Christopher', 'Brian', 'Matthew', 'Jeffrey', 'Scott', 'Todd', 'Chad', 'Eric', 'Travis', 'Ryan', 'Jeremy', 'Shawn', 'Brent', 'Nathan', 'Troy', 'Jared'],
    female: ['Jennifer', 'Amy', 'Melissa', 'Heather', 'Angela', 'Michelle', 'Sarah', 'Lisa', 'Kimberly', 'Stephanie', 'Rebecca', 'Kelly'],
  },
  {
    decade: 1990,
    male: ['Tyler', 'Kyle', 'Austin', 'Cody', 'Dustin', 'Zachary', 'Brandon', 'Jacob', 'Logan', 'Lucas', 'Garrett', 'Tanner', 'Colton', 'Dylan', 'Hunter', 'Wyatt', 'Blake', 'Cole'],
    female: ['Ashley', 'Jessica', 'Emily', 'Megan', 'Brittany', 'Lauren', 'Kayla', 'Rachel', 'Hannah', 'Morgan', 'Taylor', 'Courtney'],
  },
  {
    decade: 2010,
    male: ['Carson', 'Brody', 'Easton', 'Bentley', 'Maverick', 'Ryder', 'Grayson', 'Jaxon', 'Lincoln', 'Colt', 'Beau', 'Hudson'],
    female: ['Emma', 'Olivia', 'Ava', 'Harper', 'Avery', 'Brooklyn', 'Paisley', 'Kinsley', 'Addison', 'Claire'],
  },
];

/** Share of principal operators who are women, by year (approximate). */
export const FEMALE_OPERATOR_SHARE = [
  { year: 1970, value: 0.04 },
  { year: 1990, value: 0.07 },
  { year: 2010, value: 0.1 },
  { year: 2020, value: 0.14 },
];

export const TOWN_PREFIXES = [
  'Prairie', 'Oak', 'Elm', 'Cedar', 'Maple', 'Willow', 'Ash', 'Walnut', 'Hickory', 'Linden', 'Spring', 'Clear',
  'Fair', 'Green', 'Pleasant', 'Pine', 'Rock', 'Sand', 'Stone', 'Mill', 'Bridge', 'Brook', 'Glen', 'Mound',
  'North', 'South', 'East', 'West', 'New', 'Union', 'Liberty', 'Harmony', 'Concord', 'Eden', 'Olive', 'Bloom',
  'Elk', 'Fox', 'Deer', 'Hawk', 'Crane', 'Plum', 'Apple', 'Clover', 'Wheat', 'Grove', 'Lone', 'Twin',
];
export const TOWN_SUFFIXES = [
  'ville', 'ton', 'field', 'dale', 'wood', 'land', 'burg', 'port', 'ford', ' Center', ' City', ' Grove', ' Junction',
  ' Prairie', ' Hill', ' Springs', ' Creek', ' Point', ' Corners', 'view', 'ridge', 'mont',
];
/** Founders' surnames used for towns like "Haskinsville". Kept separate from member surnames. */
export const TOWN_FOUNDERS = [
  'Haskins', 'Pell', 'Garret', 'Thorn', 'Ashby', 'Colfax', 'Danvers', 'Ellery', 'Farrow', 'Gilman', 'Hollis', 'Ivers',
  'Jasper', 'Kirby', 'Lowell', 'Marlow', 'Nash', 'Orrin', 'Pruett', 'Radley', 'Sutter', 'Tolliver', 'Upton', 'Varner',
  'Whitcomb', 'Yardley', 'Bramwell', 'Cottrell', 'Dunmore', 'Everly',
];
export const COUNTY_NAMES = [
  'Harlan', 'Tillman', 'Breckett', 'Calloway', 'Dorsey', 'Emmerson', 'Fairbanks', 'Gaither', 'Hollister', 'Iverson',
  'Kendrick', 'Langford', 'Merriweather', 'Northam', 'Ogden', 'Pembroke', 'Quarles', 'Rutledge', 'Stanton', 'Thayer',
  'Wakefield', 'Whitley', 'Ashland', 'Big Prairie', 'Sauk Ridge', 'Kaskaskia Bend', 'Two Rivers', 'Wabash Hill',
];

/** Period-style co-op name patterns. {town}, {county} are substituted. */
export const COOP_NAME_PATTERNS = [
  { pattern: '{town} Farmers Cooperative Association', from: 1900, to: 2100 },
  { pattern: '{county} County Farmers Elevator Company', from: 1900, to: 2000 },
  { pattern: '{town} Equity Exchange', from: 1900, to: 1995 },
  { pattern: '{county} County Farm Bureau Co-op', from: 1920, to: 2010 },
  { pattern: '{town} Grain Company', from: 1900, to: 2100 },
  { pattern: '{county} Service Company', from: 1930, to: 2100 },
  { pattern: '{town} Farmers Co-op', from: 1900, to: 2100 },
  { pattern: '{county} Ag Cooperative', from: 1985, to: 2100 },
  { pattern: '{county} Agri-Services Cooperative', from: 1990, to: 2100 },
  { pattern: '{town} Cooperative Supply', from: 1920, to: 2100 },
];

export const BANK_NAME_PATTERNS = ['First National Bank of {town}', '{county} County State Bank', 'Farmers & Merchants Bank of {town}', '{town} Savings Bank', 'Citizens Bank of {county} County'];
