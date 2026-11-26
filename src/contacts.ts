export interface Contact {
  id: string
  name: string
  /** A line of context, like a job title or a note saved on the contact. */
  detail?: string
  email?: string
  phone?: string
}

/** Where contacts come from and get deleted. Google Contacts (the People API) will implement this once sign-in exists. */
export interface ContactSource {
  list(): Promise<Contact[]>
  remove(id: string): Promise<void>
}

/** Made-up people for the demo, until Google sign-in is wired up. */
export const DEMO_CONTACTS: Contact[] = [
  { id: 'c01', name: 'Agnes Okafor', detail: 'Year 9 English teacher', email: 'agnes@example.com' },
  { id: 'c02', name: 'Bao Tran', detail: 'First boss', email: 'bao@example.com' },
  { id: 'c03', name: 'Check Credit', detail: 'No details' },
  { id: 'c04', name: 'Dave Plumber', detail: 'No details' },
  { id: 'c05', name: 'Esme Hartley', detail: "Mum's friend from choir", email: 'esme@example.com' },
  { id: 'c06', name: 'Farid Rahimi', detail: 'Guest lecturer', email: 'farid@example.com' },
  { id: 'c07', name: 'Gym Induction', detail: 'No details' },
  { id: 'c08', name: 'Hana Sato', detail: 'Old flatmate', email: 'hana@example.com' },
  { id: 'c09', name: 'Ivo Marsh', detail: 'Landlord, 2019', email: 'ivo@example.com' },
  { id: 'c10', name: 'Jo Skype', detail: 'No details' },
  { id: 'c11', name: 'Kwame Boateng', detail: 'Football coach', email: 'kwame@example.com' },
  { id: 'c12', name: 'Lena Fischer', detail: 'Met at a conference', email: 'lena@example.com' },
]
