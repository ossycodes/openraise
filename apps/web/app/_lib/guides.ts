/**
 * Guides for people raising money, written for this project. Plain text in
 * sections, so the pages, the sitemap and structured data share one source.
 * Fees are never written here: the "how it works" guide shows the
 * deployment's live fee settings next to the text.
 */
export interface GuideSection {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
}

export interface Guide {
  slug: string;
  title: string;
  /** One sentence for listings and search results */
  description: string;
  /** Minutes, roughly, at an easy reading pace */
  minutes: number;
  /** Show the live fee settings after the first section */
  showFees?: boolean;
  sections: GuideSection[];
  /** When the text last changed meaningfully (YYYY-MM-DD) */
  updated: string;
}

export const GUIDES: Guide[] = [
  {
    slug: 'how-crowdfunding-works',
    title: 'How fundraising works here, from start to payout',
    description:
      'Every step from creating a campaign to receiving the money, including what is checked and what it costs.',
    minutes: 5,
    showFees: true,
    updated: '2026-11-09',
    sections: [
      {
        heading: 'The short version',
        paragraphs: [
          'You create a campaign that explains who the money is for and why. Once your identity is verified and an administrator has reviewed the campaign, it goes live. People give by card, bank transfer or the other methods the payment provider offers, without needing an account. The money collects in your campaign’s wallet, and you withdraw it to a Nigerian bank account in your verified name.',
        ],
      },
      {
        heading: '1. Create your campaign',
        paragraphs: [
          'Sign in and start a campaign. Give it a clear title, a goal, a category and your story. Add photos (the first one is the cover) and, if you like, a YouTube video. Your campaign stays a private draft until you submit it, so take your time.',
        ],
      },
      {
        heading: '2. Verify your email and your identity',
        paragraphs: [
          'Before a campaign can go live or any money can be withdrawn, we need to know who is raising it. You confirm your email address, then send your ID details and a photo of your ID from the Verification page. An administrator checks it, usually by comparing the photo with what you entered.',
          'Only the last four characters of your ID number are stored, and the photo is encrypted. It is deleted on a schedule once you are verified.',
        ],
      },
      {
        heading: '3. Submit for review',
        paragraphs: [
          'When you submit, an administrator reads the campaign to make sure it is genuine and follows the rules. If something needs changing, they tell you what, and you can fix it and submit again. Once it is approved, the campaign is public and anyone with the link can give.',
        ],
      },
      {
        heading: '4. Share it',
        paragraphs: [
          'Most gifts come from people who already know you or the cause, so sharing is the work that matters most. The share button gives you ready-made links for WhatsApp, X, Facebook and LinkedIn, a share card image, and a printable poster with a QR code for noticeboards.',
        ],
      },
      {
        heading: '5. People give',
        paragraphs: [
          'Donors choose an amount and see the full breakdown before they pay: what reaches the campaign, the fees, and the total. They can give anonymously and leave a message. They get a receipt by email, and you are told about new gifts.',
        ],
      },
      {
        heading: '6. Withdraw the money',
        paragraphs: [
          'Confirmed gifts are recorded in your campaign’s wallet. When you are ready, add a Nigerian bank account and withdraw. The bank’s name for the account must match your verified name; if it legitimately differs, for example a married name, you can ask an administrator to review it.',
          'A new payout account has a 24-hour hold before withdrawals, and we email you whenever one is added, so a stolen password can’t quietly redirect the money.',
        ],
      },
      {
        heading: '7. Keep people informed',
        paragraphs: [
          'Post updates from your dashboard as things happen. Supporters who chose to follow the campaign get them by email. The campaign page also shows a public money trail: what was raised, the fees, and what has been withdrawn, without showing anyone’s bank details.',
        ],
      },
    ],
  },
  {
    slug: 'write-a-fundraising-story',
    title: 'How to write a fundraising story people want to share',
    description:
      'What to put in your campaign story, in what order, and what to leave out.',
    minutes: 4,
    updated: '2026-11-09',
    sections: [
      {
        heading: 'Start with the person, not the problem',
        paragraphs: [
          'People give to people. Open with who the money is for and one detail that makes them real: what they do, what they love, what they were working towards. Then say what happened.',
        ],
      },
      {
        heading: 'Say exactly what the money pays for',
        paragraphs: [
          'A goal is easier to trust when people can see how it adds up. Break it into parts with rough costs, for example:',
        ],
        bullets: [
          'Surgery: ₦1,200,000 (estimate from the hospital)',
          'Ten days in hospital: ₦350,000',
          'Medicine for three months: ₦150,000',
        ],
      },
      {
        heading: 'Explain your connection',
        paragraphs: [
          'If you are raising for someone else, say how you know them and that they agree to the campaign. If you are a group or an organisation, say who is responsible for the money.',
        ],
      },
      {
        heading: 'Keep the first lines strong',
        paragraphs: [
          'Most people decide in the first few seconds. Your summary and first paragraph should answer three questions: who, what happened, and what will the money change. Put the details further down for people who want them.',
        ],
      },
      {
        heading: 'Use photos that show, not shock',
        paragraphs: [
          'A clear photo of the person, the place or the project does more than a long paragraph. Avoid images that would embarrass the person you are helping, and ask before posting anyone else’s photo.',
        ],
      },
      {
        heading: 'Be honest about what you don’t know yet',
        paragraphs: [
          'If costs might change, say so, and promise an update. Supporters forgive uncertainty; they don’t forgive surprises.',
        ],
      },
      {
        heading: 'Read it out loud before you publish',
        paragraphs: [
          'Short sentences, plain words. If a sentence is hard to say, it is hard to read on a phone. Ask one friend to read it and tell you what they think the money is for. If they can’t, rewrite that part.',
        ],
      },
    ],
  },
  {
    slug: 'promote-your-fundraiser',
    title: 'How to promote your fundraiser, online and offline',
    description:
      'Where to share your campaign, in what order, and how to keep it moving after the first week.',
    minutes: 5,
    updated: '2026-11-09',
    sections: [
      {
        heading: 'Start with your closest circle',
        paragraphs: [
          'Before posting publicly, send the link personally to the people closest to the cause: family, close friends, colleagues. A few early gifts make the page look alive and make strangers more likely to give.',
          'A personal message works better than a forwarded one. Say why it matters to you, in a sentence or two, and add the link.',
        ],
      },
      {
        heading: 'Then your groups',
        paragraphs: [
          'Share in the WhatsApp groups you already belong to: family, school, church or mosque, work, estate, alumni. Ask one or two trusted people in each group to share it onwards; it means more coming from them.',
        ],
      },
      {
        heading: 'Take it offline',
        paragraphs: [
          'Many people who would give are not in your online groups. From the share button, open the printable poster: it has your campaign’s cover, progress and a QR code that opens the campaign. Ask to put it up where people meet.',
        ],
        bullets: [
          'Church and mosque noticeboards, and announcements after services',
          'Office kitchens, staff rooms and break rooms',
          'Schools, hospitals and community halls',
          'Markets and shops whose owners know the family',
        ],
      },
      {
        heading: 'Reach people further away',
        paragraphs: [
          'Friends and family abroad are often glad to help but hear about things late. Send them the link directly, and tell them they can give without an account.',
        ],
      },
      {
        heading: 'Post updates to restart the conversation',
        paragraphs: [
          'Every update is a reason to share again: a milestone reached, an appointment done, a photo of progress. Post it on the campaign, then share it in the same groups with a line of thanks.',
        ],
      },
      {
        heading: 'Thank people, publicly and personally',
        paragraphs: [
          'Thank donors as gifts come in, and thank everyone again when you reach a milestone. People who feel thanked share again. When the campaign ends, post a final update about what the money did.',
        ],
      },
    ],
  },
];

export const guide = (slug: string) => GUIDES.find((g) => g.slug === slug);
