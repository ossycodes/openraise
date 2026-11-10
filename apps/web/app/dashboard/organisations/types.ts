export type OrganisationRole = 'OWNER' | 'ADMIN' | 'EDITOR' | 'FINANCE';

export const ROLE_LABEL: Record<OrganisationRole, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  EDITOR: 'Editor',
  FINANCE: 'Finance',
};

/** What each role can do, shown next to the role picker. */
export const ROLE_HINT: Record<OrganisationRole, string> = {
  OWNER: 'Everything, including managing other owners.',
  ADMIN: 'Edit the profile and manage the team, except owners.',
  EDITOR: 'Will manage the organisation’s campaigns.',
  FINANCE: 'Will see money and request withdrawals.',
};

export interface MyOrganisation {
  id: string;
  slug: string;
  name: string;
  role: OrganisationRole;
}

export interface OrganisationManage {
  organisation: {
    id: string;
    slug: string;
    name: string;
    about: string;
    website: string | null;
    location: string | null;
    createdAt: string;
  };
  myRole: OrganisationRole;
  members: {
    id: string;
    userId: string;
    name: string;
    email: string;
    role: OrganisationRole;
    joinedAt: string;
    you: boolean;
  }[];
  /** Only for owners and admins */
  invites:
    | {
        id: string;
        email: string;
        role: OrganisationRole;
        expiresAt: string;
        createdAt: string;
      }[]
    | null;
}
