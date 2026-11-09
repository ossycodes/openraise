/**
 * Copy for the "Raise money for …" landing pages, one per seeded category.
 * Written for this project; keep it plain, honest and specific. A category an
 * administrator adds later still gets a page built from its name and
 * description (see `categoryPage`).
 */
export interface CategoryPage {
  /** Finishes "Raise money for …" in the heading and page title */
  phrase: string;
  /** Two short paragraphs under the heading */
  intro: [string, string];
  /** What people in this category commonly raise for */
  examples: string[];
  /** Advice specific to this kind of fundraiser */
  tips: string[];
}

const pages: Record<string, CategoryPage> = {
  medical: {
    phrase: 'medical bills',
    intro: [
      'When someone needs surgery, a long course of treatment or medicine that insurance doesn’t cover, the bill can arrive faster than any family can save. A campaign lets the people who care about them share the cost.',
      'Donors see every fee before they pay, and the money raised goes to a wallet only the organiser can withdraw from, to a bank account in their verified name.',
    ],
    examples: [
      'Surgery and hospital admission',
      'Cancer, kidney and other ongoing treatment',
      'Medicine, tests and specialist visits',
      'Getting a patient to a hospital that can treat them',
    ],
    tips: [
      'Say what the money pays for and roughly what each part costs. An estimate from the hospital helps people trust the goal.',
      'Post an update after each appointment or payment. Supporters keep sharing when they can see progress.',
      'If you’re raising for someone else, say how you know them and that they agree to the campaign.',
    ],
  },
  education: {
    phrase: 'school fees',
    intro: [
      'A term’s fees, an exam registration or a set of textbooks can decide whether a student stays in school. A campaign turns a single large bill into many small gifts from people who believe in them.',
      'Share the campaign with classmates, alumni groups, teachers and family, and show them what each amount makes possible.',
    ],
    examples: [
      'School and university fees',
      'WAEC, JAMB and other exam fees',
      'Books, laptops and uniforms',
      'Scholarships for a group of students',
    ],
    tips: [
      'Name the school and the term or year the money covers, so supporters know when the goal matters.',
      'A short note from the student in their own words is often the most shared part of the page.',
      'After the deadline, post results or a photo from class. It thanks donors and shows the money did its job.',
    ],
  },
  emergencies: {
    phrase: 'emergencies',
    intro: [
      'Fires, floods and accidents don’t wait for anyone to be ready. A campaign gives neighbours, colleagues and family abroad one trusted place to help, quickly.',
      'Start with what is needed first, and add updates as the situation becomes clearer.',
    ],
    examples: [
      'Rebuilding after a fire or flood',
      'Hospital costs after an accident',
      'Temporary shelter, food and clothing',
      'Replacing tools or stock lost in a disaster',
    ],
    tips: [
      'Be specific about the most urgent need and how much it costs; you can raise the goal later.',
      'Photos of the damage help, but leave out anything that would embarrass the people affected.',
      'Share in the WhatsApp groups closest to the people affected first. That is where help usually starts.',
    ],
  },
  community: {
    phrase: 'community projects',
    intro: [
      'A borehole, a classroom roof, a repaired road or a renovated hall serves everyone who lives nearby. A campaign lets the whole community, including people who have moved away, put something in.',
      'Projects with a clear plan, a budget and someone accountable for spending raise the most.',
    ],
    examples: [
      'Boreholes and clean water',
      'Classroom, clinic and hall repairs',
      'Street lights, drainage and roads',
      'Equipment for a community centre',
    ],
    tips: [
      'Say who is running the project and who will check the work.',
      'Break the budget into stages, and post an update with photos as each stage is finished.',
      'Print the poster and put it up where people meet: places of worship, markets and the town hall.',
    ],
  },
  funerals: {
    phrase: 'funeral costs',
    intro: [
      'Burial and memorial costs often fall on a family at the hardest moment. A campaign lets friends and relatives near and far share the cost and send their condolences in one place.',
      'Donors can leave a message for the family, and give anonymously if they prefer.',
    ],
    examples: [
      'Burial and funeral service costs',
      'Transporting the body home',
      'Support for the family left behind',
      'A memorial or scholarship in their name',
    ],
    tips: [
      'Share a few words about the person. People give to honour someone they remember.',
      'Say clearly who will receive the money and what it covers.',
      'Post an update after the service to thank everyone who helped.',
    ],
  },
  family: {
    phrase: 'a family in need',
    intro: [
      'Sometimes a family just needs help to get through: rent after a job loss, food for a few months, or care for a relative. A campaign lets the people around them help without anyone having to ask one by one.',
      'Be honest about the situation and what would make the biggest difference.',
    ],
    examples: [
      'Rent and essential bills',
      'Food and household costs',
      'Caring for an elderly or sick relative',
      'Getting back on their feet after a setback',
    ],
    tips: [
      'Explain what happened and what the money covers, for how long.',
      'If the family is not running the campaign, say how you know them and that they agree.',
      'Updates matter here too. Let supporters know how things are going.',
    ],
  },
  business: {
    phrase: 'a small business',
    intro: [
      'A stall rebuilt after a fire, a sewing machine, an oven, or the stock to reopen a shop can restart someone’s income. Customers and neighbours who rely on the business are often glad to help.',
      'Show the plan: what you need, what it will let you do, and how you will keep going.',
    ],
    examples: [
      'Replacing equipment or stock',
      'Rebuilding after a fire or flood',
      'Tools to start a trade',
      'A first shop, stall or vehicle',
    ],
    tips: [
      'List the items you need with their prices.',
      'Customers are your best audience. Share the campaign where they already find you.',
      'Post a photo when the business reopens. It is the best thank-you you can give.',
    ],
  },
  creative: {
    phrase: 'creative work',
    intro: [
      'Films, albums, books, exhibitions and theatre need money before they reach an audience. A campaign lets the people who want to see the work help make it.',
      'Share what you are making, how far along it is, and what the money pays for.',
    ],
    examples: [
      'Recording an album or EP',
      'Shooting a short film or documentary',
      'Printing a book',
      'Staging an exhibition or performance',
    ],
    tips: [
      'A short clip, a sample chapter or a sketch shows people what they are backing.',
      'Thank supporters by name (if they agree) in the credits or the programme.',
      'Post behind-the-scenes updates. They keep your audience with you until launch day.',
    ],
  },
  environment: {
    phrase: 'environmental projects',
    intro: [
      'Clean-ups, tree planting and protecting a river or a forest benefit everyone, but someone has to pay for the tools, transport and seedlings. A campaign spreads that cost.',
      'Show the place you are working on and what will change.',
    ],
    examples: [
      'Beach, river and street clean-ups',
      'Tree planting and gardens',
      'Waste collection and recycling',
      'Protecting a local habitat',
    ],
    tips: [
      'Before-and-after photos are the clearest proof of impact.',
      'Invite supporters to the event itself, not only to give.',
      'Say who will look after the project once the campaign ends.',
    ],
  },
  animals: {
    phrase: 'animal care',
    intro: [
      'Vet bills, shelter costs and food for rescued animals add up quickly. A campaign lets animal lovers help a single animal or a whole shelter.',
      'Say what the animal or shelter needs and what each amount covers.',
    ],
    examples: [
      'Vet treatment and surgery',
      'Shelter food and running costs',
      'Rescue and rehoming',
      'Vaccination and care drives',
    ],
    tips: [
      'Share a vet’s estimate where you can.',
      'Updates on the animal’s recovery are some of the most shared posts there are.',
      'Name the shelter or vet you work with, so supporters can check.',
    ],
  },
  sports: {
    phrase: 'sports teams and athletes',
    intro: [
      'Kits, travel to tournaments, coaching and equipment are often what stand between a talented player and the next level. A campaign lets the team’s supporters help.',
      'Tell people about the team or athlete, the competition ahead and what the money covers.',
    ],
    examples: [
      'Kits and equipment',
      'Travel and entry fees for tournaments',
      'Coaching and training camps',
      'A local pitch or court',
    ],
    tips: [
      'Share fixtures and results as updates.',
      'Ask players’ families, schools and local businesses to share the page.',
      'Thank supporters after the competition, win or lose.',
    ],
  },
  travel: {
    phrase: 'travel that matters',
    intro: [
      'Sometimes the most important help is getting someone where they need to be: to a hospital, a family member, a school abroad or a competition. A campaign can cover the ticket and the costs around it.',
      'Explain the journey and why it matters.',
    ],
    examples: [
      'Travel for medical treatment',
      'Reaching family in a crisis',
      'Getting to a place to study',
      'Representing a team or community abroad',
    ],
    tips: [
      'List the costs: tickets, visa, accommodation, and anything else.',
      'Say what happens if the trip changes, so supporters know their money is safe.',
      'Post an update when they arrive.',
    ],
  },
  newlyweds: {
    phrase: 'newlyweds',
    intro: [
      'A wedding and a new home are big costs for a young couple. A campaign lets friends and family give towards something lasting instead of another gift.',
      'Say what the couple are saving for and how guests can help.',
    ],
    examples: [
      'Wedding costs',
      'Rent and furniture for a first home',
      'Starting a business together',
      'A honeymoon or travel to family',
    ],
    tips: [
      'Share the page with the invitation or the wedding group.',
      'Guests can leave messages for the couple with their gift.',
      'Post a photo from the day as a thank-you.',
    ],
  },
  other: {
    phrase: 'any good cause',
    intro: [
      'Not every need fits a category. If people you know want to help with something that matters, a campaign gives them a clear, trusted way to do it.',
      'Donors see every fee before they pay, and the money raised goes to a wallet only the organiser can withdraw from, to a bank account in their verified name.',
    ],
    examples: [
      'A one-off cost that would change someone’s situation',
      'A group project that doesn’t fit elsewhere',
      'Helping someone through a hard season',
    ],
    tips: [
      'Be especially clear about what the money is for, since there is no category to explain it.',
      'Say who is responsible for the money and how you will show what it did.',
      'Post updates as things move forward. Supporters keep sharing when they can see progress.',
    ],
  },
  volunteer: {
    phrase: 'volunteer projects',
    intro: [
      'Volunteers give their time, but outreach still costs money: transport, materials, food and venues. A campaign lets people who can’t volunteer support the people who do.',
      'Say what the project does, who it serves, and what the budget covers.',
    ],
    examples: [
      'Medical and health outreach',
      'Teaching and tutoring programmes',
      'Food drives and feeding programmes',
      'Visits to orphanages and care homes',
    ],
    tips: [
      'Introduce the volunteers. People give to people.',
      'Share how many people the project reached after each event.',
      'Invite supporters to join the next outreach.',
    ],
  },
};

/** Copy for a category, or a plain version built from its name and description. */
export function categoryPage(
  slug: string,
  name: string,
  description: string,
): CategoryPage {
  const page = pages[slug];
  if (page) return page;
  const phrase = name.toLowerCase();
  return {
    phrase,
    intro: [
      description ||
        `Raise money for ${phrase} with a campaign your community can share.`,
      'Donors see every fee before they pay, and the money raised goes to a wallet only the organiser can withdraw from, to a bank account in their verified name.',
    ],
    examples: [],
    tips: [
      'Say clearly what the money pays for and roughly what each part costs.',
      'Post updates as things move forward. Supporters keep sharing when they can see progress.',
      'Share the campaign in the groups closest to the cause first.',
    ],
  };
}

/** Categories that have their own written page, for the sitemap and footer. */
export const WRITTEN_CATEGORIES = Object.keys(pages);
